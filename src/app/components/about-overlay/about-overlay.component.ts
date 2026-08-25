import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

type Point = { x: number; y: number; depth: number };
type Block = { x: number; y: number; z: number; size: number; phase: number };

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

  wordmarkPlaying = false;

  private frameId = 0;
  private wordmarkTimer?: ReturnType<typeof setTimeout>;
  private resizeObserver?: ResizeObserver;
  private reducedMotion = false;
  private animationStartedAt = 0;
  private readonly blocks: Block[] = [
    { x: -1.65, y: -1.06, z: 0.1, size: 1.15, phase: 0 },
    { x: 0, y: -1.48, z: 0.05, size: 1.45, phase: 1.7 },
    { x: 1.55, y: -1.02, z: 0.12, size: 1.32, phase: 3.4 },
    { x: -1.55, y: 0.72, z: 0.02, size: 1.18, phase: 5.1 },
    { x: 1.55, y: 0.66, z: 0.05, size: 1.18, phase: 6.8 },
    { x: 0, y: 1.55, z: -0.02, size: 1.38, phase: 8.5 },
  ];
  private readonly particles = Array.from({ length: 150 }, (_, index) => ({
    angle: (index * 2.399963) % (Math.PI * 2),
    radius: 1.8 + ((index * 37) % 100) / 100 * 5.8,
    depth: -1 + ((index * 19) % 100) / 100 * 2.5,
    speed: 0.15 + (index % 8) * 0.05,
    size: 0.5 + (index % 5) * 0.3,
    phase: index * 0.71,
  }));

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    if (this.canvas) this.resizeObserver.observe(this.canvas.nativeElement);
    if (this.open) this.startAnimation();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open']) return;
    if (this.open) {
      queueMicrotask(() => {
        this.replayWordmark();
        this.startAnimation();
      });
    } else {
      this.stopAnimation();
      this.wordmarkPlaying = false;
    }
  }

  ngOnDestroy(): void {
    this.stopAnimation();
    this.resizeObserver?.disconnect();
    if (this.wordmarkTimer) clearTimeout(this.wordmarkTimer);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.close();
  }

  close(): void {
    this.closed.emit();
  }

  private replayWordmark(): void {
    this.wordmarkPlaying = false;
    if (this.wordmarkTimer) clearTimeout(this.wordmarkTimer);
    this.wordmarkTimer = setTimeout(() => this.wordmarkPlaying = true, 20);
  }

  private startAnimation(): void {
    if (!this.open || !this.canvas) return;
    this.stopAnimation();
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.animationStartedAt = performance.now();
    this.resizeCanvas();
    this.frameId = requestAnimationFrame(this.drawFrame);
  }

  private stopAnimation(): void {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  private resizeCanvas(): void {
    const canvas = this.canvas?.nativeElement;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(bounds.width * dpr));
    canvas.height = Math.max(1, Math.round(bounds.height * dpr));
    canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private drawFrame = (now: number): void => {
    const canvas = this.canvas?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !this.open) {
      this.frameId = 0;
      return;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const elapsed = this.reducedMotion ? 2 : (now - this.animationStartedAt) * 0.001;
    const time = this.reducedMotion ? 0 : now * 0.001;
    const scale = Math.min(width / 720, height / 820);
    const centerX = width * 0.5;
    const centerY = height * 0.43;
    const rotationY = this.reducedMotion ? 0.1 : Math.sin(time * 0.42) * 0.1;
    const rotationX = this.reducedMotion ? 0.12 : 0.12 + Math.sin(time * 0.53) * 0.025;
    const idle = elapsed >= 1.75;

    ctx.clearRect(0, 0, width, height);
    const background = ctx.createRadialGradient(centerX, height * 0.38, 0, centerX, height * 0.45, Math.max(width, height) * 0.75);
    background.addColorStop(0, '#151a22');
    background.addColorStop(0.48, '#090c12');
    background.addColorStop(1, '#04050a');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    this.drawParticles(ctx, centerX, centerY, width, height, time);

    const blocks = this.blocks.map((block, index) => {
      const result = { ...block };
      if (!idle) {
        const delay = index * 0.09;
        const progress = this.clamp((elapsed - delay) / 0.62);
        const eased = this.easeOutBack(progress);
        const direction = this.normalize(block.x, block.y, block.z);
        result.x = block.x + direction.x * 3.2 * (1 - eased);
        result.y = block.y + direction.y * 3.2 * (1 - eased);
        result.z = block.z + direction.z * 3.2 * (1 - eased);
        result.size = block.size * (0.35 + 0.65 * this.easeOutCubic(this.clamp((elapsed - delay) / 0.44)));
      } else {
        result.y += Math.sin(time * 0.55 + block.phase) * 0.018;
        result.z += Math.sin(time * 0.5 + block.phase) * 0.012;
      }
      return result;
    });

    blocks.slice().sort((a, b) => a.y - b.y).forEach(block => this.drawCube(ctx, block, centerX, centerY, scale, rotationY, rotationX));

    const ribbonProgress = idle ? 1 : this.easeOutCubic(this.clamp((elapsed - 0.9) / 0.7));
    this.drawRibbon(ctx, centerX, centerY, scale, rotationY, rotationX, time, ribbonProgress);

    const ringProgress = idle ? 1 : this.easeOutBack(this.clamp((elapsed - 0.52) / 0.56));
    this.drawHexFrame(ctx, centerX, centerY, scale, rotationY, rotationX, ringProgress);

    const innerProgress = idle ? 1 : this.easeOutBack(this.clamp((elapsed - 0.76) / 0.42));
    this.drawInnerCube(ctx, centerX, centerY, scale, rotationY, rotationX, time, innerProgress);
    this.drawScanlines(ctx, width, height);

    if (!this.reducedMotion) this.frameId = requestAnimationFrame(this.drawFrame);
    else this.frameId = 0;
  };

  private drawParticles(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, width: number, height: number, time: number): void {
    ctx.save();
    ctx.translate(centerX, centerY);
    for (const particle of this.particles) {
      const angle = particle.angle + time * particle.speed * 0.08;
      const radius = particle.radius * width / 720;
      ctx.globalAlpha = 0.16 + 0.24 * (0.5 + 0.5 * Math.sin(time * 1.3 + particle.phase));
      ctx.fillStyle = '#38e1eb';
      ctx.fillRect(Math.cos(angle) * radius * 80, Math.sin(angle) * radius * 42 + particle.depth * height * 0.018, particle.size, particle.size);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawCube(ctx: CanvasRenderingContext2D, block: Block, centerX: number, centerY: number, scale: number, rotationY: number, rotationX: number): void {
    const half = block.size / 2;
    const vertices = [
      [-half, -half, -half], [half, -half, -half], [half, half, -half], [-half, half, -half],
      [-half, -half, half], [half, -half, half], [half, half, half], [-half, half, half],
    ].map(([x, y, z]) => this.project(block.x + x, block.y + y, block.z + z, centerX, centerY, scale, rotationY, rotationX));
    const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 4, 7, 3], [1, 5, 6, 2], [3, 2, 6, 7], [0, 1, 5, 4]]
      .map(indices => ({ indices, depth: indices.reduce((sum, index) => sum + vertices[index].depth, 0) }))
      .sort((a, b) => a.depth - b.depth);

    for (const [faceIndex, face] of faces.entries()) {
      const points = face.indices.map(index => vertices[index]);
      const gradient = ctx.createLinearGradient(points[0].x, points[0].y, points[2].x, points[2].y);
      gradient.addColorStop(0, faceIndex % 2 === 0 ? '#8c949f' : '#414850');
      gradient.addColorStop(1, '#171d25');
      this.polygon(ctx, points, gradient, 'rgba(202, 226, 232, 0.18)', 0.7);
    }
  }

  private drawRibbon(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, scale: number, rotationY: number, rotationX: number, time: number, progress: number): void {
    if (progress <= 0) return;
    const points: Point[] = [];
    const count = Math.max(2, Math.floor(100 * progress));
    for (let index = 0; index <= count; index++) {
      const q = index / 100 * Math.PI * 2;
      points.push(this.project(2.06 * Math.cos(q), -0.05 + 1.18 * Math.sin(q), 0.2 + 0.34 * Math.sin(2 * q + time * 0.7), centerX, centerY, scale, rotationY, rotationX));
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 24 * scale;
    ctx.shadowColor = 'rgba(34, 239, 247, 0.78)';
    const gradient = ctx.createLinearGradient(points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y);
    gradient.addColorStop(0, '#073a63');
    gradient.addColorStop(0.45, '#73fbff');
    gradient.addColorStop(1, '#11b9c9');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(5, 22 * scale);
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.stroke();
    ctx.restore();
  }

  private drawHexFrame(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, scale: number, rotationY: number, rotationX: number, progress: number): void {
    if (progress <= 0) return;
    const outer = 1.48 * progress;
    const inner = 0.83 * progress;
    const outerPoints: Point[] = [];
    const innerPoints: Point[] = [];
    for (let index = 0; index < 6; index++) {
      const angle = -Math.PI / 6 + index * Math.PI / 3;
      outerPoints.push(this.project(Math.cos(angle) * outer, Math.sin(angle) * outer, 0.53, centerX, centerY, scale, rotationY, rotationX));
      innerPoints.push(this.project(Math.cos(angle) * inner, Math.sin(angle) * inner, 0.57, centerX, centerY, scale, rotationY, rotationX));
    }
    ctx.save();
    ctx.shadowBlur = 12 * scale;
    ctx.shadowColor = 'rgba(190, 215, 228, 0.18)';
    const gradient = ctx.createLinearGradient(outerPoints[0].x, outerPoints[0].y, outerPoints[3].x, outerPoints[3].y);
    gradient.addColorStop(0, '#f4f6fa');
    gradient.addColorStop(0.45, '#cfd6e0');
    gradient.addColorStop(1, '#8d98a5');
    for (let index = 0; index < 6; index++) this.polygon(ctx, [outerPoints[index], outerPoints[(index + 1) % 6], innerPoints[(index + 1) % 6], innerPoints[index]], gradient);
    ctx.restore();
  }

  private drawInnerCube(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, scale: number, rotationY: number, rotationX: number, time: number, progress: number): void {
    this.drawCube(ctx, { x: 0, y: 0, z: 0.72, size: 1.05 * progress, phase: 0 }, centerX, centerY, scale, rotationY + time * 0.09, rotationX + time * 0.05);
  }

  private drawScanlines(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = '#68eef4';
    for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);
    ctx.restore();
  }

  private project(x: number, y: number, z: number, centerX: number, centerY: number, scale: number, rotationY: number, rotationX: number): Point {
    const rotatedX = x * Math.cos(rotationY) - z * Math.sin(rotationY);
    let rotatedZ = x * Math.sin(rotationY) + z * Math.cos(rotationY);
    const rotatedY = y * Math.cos(rotationX) - rotatedZ * Math.sin(rotationX);
    rotatedZ = y * Math.sin(rotationX) + rotatedZ * Math.cos(rotationX);
    const depth = 1 / (1 + rotatedZ * 0.11);
    return { x: centerX + rotatedX * scale * 170 * depth, y: centerY + rotatedY * scale * 170 * depth, depth };
  }

  private polygon(ctx: CanvasRenderingContext2D, points: Point[], fill: CanvasGradient | string, stroke?: string, lineWidth = 1): void {
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  private normalize(x: number, y: number, z: number): { x: number; y: number; z: number } {
    const length = Math.sqrt(x * x + y * y + z * z) || 1;
    return { x: x / length, y: y / length, z: z / length };
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private easeOutCubic(value: number): number {
    return 1 - Math.pow(1 - this.clamp(value), 3);
  }

  private easeOutBack(value: number): number {
    const t = this.clamp(value);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
}
