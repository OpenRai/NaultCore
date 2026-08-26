import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import type * as ThreeNS from 'three';

type ThreeModule = typeof ThreeNS;
type LogoPhase = 'startup' | 'idle';

interface Disposable {
  dispose(): void;
}

interface OuterCubeRig {
  mesh: ThreeNS.Mesh<ThreeNS.BufferGeometry, ThreeNS.MeshStandardMaterial>;
  target: ThreeNS.Vector3;
  dir: ThreeNS.Vector3;
  seed: number;
  speed: number;
}

interface ScaledTarget {
  target: ThreeNS.WebGLRenderTarget;
  scale: number;
}

const CUBE_SIZE = 1.05;
const CUBE_GAP = 0.3;
const HALF_SPAN = (CUBE_SIZE + CUBE_GAP) / 2;
const FRUSTUM_SIZE = 6.4;
const RENDER_SCALE = 0.5;

// Six cubes arranged as an incomplete 2x2x2 "big cube": the corner closest to camera
// (along the isometric view axis) is left blank, and so is the corner directly behind it —
// which would be fully hidden anyway. That leaves exactly the 6 outer corners.
const CORNER_SIGNS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, -1], [1, -1, 1], [1, -1, -1],
  [-1, 1, 1], [-1, 1, -1], [-1, -1, 1],
];

function hexPoints(THREE: ThreeModule, radius: number): ThreeNS.Vector2[] {
  const pts: ThreeNS.Vector2[] = [];
  for (let i = 0; i <= 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push(new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * radius));
  }
  return pts;
}

class OpenRaiLogoEngine {
  private readonly renderer: ThreeNS.WebGLRenderer;
  private readonly scene: ThreeNS.Scene;
  private readonly camera: ThreeNS.OrthographicCamera;
  private readonly isoDir: ThreeNS.Vector3;
  private readonly rig: ThreeNS.Group;

  private readonly outerCubes: OuterCubeRig[] = [];
  private readonly hexRing: ThreeNS.Mesh<ThreeNS.BufferGeometry, ThreeNS.MeshStandardMaterial>;
  private readonly centerCube: ThreeNS.Mesh<ThreeNS.BufferGeometry, ThreeNS.MeshStandardMaterial>;
  private readonly centerBasePos: ThreeNS.Vector3;
  private readonly tealPoint: ThreeNS.PointLight;

  private readonly ribbonMat: ThreeNS.ShaderMaterial;
  private readonly echoMat: ThreeNS.ShaderMaterial;
  private readonly finalMat: ThreeNS.ShaderMaterial;
  private readonly blurMatH: ThreeNS.ShaderMaterial;
  private readonly blurMatV: ThreeNS.ShaderMaterial;

  private readonly quadScene: ThreeNS.Scene;
  private readonly quadMesh: ThreeNS.Mesh;
  private readonly quadCam: ThreeNS.OrthographicCamera;

  private readonly sceneRT: ThreeNS.WebGLRenderTarget;
  private readonly bloomA: ThreeNS.WebGLRenderTarget;
  private readonly bloomB: ThreeNS.WebGLRenderTarget;
  private readonly echoTargets: [ThreeNS.WebGLRenderTarget, ThreeNS.WebGLRenderTarget];
  private readonly scaledTargets: ScaledTarget[];
  private echoIndex = 0;

  private readonly disposables: Disposable[] = [];

  private phase: LogoPhase = 'startup';
  private startedAt = performance.now();
  private rafId = 0;
  private disposed = false;
  private reduceMotion = false;

  // Startup timeline (ms)
  private static readonly CUBE_STAGGER = 90;
  private static readonly CUBE_DUR = 620;
  private static readonly CUBE_FLY_DIST = 3.2;
  private static readonly RING_START = 520;
  private static readonly RING_DUR = 560;
  private static readonly CENTER_START = 760;
  private static readonly CENTER_DUR = 420;
  private static readonly RIBBON_START = 900;
  private static readonly RIBBON_DUR = 700;
  private static readonly FLASH_PEAK_T = 560;
  private static readonly IDLE_START_T = 1750;

