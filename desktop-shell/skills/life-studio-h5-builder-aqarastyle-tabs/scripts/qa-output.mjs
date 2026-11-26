import assert from 'node:assert/strict';
import { existsSync, realpathSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname, isAbsolute, relative, resolve, sep, extname } from 'node:path';
function canonical(path) {
  let parent = resolve(path); const suffix = [];
  while (!existsSync(parent)) { suffix.unshift(basename(parent)); parent = dirname(parent); }
  return resolve(realpathSync(parent), ...suffix);
}
export function assertExternalQAOutput(packageDir, output) {
  if (!output) return;
  const path = relative(canonical(packageDir), canonical(output));
  assert.ok(path && (path === '..' || path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(path)), 'QA output must be outside the generated package');
}

// Shared transport only; each profiler keeps its own assertions and browser lifecycle.
export async function startQAStaticServer(root) {
  root = resolve(root);
  const server = createServer((req, res) => {
    const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end(); return;
    }
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(file)] || 'application/octet-stream');
    res.end(readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return server;
}
