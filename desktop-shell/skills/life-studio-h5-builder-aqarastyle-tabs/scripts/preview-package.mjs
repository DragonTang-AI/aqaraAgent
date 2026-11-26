import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const appFiles = ['index.html','config.js','styles.css','tabs.css','i18n.js','life-bridge.js','phone-network.js','studio-runtime.js','dashboard.js','favorite-metadata.js','favorite-scenes.js','favorite-devices.js','favorite-speaker.js','space-control.js','studio-tabs-runtime.js','space-filter.js','studio-tabs.js','camera-session-provider.js','camera-webrtc-readiness.js','camera-webrtc-runtime.js'];
function runtimeInventory(runtime) {
  const top = readdirSync(runtime); assert.ok(top.every(name => appFiles.includes(name) || name === 'server.py' || name === 'assets'), 'Unexpected runtime file');
  for (const name of appFiles) assert.ok(top.includes(name), 'Missing production file');
  const files = [...appFiles];
  function walk(directory, prefix) {
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name), path = prefix + name, stat = lstatSync(file);
      assert.ok(!stat.isSymbolicLink(), 'Production asset symlink forbidden');
      assert.ok(!/(?:mock|preview|fixture|scenario|sample-camera|screenshots|test-results|qa[-_])/i.test(path), 'Preview/QA asset forbidden');
      if (stat.isDirectory()) walk(file, path + '/');
      else {
        assert.ok(['.jpg','.jpeg','.webp','.gif','.svg','.woff','.woff2','.ttf','.otf','.mp4','.webm'].includes(extname(name).toLowerCase()), 'Unsupported production asset type');
        if (extname(name).toLowerCase() === '.svg') assert.ok(!/<script\b|foreignObject|\son[a-z]+\s*=|(?:https?:|javascript:|data:)/i.test(readFileSync(file,'utf8').replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g,'')), 'Active/external SVG content forbidden');
        files.push(path);
      }
    }
  }
  if (top.includes('assets')) { const stat=lstatSync(join(runtime,'assets')); assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()); walk(join(runtime,'assets'),'assets/'); }
  return files;
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const template = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/preview-template');
export function checkScenario(data) {
  assert.equal(data.schemaVersion, '1.0');
  if (data.studioHeader) {
    assert.match(data.studioHeader.studioDid, /^mock-/);
    assert.equal(typeof data.studioHeader.studioName, 'string');
    assert.ok(['local','cloud','error'].includes(data.studioHeader.connectStatus));
    if (data.studioHeader.errorCode !== undefined) assert.ok(data.studioHeader.connectStatus === 'error' && Number.isInteger(data.studioHeader.errorCode));
  }
  for (const name of ['spaces','devices','definitions','automations','scenes']) assert.ok(Array.isArray(data[name]), name);
  const spaces = new Set();
  function walk(items) { for (const item of items) { assert.match(item.spaceId, /^mock-/); assert.equal(typeof item.name, 'string'); assert.ok(!spaces.has(item.spaceId)); spaces.add(item.spaceId); walk(item.children || []); } }
  walk(data.spaces);
  const ids = new Set();
  for (const item of data.devices) {
    assert.match(item.deviceId, /^mock-/); assert.ok(!ids.has(item.deviceId)); ids.add(item.deviceId);
    assert.equal(typeof item.deviceName,'string'); assert.equal(typeof item.state,'boolean'); assert.ok(Array.isArray(item.deviceTypesList));
    if (item.space) assert.ok(spaces.has(item.space.spaceId));
  }
  const definitions = new Set();
  for (const item of data.definitions) {
    assert.ok(ids.has(item.deviceId) && !definitions.has(item.deviceId)); definitions.add(item.deviceId);
    assert.ok(Array.isArray(item.endpoints));
    for (const endpoint of item.endpoints) { assert.ok(Number.isInteger(endpoint.endpointId)); for (const fn of endpoint.functions) { assert.equal(typeof fn.functionCode,'string'); for (const trait of fn.traits) { assert.equal(typeof trait.traitCode,'string'); assert.equal(typeof trait.parameter.readable,'boolean'); assert.equal(typeof trait.parameter.writable,'boolean'); } } }
  }
  assert.equal(definitions.size, ids.size);
  const autos = new Set();
  for (const item of data.automations) { assert.match(item.automationId,/^mock-/); assert.ok(!autos.has(item.automationId)); autos.add(item.automationId); assert.equal(typeof item.name,'string'); assert.equal(typeof item.enabled,'boolean'); if (item.space) assert.ok(spaces.has(item.space.spaceId)); }
  function scenes(items,depth=0){assert.ok(depth<=8);for(const item of items){if(item.sceneId)assert.match(item.sceneId,/^mock-/);if(item.id)assert.match(item.id,/^mock-/);if(item.automationId)assert.ok(autos.has(item.automationId));if(item.triggerNodeId)assert.match(item.triggerNodeId,/^mock-/);assert.ok(item.sceneId || item.id || item.automationId && item.triggerNodeId);assert.equal(typeof item.enabled,'boolean');if(item.children)scenes(item.children,depth+1);}}scenes(data.scenes);
}
function previewIndex(runtimeIndex, scripts) {
  const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; font-src 'self'; connect-src 'none'; base-uri 'self'; form-action 'none'; object-src 'none'";
  return runtimeIndex.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')
    .replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}"><base href="../runtime/">`)
    .replace('</head>', '<link rel="stylesheet" href="../preview/preview.css"></head>')
    .replace('</body>', '<script src="../preview/scenarios.js"></script><script src="../preview/settings.js"></script><script src="../preview/mock-studio.js"></script><script src="../preview/preview-host.js"></script><script src="../preview/preview-bootstrap.js"></script></body>');
}
export function buildPreview(root) {
  const runtime = join(root,'runtime'), preview = join(root,'preview');
  assert.ok(!existsSync(preview), 'Preview output already exists');
  cpSync(template,preview,{recursive:true,filter:file=>!['.DS_Store','__pycache__'].includes(basename(file))});
  // Preview-only role catalog exercises six-of-many ranking without seeding production favorites.
  const config=JSON.parse(readFileSync(join(runtime,'config.js'),'utf8').match(/Object\.freeze\(([\s\S]*)\);/)[1]);
  if(['male','female','senior','child'].includes(config.role)){
    const file=join(preview,'scenarios','typical.json'),data=JSON.parse(readFileSync(file,'utf8'));
    const names=['起夜照明','起床','晚安','阅读','午休','学习','亲子玩耍','温馨放松','用餐','观影'];
    data.scenes.push(...names.map((name,i)=>({sceneId:'mock-role-scene-'+i,name,enabled:true,automationId:'mock-auto-0',triggerNodeId:'mock-role-trigger-'+i})));
    writeFileSync(file,JSON.stringify(data,null,2)+'\n');
  }
  refreshPreview(root);
}
export function refreshPreview(root) {
  const runtime = join(root,'runtime'), preview = join(root,'preview');
  for(const directory of [runtime,preview])assert.ok(lstatSync(directory).isDirectory()&&!lstatSync(directory).isSymbolicLink());
  for(const name of ['index.html','settings.js','scenarios.js']) { const file=join(preview,name); if(existsSync(file))assert.ok(lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink()); }
  const scenarios = {};
  for (const name of ['typical','complex','failure']) { const data = JSON.parse(readFileSync(join(preview,'scenarios',name+'.json'),'utf8')); checkScenario(data); assert.equal(data.id,name); scenarios[name] = data; }
  writeFileSync(join(preview,'scenarios.js'), 'window.__PREVIEW_SCENARIOS__ = '+JSON.stringify(scenarios)+';\n');
  const html = readFileSync(join(runtime,'index.html'),'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)].map(match => match[1]);
  assert.ok(scripts.length && scripts.every(file => appFiles.includes(file)), 'Unexpected production script');
  writeFileSync(join(preview,'settings.js'), 'window.__PREVIEW_SETTINGS__ = '+JSON.stringify({scripts})+';\n');
  writeFileSync(join(preview,'index.html'),previewIndex(html,scripts));
  const files = runtimeInventory(runtime).map(path => ({path,sha256:hash(readFileSync(join(runtime,path)))}));
  const previewFiles = [];
  function collect(directory, prefix = '') { for (const name of readdirSync(directory).sort()) { const file=join(directory,name), path=prefix+name, stat=lstatSync(file); assert.ok(!stat.isSymbolicLink(),'Preview symlinks are forbidden'); if(stat.isDirectory())collect(file,path+'/'); else previewFiles.push({path,sha256:hash(readFileSync(file))}); } }
  collect(preview);
  const revision = hash(JSON.stringify({files,previewFiles}));
  const manifest = { formatVersion:'1.0', artifactId:'life-studio-dashboard', revision, runtime:{entry:'runtime/index.html',directory:'runtime'}, preview:{entry:'preview/index.html',canvasEntry:'preview/canvas.html',defaultScenario:'typical',scenarios:Object.keys(scenarios),protocolVersion:'1.0',contractVersion:'life-studio-preview-v1',files:previewFiles}, app:{entry:'index.html',sourceDirectory:'runtime',files} };
  writeFileSync(join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  writeFileSync(join(root,'README.txt'),'Serve this directory over HTTP on a dedicated preview origin. Canvas: preview/canvas.html. Integration entry: preview/index.html. Export only the validated runtime allowlist with export_app.mjs; never load the preview entry in an App. See the skill preview contract for the iframe protocol.\n');
}
export function validateWorkspace(root) {
  assert.deepEqual(readdirSync(root).sort(), ['README.txt','manifest.json','preview','runtime'].sort(), 'Unexpected workspace artifacts');
  for(const name of ['runtime','preview'])assert.ok(lstatSync(join(root,name)).isDirectory()&&!lstatSync(join(root,name)).isSymbolicLink());
  const manifest = JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
  assert.equal(manifest.formatVersion,'1.0'); assert.equal(manifest.runtime.directory,'runtime'); assert.equal(manifest.runtime.entry,'runtime/index.html');
  assert.equal(manifest.app.sourceDirectory,'runtime'); assert.equal(manifest.app.entry,'index.html');
  assert.deepEqual(manifest.app.files.map(item=>item.path),runtimeInventory(join(root,'runtime')));
  const runtime = join(root,'runtime');

  for (const item of manifest.app.files) { const file=join(runtime,item.path); assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink()); assert.equal(hash(readFileSync(file)),item.sha256,'Runtime changed; refresh the preview manifest'); }
  const actualPreview = [];
  function inspect(directory,prefix='') { for(const name of readdirSync(directory).sort()) { assert.ok(!/^(?:qa|tests?|screenshots|test-results|playwright-report)$/i.test(name) && !/^(?:qa[-_]|verification[-_])/i.test(name),'QA resources forbidden'); const file=join(directory,name),stat=lstatSync(file);assert.ok(!stat.isSymbolicLink(),'Preview symlink forbidden'); if(stat.isDirectory())inspect(file,prefix+name+'/');else actualPreview.push(prefix+name); } }
  inspect(join(root,'preview'));assert.deepEqual(actualPreview.sort(),manifest.preview.files.map(item=>item.path).sort(),'Unexpected preview resources');
  for(const item of manifest.preview.files) { assert.ok(!item.path.includes('..') && !item.path.startsWith('/') && !item.path.includes('\\')); const path=join(root,'preview',item.path); assert.ok(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink()); assert.equal(hash(readFileSync(path)),item.sha256,'Preview changed; refresh the manifest'); }
  assert.equal(hash(JSON.stringify({files:manifest.app.files,previewFiles:manifest.preview.files})),manifest.revision);
  assert.equal(manifest.preview.entry,'preview/index.html'); assert.equal(manifest.preview.canvasEntry,'preview/canvas.html');
  const html=readFileSync(join(runtime,'index.html'),'utf8');
  assert.ok(!/preview-host|mock-studio|__PREVIEW_|scenarios\.js/.test(appFiles.map(file=>readFileSync(join(runtime,file),'utf8')).join('\n')),'Preview code in runtime');
  const settings=JSON.parse(readFileSync(join(root,'preview/settings.js'),'utf8').replace(/^window\.__PREVIEW_SETTINGS__ = /,'').trim().replace(/;$/,''));
  const scripts=[...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)].map(match=>match[1]); assert.deepEqual(settings.scripts,scripts);
  assert.equal(readFileSync(join(root,'preview/index.html'),'utf8'),previewIndex(html,scripts),'Preview DOM drifted from runtime');
  const scenarios={}; for(const name of ['typical','complex','failure']) { const data=JSON.parse(readFileSync(join(root,'preview/scenarios',name+'.json'),'utf8')); checkScenario(data); scenarios[name]=data; }
  assert.equal(readFileSync(join(root,'preview/scenarios.js'),'utf8'),'window.__PREVIEW_SCENARIOS__ = '+JSON.stringify(scenarios)+';\n');
  return manifest;
}