  constructor(
    private readonly THREE: ThreeModule,
    private readonly canvas: HTMLCanvasElement,
    private readonly zone: NgZone
  ) {
    const T = this.THREE;
    // Keep the color pipeline identical to the classic (r128-era) authored look:
    // raw sRGB hex values fed straight into shaders, no automatic conversions.
    T.ColorManagement.enabled = false;

    this.renderer = new T.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = T.LinearSRGBColorSpace;
    this.disposables.push(this.renderer);

    this.scene = new T.Scene();

    // True isometric: camera on the (1,1,1) direction, orthographic.
    this.isoDir = new T.Vector3(1, 1, 1).normalize();
    this.camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.copy(this.isoDir).multiplyScalar(12);
    this.camera.lookAt(0, 0, 0);
    this.camera.up.set(0, 1, 0);

    this.scene.add(new T.AmbientLight(0x3c424b, 1.4));
    const keyLight = new T.DirectionalLight(0xeef2f5, 1.35);
    keyLight.position.set(4, 6, 3);
    this.scene.add(keyLight);
    const rimLight = new T.DirectionalLight(0x6fb8b4, 0.65);
    rimLight.position.set(-4, 2, -3);
    this.scene.add(rimLight);
    // Modern three uses physical light units; scale by PI to match legacy intensity feel.
    this.tealPoint = new T.PointLight(0x2fe0d6, 2.2 * Math.PI, 9, 2);
    this.tealPoint.position.set(0, -0.2, 1.8);
    this.scene.add(this.tealPoint);

    this.rig = new T.Group();
    this.scene.add(this.rig);

    const metalMat = new T.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.32 });
    const metalMatDark = new T.MeshStandardMaterial({ color: 0x53575d, metalness: 0.8, roughness: 0.38 });
    const ringMat = new T.MeshStandardMaterial({
      color: 0xd7dade, metalness: 0.6, roughness: 0.25, side: T.DoubleSide,
    });
    this.disposables.push(metalMat, metalMatDark, ringMat);

    const cubeGeo = new T.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    this.disposables.push(cubeGeo);

    for (let i = 0; i < CORNER_SIGNS.length; i++) {
      const s = CORNER_SIGNS[i];
      const mesh = new T.Mesh(cubeGeo, i % 2 === 0 ? metalMat : metalMatDark);
      const target = new T.Vector3(s[0] * HALF_SPAN, s[1] * HALF_SPAN, s[2] * HALF_SPAN);
      this.outerCubes.push({
        mesh,
        target,
        dir: target.clone().normalize(),
        seed: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 0.3,
      });
      mesh.position.copy(target);
      this.rig.add(mesh);
    }

    // Hex ring + small inner emblem cube, both pushed toward the camera along the isometric
    // view axis. Ortho projection means sliding along the view direction never moves an object
    // on screen — it only changes what it occludes. This keeps the badge centered over the
    // blank near corner while guaranteeing it renders in FRONT of the cube cluster.
    const hexShape = new T.Shape(hexPoints(T, 1.4));
    hexShape.holes.push(new T.Path(hexPoints(T, 1.05)));
    const ringGeo = new T.ExtrudeGeometry(hexShape, {
      depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02,
      bevelSegments: 1, curveSegments: 6,
    });
    ringGeo.translate(0, 0, -0.08);
    this.disposables.push(ringGeo);
    this.hexRing = new T.Mesh(ringGeo, ringMat);
    this.hexRing.lookAt(this.camera.position);
    this.hexRing.position.copy(this.isoDir).multiplyScalar(2.1);
    this.rig.add(this.hexRing);

    const centerGeo = new T.BoxGeometry(0.58, 0.58, 0.58);
    this.disposables.push(centerGeo);
    this.centerCube = new T.Mesh(centerGeo, metalMatDark);
    this.centerBasePos = this.isoDir.clone().multiplyScalar(2.55);
    this.centerCube.position.copy(this.centerBasePos);
    this.rig.add(this.centerCube);

    this.ribbonMat = this.buildRibbon();
    this.disposables.push(this.ribbonMat);

    // ---------- postfx: render targets + blur + composite ----------
    this.quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo = new T.PlaneGeometry(2, 2);
    this.disposables.push(quadGeo);

    this.scaledTargets = [
      { target: this.makeRT(0.85), scale: 0.85 },
      { target: this.makeRT(0.32), scale: 0.32 },
      { target: this.makeRT(0.32), scale: 0.32 },
      { target: this.makeRT(0.85), scale: 0.85 },
      { target: this.makeRT(0.85), scale: 0.85 },
    ];
    this.sceneRT = this.scaledTargets[0].target;
    this.bloomA = this.scaledTargets[1].target;
    this.bloomB = this.scaledTargets[2].target;
    this.echoTargets = [this.scaledTargets[3].target, this.scaledTargets[4].target];

    const blurUniformsH = {
      tDiffuse: { value: null },
      uDir: { value: new T.Vector2(1, 0) },
      uTexel: { value: new T.Vector2(1, 1) },
    };
    const blurUniformsV = {
      tDiffuse: { value: null },
      uDir: { value: new T.Vector2(0, 1) },
      uTexel: { value: new T.Vector2(1, 1) },
    };
    this.blurMatH = new T.ShaderMaterial({
      uniforms: blurUniformsH,
      vertexShader: BLUR_VERTEX_SHADER,
      fragmentShader: BLUR_FRAGMENT_SHADER,
    });
    this.blurMatV = new T.ShaderMaterial({
      uniforms: blurUniformsV,
      vertexShader: BLUR_VERTEX_SHADER,
      fragmentShader: BLUR_FRAGMENT_SHADER,
    });

    // Chromatic-aberration composite fused with RGB echo/ghost feedback in one pass. Decay is
    // saturation-aware so colorful pixels (the cyan ribbon) trail long while bright white
    // specular highlights decay fast and stay crisp instead of smearing into held patches.
    this.echoMat = new T.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tPrev: { value: null },
        uAberration: { value: 0.0 },
        uDecay: { value: new T.Vector3(0.86, 0.8, 0.72) },
        uHighlightDecay: { value: new T.Vector3(0.45, 0.4, 0.35) },
      },
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: ECHO_FRAGMENT_SHADER,
    });

    // Final grade: bloom added fresh each frame (never accumulated), vignette, scanlines,
    // grain, brightness/contrast, gamma.
    this.finalMat = new T.ShaderMaterial({
      uniforms: {
        tEcho: { value: null },
        tBloom: { value: null },
        uBloomStrength: { value: 0.9 },
        uTime: { value: 0.0 },
        uVignette: { value: 0.35 },
        uVignetteDark: { value: 0.82 },
        uScanline: { value: 0.035 },
        uGrain: { value: 0.028 },
        uBrightness: { value: 1.35 },
        uContrast: { value: 1.16 },
        uResolution: { value: new T.Vector2(1, 1) },
      },
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: FINAL_FRAGMENT_SHADER,
    });
    this.disposables.push(this.blurMatH, this.blurMatV, this.echoMat, this.finalMat);

    this.quadMesh = new T.Mesh(quadGeo, this.blurMatH);
    this.quadScene = new T.Scene();
    this.quadScene.add(this.quadMesh);

    this.resize();
  }

  start(reduceMotion: boolean): void {
    if (this.disposed || !this.open()) return;
    this.reduceMotion = reduceMotion;
    this.stopLoop();
    this.zone.runOutsideAngular(() => {
      if (this.reduceMotion) {
        this.phase = 'idle';
        this.settleForReducedMotion();
      } else {
        this.playIntro();
      }
      this.rafId = requestAnimationFrame(this.animate);
    });
  }

  stop(): void {
    this.stopLoop();
  }

  playIntro(): void {
    if (this.disposed || this.reduceMotion) return;
    this.startedAt = performance.now();
    this.phase = 'startup';
    if (!this.rafId && this.open()) {
      this.zone.runOutsideAngular(() => {
        this.rafId = requestAnimationFrame(this.animate);
      });
    }
  }

  resize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const baseDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    // Render the whole pipeline at reduced resolution and let the pixelated CSS upscale blow
    // each rendered pixel back up into a crisp blocky square — cuts real GPU work ~4x.
    const dpr = baseDpr * RENDER_SCALE;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.fitCamera(w / h);
    for (const entry of this.scaledTargets) {
      entry.target.setSize(
        Math.max(2, Math.floor(w * dpr * entry.scale)),
        Math.max(2, Math.floor(h * dpr * entry.scale))
      );
    }
    this.finalMat.uniforms.uResolution.value.set(w * dpr, h * dpr);
    this.blurMatH.uniforms.uTexel.value.set(1 / (w * dpr * 0.32), 1 / (h * dpr * 0.32));
    this.blurMatV.uniforms.uTexel.value.set(1 / (w * dpr * 0.32), 1 / (h * dpr * 0.32));

    // Resized textures have undefined contents — clear the echo history explicitly so no
    // garbage flashes on the frame after a resize.
    for (const rt of this.echoTargets) {
      this.renderer.setRenderTarget(rt);
      this.renderer.clear();
    }
    this.renderer.setRenderTarget(null);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    for (const d of this.disposables) d.dispose();
    this.renderer.forceContextLoss();
  }

  private open(): boolean {
    return !!this.canvas.isConnected && !this.disposed;
  }

  private stopLoop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private makeRT(scale: number): ThreeNS.WebGLRenderTarget {
    const rt = new this.THREE.WebGLRenderTarget(2, 2, {
      minFilter: this.THREE.LinearFilter,
      magFilter: this.THREE.LinearFilter,
      format: this.THREE.RGBAFormat,
    });
    this.disposables.push(rt);
    void scale;
    return rt;
  }

  private fitCamera(aspect: number): void {
    this.camera.left = -(FRUSTUM_SIZE * aspect) / 2;
    this.camera.right = (FRUSTUM_SIZE * aspect) / 2;
    this.camera.top = FRUSTUM_SIZE / 2;
    this.camera.bottom = -FRUSTUM_SIZE / 2;
    this.camera.updateProjectionMatrix();
  }

  // Bright cyan ribbon that threads IN AND OUT between the blocks: its path runs through the
  // gaps between neighbouring cubes with depth alternating toward/away from the camera at each
  // gap, so the real depth buffer weaves it over one block and under the next.
  private buildRibbon(): ThreeNS.ShaderMaterial {
    const T = this.THREE;
    const sorted = this.outerCubes.slice().sort((a, b) => {
      // Order the 6 corners by their angle around the isometric view axis (their natural
      // hexagonal order on screen).
      const refAxis = Math.abs(this.isoDir.y) < 0.9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0);
      const basisU = new T.Vector3().crossVectors(this.isoDir, refAxis).normalize();
      const basisV = new T.Vector3().crossVectors(this.isoDir, basisU).normalize();
      const angleOf = (cube: OuterCubeRig) =>
        Math.atan2(cube.target.dot(basisV), cube.target.dot(basisU));
      return angleOf(a) - angleOf(b);
    });

    const gapWaypoint = (i: number, push: number): ThreeNS.Vector3 => {
      const a = sorted[i % sorted.length].target;
      const b = sorted[(i + 1) % sorted.length].target;
      return a.clone().add(b).multiplyScalar(0.31).addScaledVector(this.isoDir, push);
    };

    const WEAVE_PUSH = 0.62;
    const gap0 = gapWaypoint(0, WEAVE_PUSH);
    const gap1 = gapWaypoint(1, -WEAVE_PUSH);
    const gap2 = gapWaypoint(2, WEAVE_PUSH);
    const gap3 = gapWaypoint(3, -WEAVE_PUSH);
    const tailStart = gap0.clone().addScaledVector(gap0.clone().sub(gap1).normalize(), 2.4);
    const tailEnd = gap3.clone().addScaledVector(gap3.clone().sub(gap2).normalize(), 2.4);

    const curve = new T.CatmullRomCurve3([tailStart, gap0, gap1, gap2, gap3, tailEnd]);
    const segments = 160;
    const width = 0.34;
    const twistTurns = 1.6;
    const frames = curve.computeFrenetFrames(segments, false);
    const samplePts = curve.getSpacedPoints(segments);

    const positions: number[] = [];
    const uvs: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const p = samplePts[i];
      const tangent = frames.tangents[i];
      const binormal = frames.binormals[i];
      const twist = (i / segments) * twistTurns * Math.PI * 2;
      const side = binormal.clone().applyAxisAngle(tangent, twist).multiplyScalar(width * 0.5);
      positions.push(
        p.x + side.x, p.y + side.y, p.z + side.z,
        p.x - side.x, p.y - side.y, p.z - side.z,
      );
      uvs.push(i / segments, 0, i / segments, 1);
    }
    const indices: number[] = [];
    for (let s = 0; s < segments; s++) {
      const a = s * 2, b = s * 2 + 1, c = a + 2, d = b + 2;
      indices.push(a, c, b, b, c, d);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    this.disposables.push(geo);

    const mat = new T.ShaderMaterial({
      side: T.DoubleSide,
      uniforms: {
        uReveal: { value: 0.0 },
        uTime: { value: 0.0 },
        uFlexAmp: { value: 0.06 },
        uColorA: { value: new T.Color(0x073a63) },
        uColorB: { value: new T.Color(0x18e9ff) },
      },
      vertexShader: RIBBON_VERTEX_SHADER,
      fragmentShader: RIBBON_FRAGMENT_SHADER,
    });
    this.rig.add(new T.Mesh(geo, mat));
    return mat;
  }

  private clamp01(t: number): number {
    return Math.min(1, Math.max(0, t));
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - this.clamp01(t), 3);
  }

  private easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const x = this.clamp01(t) - 1;
    return 1 + c3 * x * x * x + c1 * x * x;
  }

  private aberrationFlash(elapsed: number): number {
    if (elapsed < OpenRaiLogoEngine.FLASH_PEAK_T) {
      return this.lerp(0.0, 0.045, this.easeOutCubic(elapsed / OpenRaiLogoEngine.FLASH_PEAK_T));
    }
    const decay = this.clamp01((elapsed - OpenRaiLogoEngine.FLASH_PEAK_T) / 500);
    return this.lerp(0.045, 0.0016, this.easeOutCubic(decay));
  }

  private runStartup(elapsed: number): void {
    // Outer cubes fly in along their own radial direction, staggered.
    for (let i = 0; i < this.outerCubes.length; i++) {
      const cube = this.outerCubes[i];
      const delay = i * OpenRaiLogoEngine.CUBE_STAGGER;
      const e = this.easeOutBack((elapsed - delay) / OpenRaiLogoEngine.CUBE_DUR);
      cube.mesh.position.lerpVectors(
        cube.target.clone().addScaledVector(cube.dir, OpenRaiLogoEngine.CUBE_FLY_DIST),
        cube.target,
        e
      );
      const s = this.clamp01((elapsed - delay) / (OpenRaiLogoEngine.CUBE_DUR * 0.7));
      cube.mesh.scale.setScalar(this.lerp(0.35, 1.0, this.easeOutCubic(s)));
      cube.mesh.rotation.y = this.lerp(Math.PI * 0.5, 0, e);
    }

    // Hex ring: scale + spin in; center cube pop; ribbon reveal.
    const rt = this.clamp01((elapsed - OpenRaiLogoEngine.RING_START) / OpenRaiLogoEngine.RING_DUR);
    this.hexRing.scale.setScalar(Math.max(0.001, this.easeOutBack(rt)));
    this.hexRing.rotation.z = this.lerp(-Math.PI * 0.55, 0, this.easeOutCubic(rt));

    const ce = this.easeOutBack(
      this.clamp01((elapsed - OpenRaiLogoEngine.CENTER_START) / OpenRaiLogoEngine.CENTER_DUR)
    );
    this.centerCube.scale.setScalar(Math.max(0.001, ce));

    const rbt = this.clamp01(
      (elapsed - OpenRaiLogoEngine.RIBBON_START) / OpenRaiLogoEngine.RIBBON_DUR
    );
    this.ribbonMat.uniforms.uReveal.value = this.easeOutCubic(rbt);

    // Impact flash on chromatic aberration; echo kept short during the fast intro reveal.
    this.echoMat.uniforms.uAberration.value = this.aberrationFlash(elapsed);
    this.finalMat.uniforms.uBloomStrength.value = this.lerp(1.6, 0.85, this.clamp01(elapsed / 900));
    this.echoMat.uniforms.uDecay.value.set(0.3, 0.22, 0.12);

    if (elapsed >= OpenRaiLogoEngine.IDLE_START_T) {
      this.phase = 'idle';
      for (const cube of this.outerCubes) {
        cube.mesh.scale.setScalar(1);
        cube.mesh.rotation.y = 0;
      }
      this.hexRing.scale.setScalar(1);
      this.hexRing.rotation.z = 0;
      this.centerCube.scale.setScalar(1);
      this.ribbonMat.uniforms.uReveal.value = 1.0;
    }
  }

  private runIdle(now: number): void {
    const t = now * 0.001;
    // Gentle pondering sway of the whole rig — orientation drifts, camera stays fixed.
    this.rig.rotation.y = Math.sin(t * 0.35) * 0.085;
    this.rig.rotation.x = Math.sin(t * 0.27 + 1.1) * 0.035;

    for (const cube of this.outerCubes) {
      cube.mesh.position.copy(cube.target);
      cube.mesh.position.z += Math.sin(t * cube.speed + cube.seed) * 0.09;
      cube.mesh.position.y += Math.cos(t * cube.speed * 0.8 + cube.seed) * 0.04;
      cube.mesh.rotation.y = Math.sin(t * 0.4 + cube.seed) * 0.05;
    }
    this.hexRing.rotation.z = Math.sin(t * 0.22) * 0.05;
    this.centerCube.rotation.y = t * 0.25;
    this.centerCube.position.copy(this.centerBasePos);
    this.centerCube.position.y += Math.sin(t * 0.6) * 0.05;

    this.ribbonMat.uniforms.uReveal.value = 1.0;
    this.ribbonMat.uniforms.uTime.value = t;

    const breathe = Math.sin(t * 0.5) * 0.5 + 0.5;
    this.echoMat.uniforms.uAberration.value = this.lerp(0.0022, 0.0042, breathe);
    this.finalMat.uniforms.uBloomStrength.value = this.lerp(0.72, 0.95, breathe);
    this.tealPoint.intensity = this.lerp(1.7, 2.5, breathe) * Math.PI;
    // Long chromatically-decaying echo: R lingers longest, B fades fastest — the fading
    // rainbow-fringed trail behind the slow idle motion.
    this.echoMat.uniforms.uDecay.value.set(0.988, 0.975, 0.955);
  }

  private settleForReducedMotion(): void {
    this.rig.rotation.set(0, 0, 0);
    for (const cube of this.outerCubes) {
      cube.mesh.position.copy(cube.target);
      cube.mesh.scale.setScalar(1);
      cube.mesh.rotation.set(0, 0, 0);
    }
    this.hexRing.scale.setScalar(1);
    this.hexRing.rotation.set(0, 0, 0);
    this.centerCube.scale.setScalar(1);
    this.centerCube.position.copy(this.centerBasePos);
    this.ribbonMat.uniforms.uReveal.value = 1.0;
    this.ribbonMat.uniforms.uTime.value = 0;
    this.echoMat.uniforms.uAberration.value = 0;
    this.echoMat.uniforms.uDecay.value.set(0.86, 0.8, 0.72);
    this.finalMat.uniforms.uBloomStrength.value = 0.9;
    this.tealPoint.intensity = 2.2 * Math.PI;
  }

  private renderPass(material: ThreeNS.ShaderMaterial, target: ThreeNS.WebGLRenderTarget | null): void {
    this.quadMesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  private animate = (now: number): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.animate);

    if (this.phase === 'startup') {
      this.runStartup(performance.now() - this.startedAt);
    } else {
      this.runIdle(now);
    }
    this.finalMat.uniforms.uTime.value = now * 0.001;

    // Pass 1: render 3d scene.
    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.render(this.scene, this.camera);

    // Passes 2/3: blur bright scene into bloom target (two-tap ping-pong).
    this.blurMatH.uniforms.tDiffuse.value = this.sceneRT.texture;
    this.renderPass(this.blurMatH, this.bloomA);
    this.blurMatV.uniforms.tDiffuse.value = this.bloomA.texture;
    this.renderPass(this.blurMatV, this.bloomB);

    // Pass 4: chromatic-aberration + RGB-decaying echo trail (bloom excluded so glow never
    // accumulates into itself).
    const readRT = this.echoTargets[this.echoIndex];
    const writeRT = this.echoTargets[1 - this.echoIndex];
    this.echoMat.uniforms.tScene.value = this.sceneRT.texture;
    this.echoMat.uniforms.tPrev.value = readRT.texture;
    this.renderPass(this.echoMat, writeRT);
    this.echoIndex = 1 - this.echoIndex;

    // Pass 5: final grade — fresh bloom + vignette/scanlines/grain/brightness/contrast/gamma.
    this.finalMat.uniforms.tEcho.value = writeRT.texture;
    this.finalMat.uniforms.tBloom.value = this.bloomB.texture;
    this.renderPass(this.finalMat, null);
  };
}

