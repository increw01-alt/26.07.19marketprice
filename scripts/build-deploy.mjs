import { copyFile, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const staging = path.join(root, '.dist-build');
const backup = path.join(root, '.dist-backup');
const checkOnly = process.argv.includes('--check');
const INLINE_HASH_PLACEHOLDER = '__INLINE_SCRIPT_HASHES__';
// CSP 템플릿(플레이스홀더 보유)과 서빙본(_headers, 해시 렌더링됨)을 분리합니다.
// Cloudflare Pages 가 저장소 루트를 서빙하므로 루트 _headers 도 렌더링본이어야 하고,
// 다음 빌드가 다시 치환할 수 있도록 원본 플레이스홀더는 이 템플릿에 남습니다.
const HEADERS_TEMPLATE = '_headers.template';

const PUBLIC_FILES = [
  'index.html',
  'about.html',
  'coin.html',
  'energy.html',
  'fx.html',
  'giftcard.html',
  'hotdeal.html',
  'kosdaq.html',
  'lotto.html',
  'macro.html',
  'metal.html',
  'realestate.html',
  'shopping.html',
  'stock.html',
  '404.html',
  'robots.txt',
  'rss.xml',
  'sitemap.xml',
  '_headers',
  '_routes.json',
];

// Only JSON requested by browser code or a Pages Function belongs in the
// public data directory. Build-only state such as rss.json and sgg-codes.json
// deliberately stays outside dist.
const PUBLIC_DATA_FILES = [
  'giftcards-dept.json',
  'giftcards.json',
  'home.json',
  'hotdeals.json',
  'korea-provinces.json',
  'lotto.json',
  'lotto-recent.json',
  'markets.json',
  'news.json',
  'oil.json',
  'rates.json',
  'realestate.json',
];

const PUBLIC_DIRECTORIES = [
  {
    directory: 'assets',
    extensions: new Set(['.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2']),
  },
  { directory: 'giftcard', extensions: new Set(['.html']) },
];

const FORBIDDEN_OUTPUT_PREFIXES = [
  '.claude',
  '.git',
  '.github',
  'design-system',
  'functions',
  'scripts',
];

const normalize = (value) => value.split(path.sep).join('/');

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function assertManagedPath(target) {
  const resolved = path.resolve(target);
  const allowed = new Set([path.resolve(dist), path.resolve(staging), path.resolve(backup)]);
  if (!allowed.has(resolved) || path.dirname(resolved) !== root) {
    throw new Error(`Refusing to manage unexpected path: ${resolved}`);
  }
}

async function assertRealDirectory(target, label) {
  const info = await lstat(target);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`${label} must be a real directory, not a file or symbolic link.`);
  }
}

async function removeManagedDirectory(target) {
  assertManagedPath(target);
  if (!(await exists(target))) return;
  await assertRealDirectory(target, path.basename(target));
  await rm(target, { recursive: true, force: false });
}

async function collectDirectoryFiles(relativeDirectory, extensions, manifest) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  await assertRealDirectory(absoluteDirectory, relativeDirectory);

  async function visit(currentAbsolute, currentRelative) {
    const entries = await readdir(currentAbsolute, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(currentAbsolute, entry.name);
      const relative = normalize(path.join(currentRelative, entry.name));
      if (entry.isSymbolicLink()) {
        throw new Error(`Public source cannot be a symbolic link: ${relative}`);
      }
      if (entry.isDirectory()) {
        await visit(absolute, relative);
        continue;
      }
      if (!entry.isFile()) throw new Error(`Unsupported public source entry: ${relative}`);
      if (!extensions.has(path.extname(entry.name).toLowerCase())) {
        throw new Error(`Unexpected file type in public directory: ${relative}`);
      }
      manifest.set(relative, absolute);
    }
  }

  await visit(absoluteDirectory, relativeDirectory);
}

