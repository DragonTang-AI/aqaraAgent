#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

function fail(message) {
  console.error(`life-studio-h5-builder-aqarastyle-tabs: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) fail(`unexpected argument ${key}`);
    const name = key.slice(2);
    if (name === 'write') { result.write = true; continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`missing value for ${key}`);
    result[name] = value; index += 1;
  }
  return result;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function directoryFiles(root, current = root) {
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...directoryFiles(root, path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort((left, right) => relative(root, left).localeCompare(relative(root, right), 'en'));
}

function contentHash(path, kind) {
  if (kind !== 'directory') return sha256(readFileSync(path));
  const lines = directoryFiles(path).map((file) => `${sha256(readFileSync(file))}  ./${relative(path, file).split(sep).join('/')}\n`).join('');
  return sha256(Buffer.from(lines));
}

function gitRevision(root) {
  const result = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function gitDirty(root, paths) {
  const result = spawnSync('git', ['-C', root, 'status', '--short', '--', ...paths], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

const args = parseArgs(process.argv.slice(2));
const skillDir = resolve(scriptDir, '..');
const builder = args.builder ? resolve(args.builder) : skillDir;
if (builder !== skillDir) fail('--builder must resolve to this merged skill directory');
const publicProvenancePath = join(skillDir, 'references', 'provenance.json');
const upstreamProvenancePath = join(skillDir, 'references', 'upstream-provenance.json');
if (!existsSync(publicProvenancePath)) fail(`missing public provenance: ${publicProvenancePath}`);
if (!existsSync(upstreamProvenancePath)) fail(`missing upstream provenance: ${upstreamProvenancePath}`);

const roots = {
  lifeIos: args['life-ios-root'] ? resolve(args['life-ios-root']) : null,
  studioDocs: args['studio-docs-root'] ? resolve(args['studio-docs-root']) : null,
  studioWebCamera: args['studio-web-root'] ? resolve(args['studio-web-root']) : null,
  rnUi: args['rn-ui-root'] ? resolve(args['rn-ui-root']) : null,
  visualReference: args['visual-reference'] ? resolve(args['visual-reference']) : null,
};

const provenance = JSON.parse(readFileSync(upstreamProvenancePath, 'utf8'));
const publicProvenance = JSON.parse(readFileSync(publicProvenancePath, 'utf8'));
if (provenance.contractVersion !== publicProvenance.contractVersion) fail('public and upstream provenance contractVersion values do not match');
const results = [];
let hasMissing = false;
let hasDrift = false;
let hasDirty = false;
let hasSkipped = false;

for (const source of provenance.sources || []) {
  if (!source.rootKey) continue;
  const root = roots[source.rootKey];
  if (!root) {
    results.push({ id: source.id, status: 'SKIPPED', detail: `no root supplied for ${source.rootKey}` }); hasSkipped = true; continue;
  }
  if (!existsSync(root)) {
    results.push({ id: source.id, status: 'MISSING', detail: 'supplied root does not exist' }); hasMissing = true; continue;
  }

  const resolvedFiles = [];
  let sourceMissing = false;
  for (const file of source.files || []) {
    const path = source.rootKey === 'visualReference' ? root : resolve(root, file.path);
    if (!existsSync(path) || (file.kind === 'directory' ? !statSync(path).isDirectory() : !statSync(path).isFile())) {
      results.push({ id: `${source.id}:${file.path}`, status: 'MISSING', detail: 'expected source is absent' }); hasMissing = true; sourceMissing = true; continue;
    }
    const actual = contentHash(path, file.kind); const status = actual === file.sha256 ? 'MATCH' : 'DRIFT';
    if (status === 'DRIFT') hasDrift = true;
    results.push({ id: `${source.id}:${file.path}`, status, detail: actual }); resolvedFiles.push({ record: file, actual });
  }
  if (sourceMissing) continue;

  if (source.rootKey !== 'visualReference') {
    const revision = gitRevision(root); if (!revision || revision !== source.revision) hasDrift = true;
    results.push({ id: `${source.id}:revision`, status: revision === source.revision ? 'MATCH' : 'DRIFT', detail: revision || 'not a Git checkout' });
    const dirty = gitDirty(root, (source.files || []).map((file) => file.path));
    if (dirty) { hasDirty = true; results.push({ id: `${source.id}:worktree`, status: 'DIRTY', detail: dirty.replaceAll('\n', '; ') }); }
    if (args.write && revision) source.revision = revision;
  }
  if (args.write) resolvedFiles.forEach(({ record, actual }) => { record.sha256 = actual; });
}

const widths = { id: Math.max(2, ...results.map((item) => item.id.length)), status: 8 };
for (const item of results) console.log(`${item.status.padEnd(widths.status)} ${item.id.padEnd(widths.id)} ${item.detail}`);

if (args.write) {
  if (hasMissing) fail('refusing provenance write because required sources are missing');
  if (hasSkipped) fail('refusing provenance write because not every recorded local source group was supplied');
  if (hasDirty) fail('refusing provenance write because tracked source paths are dirty');
  const verifiedAt = new Date().toISOString().slice(0, 10); provenance.verifiedAt = verifiedAt; publicProvenance.verifiedAt = verifiedAt;
  writeFileSync(upstreamProvenancePath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
  writeFileSync(publicProvenancePath, `${JSON.stringify(publicProvenance, null, 2)}\n`, 'utf8');
  console.log(`UPSTREAM PROVENANCE UPDATED ${relative(process.cwd(), upstreamProvenancePath)}`);
  console.log(`PUBLIC VERIFICATION DATE UPDATED ${relative(process.cwd(), publicProvenancePath)}`);
} else if (hasMissing) process.exitCode = 2;

if (hasDrift) console.log('UPSTREAM DRIFT DETECTED: review behavior before updating the embedded contract or provenance.');
else if (hasSkipped) console.log('UPSTREAM PARTIAL: supplied sources match, but one or more source groups were not audited.');
else console.log('UPSTREAM MATCH: supplied sources match the recorded provenance.');
