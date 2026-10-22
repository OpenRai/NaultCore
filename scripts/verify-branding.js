const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const required = [
  'src/assets/img/naultcore-logo.png',
  'src/assets/img/preview.png',
  'src/assets/img/preview.jpg',
  'src/assets/logo_source/naultcore-ex-3.png',
  'src/assets/favicon/favicon.ico',
  'src/assets/favicon/favicon-16x16.png',
  'src/assets/favicon/favicon-32x32.png',
  'src/assets/favicon/apple-touch-icon.png',
  'src/assets/favicon/android-chrome-192x192.png',
  'src/assets/favicon/android-chrome-512x512.png',
  'src/assets/favicon/android-chrome-maskable-512x512.png',
  'src/assets/favicon/mstile-150x150.png',
  'src/assets/favicon/safari-pinned-tab.svg',
  'src/assets/favicon/browserconfig.xml',
  'src/assets/favicon/site.webmanifest',
];

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing branding asset: ${relative}`);
}

const pngSize = (relative) => {
  const data = fs.readFileSync(path.join(root, relative));
  if (data.readUInt32BE(0) !== 0x89504e47 || data.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`Not a PNG: ${relative}`);
  return `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`;
};
const expectedSizes = {
  'src/assets/img/preview.png': '1280x640',
  'src/assets/favicon/favicon-16x16.png': '16x16',
  'src/assets/favicon/favicon-32x32.png': '32x32',
  'src/assets/favicon/apple-touch-icon.png': '180x180',
  'src/assets/favicon/android-chrome-192x192.png': '192x192',
  'src/assets/favicon/android-chrome-512x512.png': '512x512',
  'src/assets/favicon/android-chrome-maskable-512x512.png': '512x512',
  'src/assets/favicon/mstile-150x150.png': '150x150',
};
for (const [relative, expected] of Object.entries(expectedSizes)) {
  const actual = pngSize(relative);
  if (actual !== expected) throw new Error(`${relative} is ${actual}; expected ${expected}`);
}

// Leave headroom below the social preview checker's 500 KB image limit.
const socialPreview = fs.readFileSync(path.join(root, 'src/assets/img/preview.jpg'));
if (socialPreview.readUInt16BE(0) !== 0xffd8) throw new Error('Social preview must be a JPEG.');
if (socialPreview.length >= 500000) throw new Error('Social preview must remain below 500 KB.');

const index = read('src/index.html');
const previewIndex = read('src/index.preview.html');
for (const [name, content] of [['src/index.html', index], ['src/index.preview.html', previewIndex]]) {
  if (!content.includes('assets/img/naultcore-logo.png')) throw new Error(`${name} does not use the canonical NaultCore logo`);
  for (const reference of ['assets/favicon/favicon-16x16.png', 'assets/favicon/favicon-32x32.png', 'assets/favicon/apple-touch-icon.png', 'assets/favicon/safari-pinned-tab.svg']) {
    if (!content.includes(reference)) throw new Error(`${name} is missing favicon reference: ${reference}`);
  }
  // og:image must point to NaultCore's own domain, never the upstream nault.cc
  if (/og:image.*nault\.cc/.test(content)) throw new Error(`${name} og:image still references nault.cc — update to NaultCore domain`);
  // twitter:card must be present for Discord / Twitter unfurl support
  if (!content.includes('twitter:card')) throw new Error(`${name} is missing twitter:card meta tag`);
  if (!content.includes('twitter:image')) throw new Error(`${name} is missing twitter:image meta tag`);
  if (!content.includes('assets/img/preview.jpg?v=4')) throw new Error(`${name} must use the compressed social preview`);
  if ((content.match(/<h1\b/gi) || []).length !== 1) throw new Error(`${name} must provide one initial page heading`);
  const structuredData = content.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!structuredData || JSON.parse(structuredData[1])['@type'] !== 'WebApplication') throw new Error(`${name} must describe the wallet as a WebApplication`);
  // og:image:width / height must be present
  if (!content.includes('og:image:width')) throw new Error(`${name} is missing og:image:width`);
  if (!content.includes('og:image:height')) throw new Error(`${name} is missing og:image:height`);
}
for (const relative of ['src/app/welcome/welcome.component.html', 'src/app/components/receive/receive.component.css', 'src/less/components/dark-mode.less', 'src/less/components/nano-card.less']) {
  if (!read(relative).includes('naultcore-logo.png')) throw new Error(`${relative} does not use the canonical NaultCore logo`);
}

const manifest = JSON.parse(read('src/manifest.webmanifest'));
for (const icon of manifest.icons) {
  const relative = `src${icon.src}`;
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Manifest icon is missing: ${icon.src}`);
  if (pngSize(relative) !== icon.sizes) throw new Error(`Manifest size mismatch for ${icon.src}`);
}
const legacyManifest = JSON.parse(read('src/assets/favicon/site.webmanifest'));
if (legacyManifest.name !== 'NaultCore' || legacyManifest.scope !== '/') throw new Error('Legacy manifest does not retain the canonical root identity.');
for (const icon of legacyManifest.icons) {
  const relative = `src${icon.src}`;
  if (!fs.existsSync(path.join(root, relative)) || pngSize(relative) !== icon.sizes) throw new Error(`Legacy manifest icon mismatch: ${icon.src}`);
}
if (!read('src/assets/favicon/browserconfig.xml').includes('mstile-150x150.png')) throw new Error('Browserconfig is missing the canonical tile asset.');

console.log(`Branding assets verified (${required.length} files).`);
