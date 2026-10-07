import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { toolsRevision } from '../agent-tools.js';

test('private access, callbacks, shared identity, and persistence across a restart', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-test-'));
  const secret = crypto.randomBytes(32).toString('hex');
  const password = crypto.randomBytes(24).toString('hex');
  const token = crypto.randomBytes(24).toString('hex');
  const owner = crypto.createHmac('sha256', secret).update('muse-owner').digest('hex').slice(0, 24);
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PORT: '0', DATA_DIR: dir, NODE_ENV: 'production', AGENT37_API_KEY: 'test-not-a-real-key', MONID_API_KEY: '', SESSION_SECRET: secret, MUSE_ACCESS_PASSWORD: password, PUBLIC_URL: 'https://muse.example.test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let errors = '';
    child.stderr.on('data', (chunk) => { errors += chunk; });
    base = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Startup timed out: ${errors}`)), 5000);
      child.once('exit', () => { clearTimeout(timeout); reject(new Error(`Server exited: ${errors}`)); });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/localhost:(\d+)/);
        if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  t.after(async () => { if (child && child.exitCode === null && child.signalCode === null) await stop(); await fs.rm(dir, { recursive: true, force: true }); });
  await fs.writeFile(path.join(dir, 'store.json'), JSON.stringify({ users: { [owner]: {
    state: 'ready', instanceId: 'abcdefghij', notifyTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    tools: { revision: toolsRevision(''), status: 'ready' },
    notifyUrl: 'https://muse.example.test', profile: { agentName: 'Test Muse' }, notifications: [], mainSessionId: 'a'.repeat(32),
  } } }));
  await start();
  const request = (url, options = {}) => fetch(base + url, { redirect: 'manual', ...options });
  assert.equal((await request('/healthz')).status, 200);
  assert.equal((await request('/')).headers.get('location'), '/login');
  assert.equal((await request('/api/me')).status, 401);
  assert.equal((await request('/api/me/agent', { method: 'POST' })).status, 401);
  assert.equal((await request('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const login = (value) => request('/login', { method: 'POST', body: new URLSearchParams({ password: value }) });
  assert.equal((await login('wrong')).headers.get('location'), '/login?error=1');
  const session = await login(password);
  const setCookie = session.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  const cookie = setCookie.split(';')[0];
  assert.equal((await request('/', { headers: { cookie } })).status, 200);
  const state = await (await request('/api/me', { headers: { cookie } })).json();
  assert.equal(state.profile.agentName, 'Test Muse');
  const deviceTwo = (await login(password)).headers.get('set-cookie').split(';')[0];
  assert.deepEqual(await (await request('/api/me', { headers: { cookie: deviceTwo } })).json(), state);
  assert.equal((await request('/api/me', { headers: { cookie: cookie + 'tampered' } })).status, 401);
  assert.equal((await request('/api/me/notifications/read', { method: 'POST', headers: { cookie, Origin: 'https://evil.example' } })).status, 403);
  const notice = await request('/api/notify', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ instance_id: 'abcdefghij', title: 'Persistence check', body: 'Saved through the callback.' }) });
  assert.equal(notice.status, 200);
  await stop();
  await start();
  const notices = await (await request('/api/me/notifications', { headers: { cookie } })).json();
  assert.equal(notices.data[0].title, 'Persistence check');
  assert.equal((await fs.stat(path.join(dir, 'store.json'))).mode & 0o777, 0o600);
});
