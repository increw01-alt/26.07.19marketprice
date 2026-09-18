import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
});
const names = (output) => output.split('\0').filter(Boolean);
const generated = (file) =>
  /^data\/(?:[^/]+\/)*[^/]+\.json$/.test(file) ||
  /^[^/]+\.html$/.test(file) ||
  /^(?:giftcard|car|used-car)\/[^/]+\.html$/.test(file) ||
  ['_headers', 'rss.xml', 'sitemap.xml'].includes(file);

// Run only in the clean CI checkout after collecting and building data.
// Discover outputs instead of maintaining a second, incomplete HTML filename list.
const changed = [...new Set([
  ...names(git('diff', '--name-only', '-z', 'HEAD', '--')),
  ...names(git('ls-files', '--others', '--exclude-standard', '-z')),
])];
const unexpected = changed.filter((file) => !generated(file));
if (unexpected.length) {
  throw new Error(`Unexpected changes outside generated outputs:\n${unexpected.join('\n')}`);
}
if (changed.length) git('add', '-A', '--', ...changed);
const remaining = names(git('diff', '--name-only', '-z', '--'));
if (remaining.length) {
  throw new Error(`Unstaged build outputs remain:\n${remaining.join('\n')}`);
}
console.log(`Staged ${changed.length} generated files; no unstaged changes remain.`);
