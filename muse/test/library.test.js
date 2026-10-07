import test from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY_DIR, listLibrary, resolveLibraryFile, validLibraryName } from '../library.js';

const file = (name, modified = 1) => ({ name, type: 'file', size: 100, modified, hidden: false });
const dir = (name) => ({ name, type: 'directory', hidden: false });
const link = (name) => ({ name, type: 'symlink', hidden: false });
const read = (tree) => async (name) => {
  assert.ok(Object.hasOwn(tree, name), `Unexpected directory read: ${name}`);
  return { entries: tree[name], truncated: false };
};

test('Library includes nested campaign assets and more than ten campaigns, newest first', async () => {
  const tree = { [LIBRARY_DIR]: [file('cover.jpg', 3), link('private'), file('.hidden.png'), ...Array.from({ length: 12 }, (_, i) => dir(`campaign-${i}`))] };
  for (let i = 0; i < 12; i++) tree[`${LIBRARY_DIR}/campaign-${i}`] = [file('ad.mp4', i + 4)];
  tree[`${LIBRARY_DIR}/campaign-0`].push(dir('versions'));
  tree[`${LIBRARY_DIR}/campaign-0/versions`] = [file('final reel – launch.mp4', 50), link('key.txt')];
  const result = await listLibrary(read(tree));
  assert.equal(result.data.length, 14);
  assert.equal(result.data[0].name, 'campaign-0/versions/final reel – launch.mp4');
  assert.equal(result.truncated, false);
  assert.ok(result.data.some((entry) => entry.name === 'campaign-11/ad.mp4'));
});

test('Library reports truncation and upstream failures instead of claiming completeness', async () => {
  const tree = { [LIBRARY_DIR]: [file('a.png'), file('b.png'), dir('campaign')], [`${LIBRARY_DIR}/campaign`]: [file('c.png')] };
  assert.equal((await listLibrary(read(tree), { maxFiles: 1 })).truncated, true);
  assert.equal((await listLibrary(read(tree), { maxDirectories: 1 })).truncated, true);
  assert.equal((await listLibrary(async () => ({ entries: [], truncated: true }))).truncated, true);
  await assert.rejects(listLibrary(async () => { throw new Error('offline'); }), /offline/);
});

test('File lookup rejects path traversal, hidden files and symlink escapes', async () => {
  for (const bad of ['', '../token', '/etc/passwd', 'campaign/../token', 'campaign/.env', 'a\\b', 'a\0b', 'a//b', 'a/b/c/d/e/f/g', ['ad.png']]) {
    assert.equal(validLibraryName(bad), false, String(bad));
  }
  const tree = { [LIBRARY_DIR]: [dir('campaign'), link('secret.png'), link('outside')], [`${LIBRARY_DIR}/campaign`]: [file('ad 1.png'), link('token.txt')] };
  assert.equal(await resolveLibraryFile('campaign/ad 1.png', read(tree)), `${LIBRARY_DIR}/campaign/ad 1.png`);
  for (const name of ['secret.png', 'outside/token.txt', 'campaign/token.txt', 'campaign/missing.png']) {
    assert.equal(await resolveLibraryFile(name, read(tree)), null);
  }
});