const FULLSCREEN_VERTEX_SHADER = [
  'varying vec2 vUv;',
  'void main(){',
  '  vUv = uv;',
  '  gl_Position = vec4(position.xy, 0.0, 1.0);',
  '}',
].join('\n');

const BLUR_VERTEX_SHADER = [
  'varying vec2 vUv;',
  'void main(){ vUv = uv * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
].join('\n');

const BLUR_FRAGMENT_SHADER = [
  'uniform sampler2D tDiffuse;',
  'uniform vec2 uDir;',
  'uniform vec2 uTexel;',
  'varying vec2 vUv;',
  'void main(){',
  '  vec3 c = vec3(0.0);',
  '  float w[5];',
  '  w[0]=0.227027; w[1]=0.1945946; w[2]=0.1216216; w[3]=0.054054; w[4]=0.016216;',
  '  c += texture2D(tDiffuse, vUv).rgb * w[0];',
  '  for (int i=1; i<5; i++){',
  '    vec2 off = uDir * uTexel * float(i) * 1.6;',
  '    c += texture2D(tDiffuse, vUv + off).rgb * w[i];',
  '    c += texture2D(tDiffuse, vUv - off).rgb * w[i];',
  '  }',
  '  float lum = dot(c, vec3(0.299,0.587,0.114));',
  '  c *= smoothstep(0.35, 0.9, lum) + 0.15;',
  '  gl_FragColor = vec4(c, 1.0);',
  '}',
].join('\n');

