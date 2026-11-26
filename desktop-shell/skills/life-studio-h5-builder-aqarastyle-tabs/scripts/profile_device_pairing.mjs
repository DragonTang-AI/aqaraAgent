#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateWorkspace} from './preview-package.mjs';
import {assertExternalQAOutput} from './qa-output.mjs';
const args=process.argv.slice(2),root=resolve(args[0]),opt=n=>args[args.indexOf(n)+1];validateWorkspace(root);
const qa=args.includes('--screenshots')?resolve(opt('--screenshots')):null;assertExternalQAOutput(root,qa);if(qa)mkdirSync(qa,{recursive:true});
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+sep)||!existsSync(p)||!statSync(p).isFile())throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const imported=await import(args.includes('--playwright-module')?pathToFileURL(resolve(opt('--playwright-module'))).href:'playwright');
const browser=await(imported.default||imported).chromium.launch({headless:true,...(args.includes('--browser')?{executablePath:resolve(opt('--browser'))}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/preview/index.html');await page.locator('#summary-label').waitFor();
 const hasEntry=await page.evaluate(()=>__LIFE_STUDIO_DASHBOARD_CONFIG__.enableDevicePairing===true && __LIFE_STUDIO_DASHBOARD_CONFIG__.tabs.includes('devices'));
 if(!hasEntry){assert.equal(await page.locator('.directory-add-device').count(),0);console.log('PAIRING POLICY PASS: entry omitted by role/config/tab');}
 else {
  await page.locator('#tab-devices').click();await page.locator('.device-plugin-row').first().waitFor();const add=page.locator('.directory-add-device');assert.equal(await add.count(),1);
  await page.evaluate(()=>{const post=webkit.messageHandlers.nativeBridge.postMessage;window.__pairCalls=[];window.__pairMode='normal';webkit.messageHandlers.nativeBridge.postMessage=message=>{window.__pairCalls.push(message);if(message.action==='openAddDevice'&&window.__pairMode==='hold'){window.__pairHeld=message;return;}if(message.action==='openAddDevice'&&window.__pairMode==='reject'){queueMicrotask(()=>H5Invoke(message.data.onFailed,{code:-2,message:'unavailable'}));return;}post(message);};});
  await page.locator('#devices-content .directory-space').click();await page.locator('.space-filter-choice[data-space-id="mock-living"]').click();await page.locator('.space-filter-panel .directory-filter-apply').click();await page.waitForFunction(()=>document.querySelector('#devices-content .directory-body').getAttribute('aria-busy')==='false');
  await page.evaluate(()=>{window.__pairCalls=[];window.__pairMode='hold';document.querySelector('.directory-add-device').click();document.querySelector('.directory-add-device').click();});
  assert.equal(await page.evaluate(()=>__pairCalls.filter(x=>x.action==='openAddDevice').length),1);assert.equal(await add.isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>Object.keys(__pairHeld.data).sort()),['onFailed','onSuccess']);
  await page.evaluate(()=>H5Invoke(__pairHeld.data.onFailed,{code:-2,message:'unavailable'}));await page.waitForFunction(()=>!document.querySelector('.directory-add-device').disabled);assert.equal(await page.locator('.preview-pairing-panel').count(),0);
  await page.evaluate(()=>{window.__pairMode='normal';window.__pairCalls=[];});await add.click();await page.locator('.preview-pairing-panel').waitFor();assert.match(await page.locator('.preview-pairing-panel').innerText(),/模拟|Simulated/);
  assert.equal(await page.evaluate(()=>__pairCalls.filter(x=>x.action==='nativeHttpRequest').length),0,'navigation ack does not refresh data');
  await page.locator('.preview-mine-close').click();await page.waitForFunction(()=>document.querySelector('#devices-content .directory-body').getAttribute('aria-busy')==='false');
  assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('directory-add-device')),true);
  const reads=await page.evaluate(()=>__pairCalls.filter(x=>x.action==='nativeHttpRequest').map(x=>x.data));
  assert.equal(reads.filter(x=>x.url.endsWith('/devices')).length,1,'one filtered device refresh on return');assert.equal(reads.filter(x=>x.url.endsWith('/spaces')).length,1);
  assert.ok(reads.every(x=>x.url.endsWith('/devices')||x.url.endsWith('/spaces')),'return refresh excludes Home/Smart/favorites');assert.equal(reads.find(x=>x.url.endsWith('/devices')).params.spaceIds,'mock-living');
  await page.evaluate(()=>__AQARA_NATIVE_CONTEXT__.capabilities=__AQARA_NATIVE_CONTEXT__.capabilities.filter(x=>x!=='openAddDevice'));const before=await page.evaluate(()=>__pairCalls.length);await add.click();assert.equal(await page.evaluate(()=>__pairCalls.length),before);assert.match(await page.locator('#toast').innerText(),/不支持|不支援|Update/);await page.evaluate(()=>__AQARA_NATIVE_CONTEXT__.capabilities.push('openAddDevice'));
  // A Studio scope reset must dispose a held opening; its late reply cannot refresh the new scope.
  await page.evaluate(()=>{window.__pairMode='hold';document.querySelector('.directory-add-device').click();});
  await page.evaluate(()=>dispatchEvent(new Event('aqara:collection-scope-changed')));
  await page.waitForFunction(()=>document.querySelector('#devices-content .directory-body').getAttribute('aria-busy')==='false');
  await page.evaluate(()=>{window.__pairCalls=[];H5Invoke(__pairHeld.data.onSuccess,{code:0,data:{accepted:true}});});
  await page.waitForFunction(()=>!document.querySelector('.directory-add-device').disabled);
  assert.equal(await page.evaluate(()=>__pairCalls.filter(x=>x.action==='nativeHttpRequest').length),0,'late old-scope ack does not refresh');
  await page.evaluate(()=>window.__pairMode='normal');
  for(const [language,theme,width] of [['zh-CN','light',390],['zh-TW','dark',320],['en','dark',320]]){await page.setViewportSize({width,height:844});await page.evaluate(({language,theme})=>{LifeI18n.setLocale(language);document.documentElement.dataset.theme=theme;},{language,theme});assert.ok((await add.boundingBox()).width>=44);assert.ok((await add.boundingBox()).height>=44);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);if(qa)await page.screenshot({path:join(qa,`${language}-${theme}.png`)});}
  console.log('PAIRING BROWSER PASS: policy, pure payload, duplicate lock, failure, capability gating, isolated simulation, bounded return refresh, retained space, three locales/light-dark/narrow');
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await new Promise(r=>server.close(r));}
