// The browser supplies only relative names within the owner's Library.
export const LIBRARY_DIR = '~/muse/library';
const MAX_DEPTH = 6;

export function validLibraryName(name) {
  if (typeof name !== 'string' || name.length > 1200 || /[\\\x00-\x1f\x7f]/.test(name)) return false;
  const parts = name.split('/');
  return parts.length <= MAX_DEPTH && parts.every((part) => part.length > 0 && part.length <= 240 && !part.startsWith('.'));
}

export async function listLibrary(readDirectory, { maxDirectories = 100, maxFiles = 2000 } = {}) {
  const queue = [''];
  const files = [];
  let visited = 0;
  let truncated = false;
  while (queue.length && visited < maxDirectories && files.length < maxFiles) {
    const prefix = queue.shift();
    const listing = await readDirectory(prefix ? `${LIBRARY_DIR}/${prefix}` : LIBRARY_DIR);
    visited++;
    truncated ||= !!listing.truncated;
    for (const entry of listing.entries) {
      if (entry.hidden || entry.name.startsWith('.') || entry.name.includes('/')) continue;
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!validLibraryName(name)) { truncated = true; continue; }
      if (entry.type === 'directory') {
        if (name.split('/').length < MAX_DEPTH) queue.push(name);
        else truncated = true;
      } else if (entry.type === 'file') {
        if (files.length === maxFiles) { truncated = true; break; }
        files.push({ name, size: entry.size, modified: entry.modified });
      }
      // Never follow symlinks: the target may be a credential outside Library.
    }
  }
  return { data: files.sort((a, b) => b.modified - a.modified), truncated: truncated || queue.length > 0 };
}

export async function resolveLibraryFile(name, readDirectory) {
  if (!validLibraryName(name)) return null;
  const parts = name.split('/');
  let directory = LIBRARY_DIR;
  for (let i = 0; i < parts.length; i++) {
    const { entries } = await readDirectory(directory);
    const entry = entries.find((item) => item.name === parts[i] && !item.hidden);
    if (!entry || entry.type !== (i === parts.length - 1 ? 'file' : 'directory')) return null;
    directory += `/${entry.name}`;
  }
  return directory;
}
