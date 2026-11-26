#!/usr/bin/env node

import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, '..');
const errors = [];
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.py', '.yaml', '.yml']);

function extension(path) {
  const index = path.lastIndexOf('.');
  return index < 0 ? '' : path.slice(index).toLowerCase();
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      errors.push(`symlink is not portable: ${relative(skillDir, path)} -> ${readlinkSync(path)}`);
    } else if (stat.isDirectory()) files.push(...walk(path));
    else if (stat.isFile()) files.push(path);
  }
  return files;
}

const localPathPatterns = [
  [/\/Users\/[A-Za-z0-9._-]+\//, 'macOS user-home path'],
  [/\/home\/[A-Za-z0-9._-]+\//, 'Linux user-home path'],
  [/\/(?:private\/)?(?:tmp|var\/folders)\//, 'machine temporary path'],
  [/\/Volumes\/[A-Za-z0-9._ -]+\//, 'mounted-volume path'],
  [/[A-Za-z]:\\(?:Users|Documents|Desktop)\\/i, 'Windows machine path'],
];

for (const file of walk(skillDir)) {
  if (!textExtensions.has(extension(file))) continue;
  const source = readFileSync(file, 'utf8');
  for (const [pattern, label] of localPathPatterns) {
    if (pattern.test(source)) errors.push(`${label}: ${relative(skillDir, file)}`);
  }
}

const provenancePath = join(skillDir, 'references', 'provenance.json');
try {
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
  if (!/^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/.test(String(provenance.contractVersion || ''))) errors.push('invalid or missing provenance contractVersion');
  if (!Array.isArray(provenance.sources) || provenance.sources.length === 0) errors.push('provenance sources are missing');
  if (provenance.sources.some((source) => source.rootKey || source.files || source.sha256)) errors.push('public provenance exposes detailed maintenance metadata');
  const upstreamPath = join(skillDir, 'references', 'upstream-provenance.json');
  const upstream = JSON.parse(readFileSync(upstreamPath, 'utf8'));
  if (upstream.contractVersion !== provenance.contractVersion) errors.push('public and upstream provenance contractVersion values differ');
  if (!Array.isArray(upstream.sources) || upstream.sources.length === 0) errors.push('upstream provenance sources are missing');
} catch (error) {
  errors.push(`invalid provenance metadata: ${error.message}`);
}

for (const required of ['references/source-map.md', 'references/upstream-provenance.json', 'scripts/verify_upstreams.mjs', 'references/aqara-visual-contract.md', 'references/aqara-visual-provenance.json', 'scripts/validate_aqara_style.mjs']) {
  if (!existsSync(join(skillDir, required))) errors.push(`missing maintenance resource: ${required}`);
}

if (errors.length) {
  console.error('PORTABILITY INVALID');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const sandbox = mkdtempSync(join(tmpdir(), 'life-studio-h5-portability-'));
const portableSkill = join(sandbox, 'installed-skill');
const output = join(sandbox, 'generated-dashboard');
cpSync(skillDir, portableSkill, { recursive: true });
const commands = [
  [join(portableSkill, 'scripts', 'generate_h5.mjs'), '--output', output, '--title', 'Portable QA', '--style', 'aqara', '--scope', 'studio', '--tabs', 'home,devices,automation'],
  [join(portableSkill, 'scripts', 'validate_h5.mjs'), output],
  [join(portableSkill, 'scripts', 'validate_aqara_style.mjs'), output],
  [join(portableSkill, 'scripts', 'smoke_test_h5.mjs'), output],
  [join(portableSkill, 'scripts', 'smoke_test_tabs.mjs'), output],
];

try {
  for (const args of commands) {
    const result = spawnSync(process.execPath, args, { cwd: sandbox, encoding: 'utf8' });
    if (result.status !== 0) {
      console.error(result.stdout || '');
      console.error(result.stderr || '');
      throw new Error(`${args[0]} failed with status ${result.status}`);
    }
  }
  console.log('PORTABILITY PASS (no machine paths or symlinks; relocated Aqara-style skill generated, validated, and smoke-tested from an isolated working directory)');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