const RIBBON_VERTEX_SHADER = [
  'uniform float uTime;',
  'uniform float uFlexAmp;',
  'varying vec2 vUv;',
  'varying vec3 vNormal;',
  'void main(){',
  '  vUv = uv;',
  '  vec3 flexed = position + normal * sin(uv.x * 16.0 - uTime * 1.7) * uFlexAmp;',
  '  vNormal = normalize(normalMatrix * normal);',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(flexed, 1.0);',
  '}',
].join('\n');

const RIBBON_FRAGMENT_SHADER = [
  'uniform float uReveal;',
  'uniform float uTime;',
  'uniform vec3 uColorA;',
  'uniform vec3 uColorB;',
  'varying vec2 vUv;',
  'varying vec3 vNormal;',
  'void main(){',
  '  if (vUv.x > uReveal) discard;',
  '  float edge = smoothstep(uReveal - 0.05, uReveal, vUv.x);',
  '  float fres = pow(1.0 - abs(vNormal.z), 2.3);',
  '  float flow = sin(vUv.x * 30.0 - uTime * 2.6) * 0.5 + 0.5;',
  '  float t = clamp(fres * 0.65 + flow * 0.5, 0.0, 1.0);',
  '  t = smoothstep(0.12, 0.88, t);',
  '  vec3 base = mix(uColorA, uColorB, t);',
  '  vec3 hot = mix(base, vec3(0.75, 1.0, 1.0), edge * 0.85);',
  '  gl_FragColor = vec4(hot, 1.0);',
  '}',
].join('\n');

