const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const angular = JSON.parse(fs.readFileSync(path.join(root, 'angular.json'), 'utf8'));
const architect = angular.projects?.nault?.architect;
const targetNames = ['test-vitest', 'test-vitest-nanonyms'];

if (!architect) throw new Error('Could not find the nault Angular project.');

const toRepoPath = (filePath) => path.relative(root, filePath).split(path.sep).join('/');
const walk = (directory) => {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(entryPath));
    else files.push(entryPath);
  }
  return files;
};

const specFiles = walk(path.join(root, 'src'))
  .filter((filePath) => filePath.endsWith('.spec.ts'))
  .map(toRepoPath)
  .sort();
const specSet = new Set(specFiles);
const targets = targetNames.flatMap((name) => architect[name]?.options?.include ?? []);
const targetSet = new Set(targets);
const missingTargets = [...targetSet].filter((filePath) => !specSet.has(filePath));
const activeDeclaration = /^\s*(?:it|test)\s*\(/m;
const activeFiles = specFiles.filter((filePath) => (
  activeDeclaration.test(fs.readFileSync(path.join(root, filePath), 'utf8'))
));
const activeOutsideTargets = activeFiles.filter((filePath) => !targetSet.has(filePath));

if (missingTargets.length || activeOutsideTargets.length) {
  const lines = [];
  if (missingTargets.length) lines.push(`Missing target files:\n${missingTargets.join('\n')}`);
  if (activeOutsideTargets.length) lines.push(`Active specs outside Vitest targets:\n${activeOutsideTargets.join('\n')}`);
  throw new Error(lines.join('\n'));
}

console.log([
  `Vitest inventory verified: ${specFiles.length} spec files`,
  `${activeFiles.length} active files`,
  `${targetSet.size} distinct Vitest targets`,
  `${specFiles.length - activeFiles.length} inactive/placeholder files excluded`,
].join('; '));
