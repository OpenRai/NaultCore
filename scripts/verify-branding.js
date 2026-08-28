const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const required = [
  'src/assets/img/naultcore-logo.png',
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

const index = read('src/index.html');
const previewIndex = read('src/index.preview.html');
for (const [name, content] of [['src/index.html', index], ['src/index.preview.html', previewIndex]]) {
  if (!content.includes('assets/img/naultcore-logo.png')) throw new Error(`${name} does not use the canonical NaultCore logo`);
  for (const reference of ['assets/favicon/favicon-16x16.png', 'assets/favicon/favicon-32x32.png', 'assets/favicon/apple-touch-icon.png', 'assets/favicon/safari-pinned-tab.svg']) {
    if (!content.includes(reference)) throw new Error(`${name} is missing favicon reference: ${reference}`);
  }
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