const ECHO_FRAGMENT_SHADER = [
  'uniform sampler2D tScene;',
  'uniform sampler2D tPrev;',
  'uniform float uAberration;',
  'uniform vec3 uDecay;',
  'uniform vec3 uHighlightDecay;',
  'varying vec2 vUv;',
  'void main(){',
  '  vec2 centered = vUv - 0.5;',
  '  vec2 caOff = centered * uAberration;',
  '  float r = texture2D(tScene, vUv - caOff).r;',
  '  float g = texture2D(tScene, vUv).g;',
  '  float b = texture2D(tScene, vUv + caOff).b;',
  '  vec3 cur = vec3(r, g, b);',
  '  vec3 prevColor = texture2D(tPrev, vUv).rgb;',
  '  float prevLum = max(prevColor.r, max(prevColor.g, prevColor.b));',
  '  float prevChroma = prevLum - min(prevColor.r, min(prevColor.g, prevColor.b));',
  '  float whiteHighlight = smoothstep(0.55, 0.85, prevLum) * (1.0 - smoothstep(0.06, 0.22, prevChroma));',
  '  vec3 decay = mix(uDecay, uHighlightDecay, whiteHighlight);',
  '  vec3 prev = prevColor * decay;',
  '  gl_FragColor = vec4(max(cur, prev), 1.0);',
  '}',
].join('\n');

