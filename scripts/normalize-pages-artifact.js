const fs = require('fs');

const file = 'dist/ngsw.json';
if (!fs.existsSync(file)) throw new Error('Missing dist/ngsw.json');

const original = JSON.parse(fs.readFileSync(file, 'utf8'));
const indexPath = typeof original.index === 'string' ? original.index : '/index.html';
const prefixMatch = indexPath.match(/^\/(.+)\/index(?:\.csr)?\.html$/);
const prefix = prefixMatch ? `/${prefixMatch[1]}/` : '';

const normalize = (value) => {
  if (typeof value === 'string' && prefix) return value.startsWith(prefix) ? `/${value.slice(prefix.length)}` : value;
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalize(entry)]));
  return value;
};

const worker = normalize(original);
worker.index = '/index.html';
fs.writeFileSync(file, `${JSON.stringify(worker, null, 2)}\n`);
console.log(`Normalized service-worker artifact from ${indexPath} to /index.html`);
