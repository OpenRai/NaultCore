const fs = require('fs');
const path = require('path');

const outputPath = process.argv[2] || 'dist';

function read(relativePath) {
  return fs.readFileSync(path.join(outputPath, relativePath), 'utf8');
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireFile(url) {
  requireCondition(url.startsWith('/'), `Expected root-relative URL: ${url}`);
  requireCondition(fs.existsSync(path.join(outputPath, url.slice(1))), `Missing emitted asset: ${url}`);
}

const manifest = JSON.parse(read('manifest.webmanifest'));
requireCondition(manifest.id === '/', 'Manifest id must be /.');
requireCondition(manifest.scope === '/', 'Manifest scope must be /.');
requireCondition(manifest.start_url === '/?source=pwa', 'Manifest start_url must identify the PWA launch.');

const maskableIcon = manifest.icons.find(icon => icon.purpose === 'maskable' && icon.sizes === '512x512');
const standardIconSizes = new Set(manifest.icons.filter(icon => icon.purpose === 'any').map(icon => icon.sizes));
requireCondition(maskableIcon, 'Manifest requires a 512x512 maskable icon.');
requireCondition(standardIconSizes.has('192x192'), 'Manifest requires a 192x192 standard icon.');
requireCondition(standardIconSizes.has('512x512'), 'Manifest requires a 512x512 standard icon.');
manifest.icons.forEach(icon => requireFile(icon.src));

const index = read('index.html');
requireCondition(index.includes('<base href="/">'), 'Preview index must use the root base href.');
requireCondition(index.includes('rel="manifest" href="/manifest.webmanifest"'), 'Preview index must link the root manifest.');

const worker = JSON.parse(read('ngsw.json'));
requireCondition(worker.index === '/index.html', 'Service worker index must be root-scoped.');
requireCondition(worker.assetGroups.find(group => group.name === 'app')?.urls.includes('/manifest.webmanifest'), 'Service worker must precache the manifest.');
requireCondition(!JSON.stringify(worker).includes('site.webmanifest'), 'Generated service worker must not reference the retired manifest.');
for (const group of worker.dataGroups) {
  requireCondition(group.maxAge === 24 * 60 * 60 * 1000, `${group.name} cache lifetime must be one day.`);
}

console.log(`Verified PWA preview artifact: ${outputPath}`);