const FINAL_FRAGMENT_SHADER = [
  'uniform sampler2D tEcho;',
  'uniform sampler2D tBloom;',
  'uniform float uBloomStrength;',
  'uniform float uTime;',
  'uniform float uVignette;',
  'uniform float uVignetteDark;',
  'uniform float uScanline;',
  'uniform float uGrain;',
  'uniform float uBrightness;',
  'uniform float uContrast;',
  'uniform vec2 uResolution;',
  'varying vec2 vUv;',
  'float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1))) * 43758.5453); }',
  'void main(){',
  '  vec2 uv = vUv;',
  '  vec2 centered = uv - 0.5;',
  '  vec3 col = texture2D(tEcho, uv).rgb + texture2D(tBloom, uv).rgb * uBloomStrength;',
  '  col = (col - 0.5) * uContrast + 0.5;',
  '  col *= uBrightness;',
  '  float vig = smoothstep(uVignette, 0.85, length(centered));',
  '  col *= mix(1.0, uVignetteDark, vig);',
  '  float sl = sin(uv.y * uResolution.y * 1.15 + uTime * 6.0) * 0.5 + 0.5;',
  '  col *= 1.0 - uScanline * (sl - 0.5);',
  '  float g2 = (hash(uv * uResolution.xy + uTime * 60.0) - 0.5) * uGrain;',
  '  col += g2;',
  '  col = pow(clamp(col, 0.0, 1.0), vec3(0.68));',
  '  gl_FragColor = vec4(col, 1.0);',
  '}',
].join('\n');

