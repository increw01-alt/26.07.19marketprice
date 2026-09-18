import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'marketprice-staging-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const put = async (file, text) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  };
  await put('scripts/stage-generated.mjs', '');
  await copyFile(new URL('./stage-generated.mjs', import.meta.url), path.join(root, 'scripts/stage-generated.mjs'));
  await put('.gitignore', 'dist/\n');
  await put('stock-detail.html', 'old');
  await put('data/news.json', '{}');
  await put('scripts/source.mjs', 'original');
  git('init', '-b', 'main');
  git('config', 'user.name', 'Staging regression test');
  git('config', 'user.email', 'test@example.invalid');
  git('add', '.');
  git('commit', '-m', 'fixture');
  const run = () => spawnSync(process.execPath, ['scripts/stage-generated.mjs'], { cwd: root, encoding: 'utf8' });
  return { root, git, put, run };
}

test('stages omitted stock-detail, nested HTML and new runtime/news data without missing-path errors', async (t) => {
  const { git, put, run } = await fixture(t);
  const files = ['stock-detail.html', 'data/news.json', 'data/news/stock.json', 'data/home.json',
    'car/domestic.html', 'used-car/imported.html', 'giftcard/lotte.html', '_headers'];
  for (const file of files) await put(file, 'updated');
  await put('dist/index.html', 'ignored deployment output');
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(git('diff', '--cached', '--name-only').trim().split('\n').sort(), files.sort());
  assert.equal(git('diff', '--name-only'), '');
  git('commit', '-m', 'generated outputs');
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(run().status, 0, 'unchanged run must succeed');
});

test('rejects unexpected source changes before staging generated data', async (t) => {
  const { git, put, run } = await fixture(t);
  await put('data/news.json', 'updated');
  await put('scripts/source.mjs', 'unexpected change');
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unexpected changes.*[\s\S]*scripts\/source\.mjs/);
  assert.equal(git('diff', '--cached', '--name-only'), '');
});
