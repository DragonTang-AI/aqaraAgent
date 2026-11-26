#!/usr/bin/env node
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs';import {resolve,extname,sep} from 'node:path';import {pathToFileURL} from 'node:url';import {validateWorkspace} from './preview-package.mjs';
const args=process.argv.slice(2),base=resolve(args[0]),opt=n=>args[args.indexOf(n)+1],qa=resolve(opt('--qa-output'));assert.ok(!qa.startsWith(base+sep));mkdirSync(qa,{recursive:true});
const server=createServer((req,res)=>{try{const file=resolve(base,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(base+sep)||!statSync(file).isFile())throw new Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(pathToFileURL(resolve(opt('--playwright-module'))));const browser=await chromium.launch({headless:true,executablePath:resolve(opt('--browser'))});const results=[];
try{
 const outcomes={};
 for(const mode of ['generic','child','bound','manual']){
  validateWorkspace(resolve(base,mode));const page=await browser.newPage({viewport:{width:390,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{let bridge;window.__homeCalls=[];Object.defineProperty(window,'LifeBridge',{configurable:true,get:()=>bridge,set:value=>{bridge=Object.freeze({...value,nativeHttpRequest:async req=>{window.__homeCalls.push(req);return value.nativeHttpRequest(req);}});}});});
  await page.goto('http://127.0.0.1:'+server.address().port+'/'+mode+'/preview/index.html');await page.waitForFunction(()=>document.querySelector('#app').getAttribute('aria-busy')==='false');
  const state=()=>page.evaluate(()=>({ids:[...document.querySelectorAll('#device-grid .device-card')].map(el=>el.dataset.deviceId).sort(),chips:[...document.querySelectorAll('#device-filters button')].map(el=>[el.dataset.spaceId,el.textContent]),summary:document.querySelector('#summary-label').textContent,readings:['temperature-value','humidity-value'].map(id=>document.getElementById(id).textContent),scope:StudioRuntime.getHomeSpace(),calls:__homeCalls.map(r=>({url:r.url,params:r.params}))}));
  if(mode==='manual'){
   assert.equal((await state()).calls.some(r=>r.url.endsWith('/devices')),false,'explicit unresolved room does not read whole-home devices');
   await page.locator('#device-filters [data-space-id="mock-bedroom"]').click();await page.waitForFunction(()=>document.querySelector('#app').getAttribute('aria-busy')==='false'&&StudioRuntime.getHomeSpace()==='mock-bedroom'&&document.querySelector('.device-card'));
  }
  await page.waitForFunction(()=>StudioRuntime.spaceControlIndex().complete);
  if(['bound','manual'].includes(mode)){
   const current=await state();assert.equal(current.scope,'mock-bedroom');assert.ok(current.ids.length);assert.ok(current.calls.filter(r=>r.url.endsWith('/devices')).every(r=>r.params.spaceIds==='mock-bedroom'));assert.equal(current.chips.some(([id])=>id==='*'),false);
   assert.ok(await page.locator('.device-meta>span').evaluateAll(items=>items.every(el=>el.textContent.includes('卧室'))));
  }else if(mode==='child'){
   const initial=await state();assert.equal(initial.scope,'');assert.ok(initial.ids.length,'child room starts with real devices');assert.equal(initial.chips.some(([id])=>id==='*'||id==='mock-home'),false,'child shows matched real rooms only');assert.ok(initial.calls.filter(r=>r.url.endsWith('/devices')).every(r=>!r.params.spaceIds));
   const rooms={};for(const room of ['mock-living','mock-bedroom']){const found=await page.evaluate(id=>{const el=document.querySelector('#device-filters [data-space-id="'+id+'"]');if(el)el.click();return Boolean(el);},room);assert.equal(found,true);const next=await state();assert.ok(next.ids.length<=4,'child room has at most four cards');assert.equal(next.calls.length,initial.calls.length,'child room filter has no transport side effects');assert.deepEqual(next.readings,initial.readings);rooms[room]=next.ids;}
   outcomes[mode]={initialIds:initial.ids,chips:initial.chips,rooms,queries:initial.calls.filter(r=>r.url.endsWith('/devices')).map(r=>r.params)};
   await page.evaluate(() => window.StudioHomeRefresh.refresh());await page.waitForFunction(()=>document.querySelector('#app').getAttribute('aria-busy')==='false'&&StudioRuntime.spaceControlIndex().complete);assert.equal((await state()).scope,'');
  }else{
   let initial=await state();assert.equal(initial.scope,'');assert.ok(initial.ids.length,'whole-home cards appear without tapping a room');assert.equal(await page.locator('#device-filters [data-space-id="*"]').getAttribute('aria-pressed'),'true');assert.equal(initial.chips[0][1],'我的家');assert.equal(initial.chips.filter(([id])=>id==='*'||id==='mock-home').length,1,'actual root has one whole-home entry');assert.ok(initial.calls.filter(r=>r.url.endsWith('/devices')).every(r=>!r.params.spaceIds));
   if(await page.locator('#load-more-button').isVisible()){await page.locator('#load-more-button').click();await page.waitForFunction(()=>!document.querySelector('#load-more-button').disabled||document.querySelector('#load-more-button').hidden);}
   initial=await state();const rooms={};
   for(const room of ['mock-bedroom','mock-living','mock-empty','','*']){
    // IDs can legitimately be empty for Unassigned; never reinterpret them as all-space.
    const found=await page.evaluate(room=>{const el=[...document.querySelectorAll('#device-filters button')].find(el=>el.dataset.spaceId===room);if(el)el.click();return Boolean(el);},room);assert.equal(found,true,'actual room/unassigned/all entry exists');
    const next=await state();assert.equal(next.calls.length,initial.calls.length,'local room filter has no transport side effects');assert.equal(next.summary,initial.summary);assert.deepEqual(next.readings,initial.readings,'overview remains whole-home');assert.equal(next.scope,'');rooms[room]=next.ids;
    if(room==='mock-empty')assert.equal(next.ids.length,0);
    else if(room!=='*')assert.ok(next.ids.length,'nonempty room can be selected');
   }
   outcomes[mode]={initialIds:initial.ids,chips:initial.chips,rooms,queries:initial.calls.filter(r=>r.url.endsWith('/devices')).map(r=>r.params)};
   await page.evaluate(() => window.StudioHomeRefresh.refresh());await page.waitForFunction(()=>document.querySelector('#app').getAttribute('aria-busy')==='false'&&StudioRuntime.spaceControlIndex().complete);assert.equal((await state()).scope,'');
  }
  if(mode==='child'){
   assert.equal(await page.locator('.has-device-detail-action').count(),0);await page.locator('.device-meta').first().click();assert.equal(await page.locator('.capability-sheet-layer.is-open').count(),0);
   for(const width of [390,320])for(const theme of ['light','dark']){await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:qa+'/child-'+width+'-'+theme+'.png'});}
  }
  assert.deepEqual(errors,[]);console.log('HOME BUSINESS PASS '+mode);await page.close();
 }
 assert.deepEqual(outcomes.child.queries[0],outcomes.generic.queries[0],'child and generic use the same initial whole-home device query');writeFileSync(qa+'/results.json',JSON.stringify({passed:true,outcomes},null,2));console.log('CHILD HOME PROJECTION PASS; whole-home discovery and explicit bound/manual scope preserved');
}finally{await browser.close();await new Promise(r=>server.close(r));}