@Component({
  standalone: false,
  selector: 'app-about-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./about-overlay.component.less'],
  templateUrl: './about-overlay.component.html',
})
export class AboutOverlayComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() open = false;
  @Input() version = '';
  @Output() closed = new EventEmitter<void>();
  @ViewChild('canvas') canvas?: ElementRef<HTMLCanvasElement>;

  wordmarkPlaying = signal(false);

  private engine?: OpenRaiLogoEngine;
  private enginePromise?: Promise<OpenRaiLogoEngine>;
  private wordmarkTimer?: ReturnType<typeof setTimeout>;
  private resizeObserver?: ResizeObserver;
  private readonly zone = inject(NgZone);

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(() => this.engine?.resize());
    if (this.canvas) this.resizeObserver.observe(this.canvas.nativeElement);
    if (this.open) void this.playShow();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open']) return;
    if (this.open) {
      queueMicrotask(() => void this.playShow());
    } else {
      this.engine?.stop();
      this.wordmarkPlaying.set(false);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.wordmarkTimer) clearTimeout(this.wordmarkTimer);
    this.engine?.dispose();
    this.engine = undefined;
    this.enginePromise = undefined;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.close();
  }

  close(): void {
    this.closed.emit();
  }

  replayIntro(): void {
    if (!this.open) return;
    this.replayWordmark();
    this.engine?.playIntro();
  }

  private async playShow(): Promise<void> {
    const engine = await this.ensureEngine();
    if (!this.open || !engine) return;
    this.replayWordmark();
    engine.start(this.isReducedMotion());
  }

  private ensureEngine(): Promise<OpenRaiLogoEngine | undefined> {
    if (this.engine) return Promise.resolve(this.engine);
    if (!this.canvas) return Promise.resolve(undefined);
    const canvasEl = this.canvas.nativeElement;
    this.enginePromise ??= import('three').then((THREE) => {
      const engine = new OpenRaiLogoEngine(THREE, canvasEl, this.zone);
      this.engine = engine;
      return engine;
    });
    return this.enginePromise;
  }

  private isReducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  private replayWordmark(): void {
    this.wordmarkPlaying.set(false);
    if (this.wordmarkTimer) clearTimeout(this.wordmarkTimer);
    this.wordmarkTimer = setTimeout(() => this.wordmarkPlaying.set(true), 20);
  }
}