async function collectSourceManifest() {
  const manifest = new Map();
  for (const relative of [...PUBLIC_FILES, ...PUBLIC_DATA_FILES.map((file) => `data/${file}`)]) {
    const absolute = path.join(root, relative);
    const info = await lstat(absolute);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(`Public source must be a regular file: ${relative}`);
    }
    manifest.set(normalize(relative), absolute);
  }
  for (const { directory, extensions } of PUBLIC_DIRECTORIES) {
    await collectDirectoryFiles(directory, extensions, manifest);
  }
  return manifest;
}

async function createTransforms(manifest) {
  const hashes = new Set();
  const inlineScript = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

  for (const [relative, absolute] of manifest) {
    if (!relative.endsWith('.html')) continue;
    const html = await readFile(absolute, 'utf8');
    for (const match of html.matchAll(inlineScript)) {
      if (/\bsrc\s*=/i.test(match[1]) || !match[2].trim()) continue;
      const digest = createHash('sha256').update(match[2], 'utf8').digest('base64');
      hashes.add(`'sha256-${digest}'`);
    }
  }

  const headerSource = await readFile(path.join(root, HEADERS_TEMPLATE), 'utf8');
  if (!headerSource.includes(INLINE_HASH_PLACEHOLDER)) {
    throw new Error(`${HEADERS_TEMPLATE} is missing ${INLINE_HASH_PLACEHOLDER}.`);
  }
  const renderedHeaders = headerSource.replace(
    INLINE_HASH_PLACEHOLDER,
    [...hashes].sort().join(' ')
  );
  if (renderedHeaders.includes(INLINE_HASH_PLACEHOLDER)) {
    throw new Error('Inline CSP hash placeholder was not fully rendered.');
  }

  return new Map([['_headers', Buffer.from(renderedHeaders, 'utf8')]]);
}

function expectedDirectories(manifest) {
  const directories = new Set();
  for (const relative of manifest.keys()) {
    let parent = path.posix.dirname(relative);
    while (parent !== '.') {
      directories.add(parent);
      parent = path.posix.dirname(parent);
    }
  }
  return directories;
}

async function inspectOutput(outputDirectory) {
  await assertRealDirectory(outputDirectory, normalize(path.relative(root, outputDirectory)) || 'output');
  const files = new Set();
  const directories = new Set();

  async function visit(currentAbsolute, currentRelative = '') {
    const entries = await readdir(currentAbsolute, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(currentAbsolute, entry.name);
      const relative = normalize(path.join(currentRelative, entry.name));
      if (entry.isSymbolicLink()) throw new Error(`Deploy output contains a symbolic link: ${relative}`);
      if (entry.isDirectory()) {
        directories.add(relative);
        await visit(absolute, relative);
      } else if (entry.isFile()) {
        files.add(relative);
      } else {
        throw new Error(`Deploy output contains an unsupported entry: ${relative}`);
      }
    }
  }

  await visit(outputDirectory);
  return { files, directories };
}

function sortedDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

async function validateOutput(outputDirectory, manifest, transforms) {
  const { files, directories } = await inspectOutput(outputDirectory);
  const wantedFiles = new Set(manifest.keys());
  const wantedDirectories = expectedDirectories(manifest);
  const missingFiles = sortedDifference(wantedFiles, files);
  const extraFiles = sortedDifference(files, wantedFiles);
  const extraDirectories = sortedDifference(directories, wantedDirectories);

  if (missingFiles.length || extraFiles.length || extraDirectories.length) {
    const details = [
      missingFiles.length ? `missing files: ${missingFiles.join(', ')}` : '',
      extraFiles.length ? `unexpected files: ${extraFiles.join(', ')}` : '',
      extraDirectories.length ? `unexpected directories: ${extraDirectories.join(', ')}` : '',
    ].filter(Boolean);
    throw new Error(`Deploy allowlist validation failed (${details.join('; ')}).`);
  }

  for (const relative of files) {
    const firstSegment = relative.split('/')[0];
    const lower = relative.toLowerCase();
    if (
      FORBIDDEN_OUTPUT_PREFIXES.includes(firstSegment) ||
      lower.endsWith('.md') ||
      lower.endsWith('.sql') ||
      lower.endsWith('.mjs')
    ) {
      throw new Error(`Forbidden path reached deploy output: ${relative}`);
    }

    const [source, deployed] = await Promise.all([
      transforms.get(relative) || readFile(manifest.get(relative)),
      readFile(path.join(outputDirectory, relative)),
    ]);
    if (!source.equals(deployed)) throw new Error(`Deploy output is stale or modified: ${relative}`);
  }

  return files.size;
}

