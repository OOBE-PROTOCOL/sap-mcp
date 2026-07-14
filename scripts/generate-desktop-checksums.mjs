import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const outputDir = join(process.cwd(), 'release', 'desktop');
const checksumFile = join(outputDir, 'SHA256SUMS.txt');
const artifactExtensions = new Set(['.dmg', '.zip', '.exe', '.tar.gz']);

function hasArtifactExtension(fileName) {
  return Array.from(artifactExtensions).some((extension) => fileName.endsWith(extension));
}

const files = readdirSync(outputDir)
  .filter((fileName) => hasArtifactExtension(fileName))
  .sort((left, right) => left.localeCompare(right));

if (files.length === 0) {
  throw new Error(`No desktop artifacts found in ${outputDir}`);
}

const lines = files.map((fileName) => {
  const filePath = join(outputDir, fileName);
  const digest = createHash('sha256').update(readFileSync(filePath)).digest('hex');
  return `${digest}  ${basename(filePath)}`;
});

writeFileSync(checksumFile, `${lines.join('\n')}\n`, 'utf-8');
console.log(`Wrote ${checksumFile}`);
