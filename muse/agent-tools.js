import crypto from 'node:crypto';
import fs from 'node:fs';
import { loadBundle } from './bundle.js';

export const agentBundle = loadBundle();
const bootstrap = fs.readFileSync(new URL('./agent-bootstrap.py', import.meta.url), 'utf8');
export function toolsRevision(monidKey = '') {
  return crypto.createHash('sha256').update(agentBundle.version).update(bootstrap).update(monidKey).digest('hex');
}

export async function installAgentTools({ instanceId, apiKey, monidKey, apiBase, appDomain, fetchImpl = fetch }) {
  async function exec(command) {
    const response = await fetchImpl(`${apiBase}/v1/instances/${instanceId}/exec`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    const result = await response.json();
    if (!response.ok || result.exit_code !== 0) {
      // Keep upstream stdout/stderr out of logs and browser error responses.
      throw new Error(`Agent tool installation failed (HTTP ${response.status}, exit ${result.exit_code ?? 'unknown'}).`);
    }
    return result.stdout;
  }
  async function write(filePath, content) {
    const response = await fetchImpl(`https://${instanceId}.${appDomain}/v1/files/content?${new URLSearchParams({ path: filePath })}`, {
      method: 'PUT', headers: { 'X-Agent37-Key': apiKey, 'Content-Type': 'text/plain; charset=utf-8' }, body: content,
    });
    if (!response.ok) throw new Error(`Could not install agent files (HTTP ${response.status}).`);
  }
  await exec('mkdir -p ~/muse/.setup && chmod 700 ~/muse/.setup');
  for (const file of agentBundle.files) {
    if (!/^[A-Za-z0-9_./-]+$/.test(file.path) || file.path.split('/').includes('..') || file.path.startsWith('/')) throw new Error('Invalid bundled skill path.');
    await write(`~/.hermes/skills/${file.path}`, file.content);
  }
  await write('~/muse/.setup/bootstrap.py', bootstrap);
  try {
    if (monidKey) await write('~/muse/.setup/monid-key.json', JSON.stringify({ api_key: monidKey }));
    const output = await exec(`python3 ~/muse/.setup/bootstrap.py ${agentBundle.monidVersion}`);
    return JSON.parse(output);
  } finally {
    // Also remove staged credentials if bootstrap could not launch.
    await exec('rm -f ~/muse/.setup/monid-key.json').catch(() => {});
  }
}