async function copyManifest(manifest, outputDirectory, transforms) {
  for (const [relative, source] of manifest) {
    const destination = path.join(outputDirectory, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    const transformed = transforms.get(relative);
    if (transformed) await writeFile(destination, transformed);
    else await copyFile(source, destination);
  }
}

async function buildRuntimeData() {
  const script = path.join(root, 'scripts', 'build-runtime-data.mjs');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Runtime data build was terminated by ${signal}.`));
      } else if (code !== 0) {
        reject(new Error(`Runtime data build failed with exit code ${code}.`));
      } else {
        resolve();
      }
    });
  });
}

async function restoreInterruptedBuild() {
  if (!(await exists(backup))) return;
  await assertRealDirectory(backup, '.dist-backup');
  if (await exists(dist)) {
    await assertRealDirectory(dist, 'dist');
    await removeManagedDirectory(backup);
  } else {
    await rename(backup, dist);
  }
}

async function build(manifest, transforms) {
  await restoreInterruptedBuild();
  await removeManagedDirectory(staging);
  await mkdir(staging);

  try {
    await copyManifest(manifest, staging, transforms);
    await validateOutput(staging, manifest, transforms);

    let previousMoved = false;
    try {
      if (await exists(dist)) {
        await assertRealDirectory(dist, 'dist');
        await rename(dist, backup);
        previousMoved = true;
      }
      await rename(staging, dist);
      const count = await validateOutput(dist, manifest, transforms);
      if (previousMoved) await removeManagedDirectory(backup);
      return count;
    } catch (error) {
      if (await exists(dist)) await removeManagedDirectory(dist);
      if (previousMoved && (await exists(backup))) await rename(backup, dist);
      throw error;
    }
  } finally {
    await removeManagedDirectory(staging);
  }
}

// Cloudflare Pages compiles this project-root directory separately. It must
// never be copied into the static output directory.
await assertRealDirectory(path.join(root, 'functions'), 'functions');
if (!checkOnly) await restoreInterruptedBuild();
await buildRuntimeData();
const manifest = await collectSourceManifest();
const transforms = await createTransforms(manifest);

// 루트 _headers 동기화 — Pages 가 루트를 서빙하므로 루트에도 렌더링본이 있어야 합니다.
// 빌드 모드는 새로 써 넣고, 검증 모드는 어긋남(인라인 스크립트 변경 등)을 잡아냅니다.
const rootHeadersPath = path.join(root, '_headers');
const renderedHeaders = transforms.get('_headers');
if (checkOnly) {
  const current = await readFile(rootHeadersPath);
  if (!current.equals(renderedHeaders)) {
    throw new Error('루트 _headers 가 템플릿 렌더링 결과와 다릅니다 — build-deploy 를 다시 실행하세요.');
  }
} else {
  await writeFile(rootHeadersPath, renderedHeaders);
}

if (checkOnly) {
  const count = await validateOutput(dist, manifest, transforms);
  console.log(`Deploy output is current and allowlisted (${count} files).`);
} else {
  const count = await build(manifest, transforms);
  console.log(`Built allowlisted Cloudflare Pages output in dist (${count} files).`);
}
