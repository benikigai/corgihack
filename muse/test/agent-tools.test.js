import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildBundle } from '../bundle.js';
import { agentBundle, installAgentTools } from '../agent-tools.js';

test('the bundle includes each Corgi skill and all product-reel supporting files', () => {
  assert.deepEqual(agentBundle.skills.map((skill) => skill.name).sort(), ['corgi-ads', 'monid', 'product-reel']);
  assert.ok(agentBundle.files.some((file) => file.path.endsWith('product-reel/scripts/check_reel.py')));
  assert.ok(agentBundle.files.some((file) => file.path.endsWith('product-reel/references/production.md')));
});

test('bundling refuses symlinks out of the skills tree', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-skills-'));
  try {
    fs.symlinkSync('/etc/hosts', path.join(dir, 'outside.txt'));
    assert.throws(() => buildBundle(dir), /symlinks/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('installation separates credentials from skills and checks the remote exit code', async () => {
  for (const shouldFail of [false, true]) {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, ...options });
      if (url.endsWith('/exec')) {
        const { command } = JSON.parse(options.body);
        assert.ok(!command.includes('test-private-monid-key'));
        const bootstrap = command.startsWith('python3 ');
        return new Response(JSON.stringify({ exit_code: bootstrap && shouldFail ? 1 : 0, stdout: bootstrap ? JSON.stringify({ monid: { authenticated: true } }) : '', stderr: 'sensitive details must not be reflected' }));
      }
      return new Response('{}');
    };
    const install = () => installAgentTools({ instanceId: 'abcdefghij', apiKey: 'server-only-key', monidKey: 'test-private-monid-key', apiBase: 'https://api.agent37.com', appDomain: 'agent37.app', fetchImpl });
    if (shouldFail) await assert.rejects(install, /exit 1/);
    else assert.equal((await install()).monid.authenticated, true);
    const writes = calls.filter((call) => call.method === 'PUT');
    const keyWrites = writes.filter((call) => call.body.includes('test-private-monid-key'));
    assert.equal(keyWrites.length, 1);
    assert.equal(new URL(keyWrites[0].url).searchParams.get('path'), '~/muse/.setup/monid-key.json');
    assert.equal(JSON.parse(calls[0].body).command, 'mkdir -p ~/muse/.setup && chmod 700 ~/muse/.setup');
    assert.equal(JSON.parse(calls.at(-1).body).command, 'rm -f ~/muse/.setup/monid-key.json');
  }
});
