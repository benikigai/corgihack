import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const BUNDLE_PATH = path.join(DIR, 'agent-bundle.json');

export function buildBundle(root) {
  const files = [];
  const skills = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.name === '__pycache__') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Skill bundles cannot include symlinks: ${absolute}`);
      if (entry.isDirectory()) { visit(absolute); continue; }
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      const content = fs.readFileSync(absolute, 'utf8');
      files.push({ path: relative, content });
      if (entry.name === 'SKILL.md') {
        const name = content.match(/^name:\s*(.+)$/m)?.[1]?.trim();
        if (!name) throw new Error(`Missing skill name: ${relative}`);
        skills.push({ name, path: relative });
      }
    }
  }
  visit(root);
  if (!skills.length) throw new Error('No Hermes skills found. Check hermes/skills.');
  const monidSkill = files.find((file) => file.path.endsWith('/monid/SKILL.md'));
  const monidVersion = monidSkill?.content.match(/^version:\s*(\d+\.\d+\.\d+)$/m)?.[1];
  if (!monidVersion) throw new Error('The official Monid skill must include its CLI version.');
  const version = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return { version, monidVersion, skills, files };
}

export function loadBundle() {
  const source = path.resolve(DIR, '..', 'hermes', 'skills');
  // Development always reads the canonical skills; the image uses the generated bundle.
  return fs.existsSync(source) ? buildBundle(source) : JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bundle = buildBundle(path.resolve(DIR, '..', 'hermes', 'skills'));
  fs.writeFileSync(BUNDLE_PATH, JSON.stringify(bundle, null, 2) + '\n');
  console.log(`Bundled ${bundle.skills.map((skill) => skill.name).join(', ')} (${bundle.files.length} files).`);
}
