#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
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
 const page=await browser.newPage({viewport:{width:390,height:1000}}),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
 // Test-only fixtures stay in browser interception, never in delivered runtime or preview assets.
 await page.route('**/scenarios.js',async route=>{const response=await route.fetch();const patch=`;{const data=window.__PREVIEW_SCENARIOS__.typical;data.metadata={favoriteDevices:[['mock-device-0',1],['mock-device-2',1],['mock-fav-offline-light',1],['mock-hvac-0',1],['mock-favorite-speaker',4],['mock-favorite-speaker',5]].map(([did,endpointId])=>({did,endpointId:String(endpointId)})),favoriteScenes:data.scenes.slice(0,2).map(s=>s.sceneId)};}`;await route.fulfill({response,body:(await response.text())+patch});});
 await page.goto('http://127.0.0.1:'+server.address().port+'/preview/index.html');
 await page.waitForFunction(()=>document.querySelector('#app').getAttribute('aria-busy')==='false'&&(!window.__LIFE_STUDIO_DASHBOARD_CONFIG__.homeModules.includes('spaceControl')||StudioRuntime.spaceControlIndex().complete));
 const automatic=await page.evaluate(()=>['senior','child'].includes(__LIFE_STUDIO_DASHBOARD_CONFIG__.role));
 const favorites=await page.evaluate(()=>document.documentElement.dataset.homeDeviceMode==='favorites');
 if(favorites&&automatic){await page.waitForFunction(()=>StudioRuntime.favoriteDeviceIndex().settled);assert.ok(await page.locator('.fd-card').count()<=3);}else if(favorites)await page.locator('.fd-speaker-card').first().waitFor();
 for(const width of [320,375,390,430])for(const theme of ['light','dark'])for(const locale of ['zh-CN','zh-TW','en']){
  await page.setViewportSize({width,height:1000});await page.evaluate(({theme,locale})=>{document.documentElement.dataset.theme=theme;LifeI18n.setLocale(locale);},{theme,locale});
  for(const scope of (await page.locator('#space-control-section').isVisible()?['*','mock-living']:[])){
   await page.locator('#space-control-tabs [data-space-room="'+scope+'"]').click();
   const summary=await page.evaluate(()=>[...document.querySelectorAll('.space-summary-card')].map(card=>{card.querySelector('strong').textContent='超长空间名称 Living room lighting '.repeat(4);const r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};return {c:r(card),icon:r(card.querySelector('.space-category-icon')),copy:r(card.querySelector('.space-summary-copy')),actions:[...card.querySelectorAll('.space-circle-action')].map(r),chips:card.querySelector('.space-stat-chips')?r(card.querySelector('.space-stat-chips')):null};}));
   assert.equal(summary.length,3);for(const {c,icon,copy,actions,chips} of summary){assert.equal(c.height,width<=350?(scope==='*'?268:216):(scope==='*'?204:160));assert.equal(copy.height,52);for(const a of actions){assert.ok(a.width>=52&&a.height>=52);assert.ok(a.x>=c.x&&a.right<=c.right&&a.y>=c.y&&a.bottom<=copy.y);assert.ok(width<=350?a.y>=icon.bottom+8:a.x>=icon.right+8);}if(chips)assert.ok(chips.y>=copy.bottom&&chips.bottom<=c.bottom);}
   await page.locator('.space-summary-card[data-space-category="shade"] .space-summary-copy').click();await page.locator('.space-detail').waitFor();assert.equal(await page.locator('.space-detail footer button').count(),3);assert.equal(await page.locator('.space-detail').evaluate(el=>el.scrollWidth<=el.clientWidth),true);await page.locator('.space-detail-back').click();
  }
  const metrics=await page.evaluate(()=>{
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
   const overlap=(a,b)=>a.x<b.right&&b.x<a.right&&a.y<b.bottom&&b.y<a.bottom;
   const cards=[...document.querySelectorAll('.fd-card:not(.fd-speaker-card),.device-card')].filter(el=>el.getClientRects().length).map(card=>{const icon=card.querySelector('.fd-icon-slot,.device-icon'),action=card.querySelector('.fd-action,.device-row>.device-toggle'),copy=card.querySelector('.fd-copy,.device-meta');const c=rect(card),i=icon?rect(icon):null,a=action?rect(action):null,t=copy?rect(copy):null;return {c,i,a,t,small:card.classList.contains('aqara-size-s'),bad:!!(i&&a&&!card.classList.contains('aqara-size-s')&&overlap(i,a))};});
   return {overflow:document.documentElement.scrollWidth>innerWidth,cards,name:parseFloat(getComputedStyle(document.querySelector('.fd-copy strong,.device-meta strong')).fontSize),tab:parseFloat(getComputedStyle(document.querySelector('#studio-tabbar button')).fontSize),columns:getComputedStyle(document.querySelector('.favorite-devices-grid')).gridTemplateColumns};
  });assert.equal(metrics.overflow,false);for(let i=0;i<metrics.cards.length;i++)for(let j=i+1;j<metrics.cards.length;j++){const a=metrics.cards[i].c,b=metrics.cards[j].c;assert.ok(a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1,'neighbor cards do not overlap');}assert.equal(metrics.name,20);assert.equal(metrics.tab,15);for(const card of metrics.cards){assert.equal(card.bad,false,'icon and action do not overlap');if(card.t)assert.ok(card.t.bottom<=card.c.bottom+1,'copy stays in card');}
  if(favorites){assert.equal(metrics.columns.split(' ').length,width<=350?1:2);for(const speaker of await page.locator('.fd-speaker-card').all())assert.equal(await speaker.evaluate(el=>el.scrollWidth<=el.clientWidth),true);}
  // Actual native-like data rows and both selection editors: long text and cancel must stay bounded.
  for(const tab of ['devices','automation']){if(!await page.locator('#tab-'+tab).count())continue;await page.locator('#tab-'+tab).click();await page.locator('#'+(tab==='devices'?'devices':'automation')+'-panel .directory-row').first().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  if(await page.locator('#tab-home').isVisible())await page.locator('#tab-home').click();
  for(const [open,editor,row] of [['#scene-edit','.favorite-editor','.favorite-choice'],...(favorites?[['#favorite-devices-edit','.fd-editor','.fd-choice']]:[])]){
   if(!await page.locator(open).isVisible()){assert.equal(await page.locator(open).isDisabled(),true);continue;}
   await page.locator(open).click();await page.locator(row).first().waitFor();
   const before=await page.locator(row).first().getAttribute('aria-checked');await page.locator(row).first().click();
   const geometry=await page.locator(editor).evaluate(el=>{const b=el.querySelector('header button').getBoundingClientRect(),r=el.querySelector('button[class*="choice"]').getBoundingClientRect();return {width:b.width,height:b.height,row:r.height,overflow:el.scrollWidth>el.clientWidth};});assert.ok(geometry.width>=52&&geometry.height>=52&&geometry.row>=92);assert.equal(geometry.overflow,false);
   await page.locator(editor+' header button').click();assert.equal(await page.locator(editor).count(),0);if(!await page.locator(open).isVisible()){assert.equal(await page.locator(open).isDisabled(),true);continue;}
   await page.locator(open).click();await page.locator(row).first().waitFor();assert.equal(await page.locator(row).first().getAttribute('aria-checked'),before,'cancel discards draft');await page.locator(editor+' header button').click();
  }
  // Stress text and each visual feedback state without changing real state/control adapters.
  await page.evaluate(()=>{document.querySelectorAll('.fd-copy strong,.fd-speaker-entry strong,.device-meta strong,.favorite-scene-name').forEach(el=>el.textContent='超长设备和场景名称 Living room accessory '.repeat(4));});
  const scene=page.locator('.favorite-scene').first();if(await scene.count()){
   const baseline=await scene.boundingBox();for(const state of ['pending','success','failed']){await scene.evaluate((el,state)=>{el.setAttribute('aria-busy',String(state==='pending'));const icon=el.querySelector('.favorite-scene-status');icon.className='favorite-scene-status'+(state==='success'?' is-success':'');},state);assert.deepEqual(await scene.boundingBox(),baseline,'scene feedback reserves stable bounds');}
  }
  if(qa&&locale==='en'){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(qa,theme+'-'+width+'-top.png')});await page.locator(favorites?'#favorite-devices-section':'#device-section').scrollIntoViewIfNeeded();await page.screenshot({path:join(qa,theme+'-'+width+'-cards.png')});if(await page.locator('#space-control-section').isVisible()){await page.locator('#space-control-section').scrollIntoViewIfNeeded();await page.screenshot({path:join(qa,theme+'-'+width+'-space.png')});}}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);results.push({width,theme,locale,passed:true});if(locale==='en')console.log('LAYOUT '+width+' '+theme+' PASS');
 }

 if(favorites&&!automatic){
  await page.evaluate(()=>{window.__sizingWrites=[];const old=LifeBridge;window.LifeBridge=Object.freeze({...old,nativeHttpRequest:async req=>{window.__sizingWrites.push(req);return old.nativeHttpRequest(req);}});});
  const playback=page.locator('.fd-speaker-card[data-speaker-layout="transport"]'),volume=page.locator('.fd-speaker-card[data-speaker-layout="volume"]');
  const before=await playback.evaluate(el=>el.getBoundingClientRect().height);await playback.locator('[data-speaker-action="pause"]').click();await page.waitForFunction(()=>document.querySelector('[data-speaker-layout="transport"]').getAttribute('aria-busy')==='false');assert.equal(await playback.evaluate(el=>el.getBoundingClientRect().height),before);assert.equal(await playback.locator('[data-speaker-action="play"]').isVisible(),true);
  let requests=await page.evaluate(()=>window.__sizingWrites);assert.equal(requests[0].data.data[0].endpointId,4);assert.equal(requests[0].data.data[0].value,1);
  const count=requests.length;await volume.locator('input').evaluate(el=>{for(let i=20;i<35;i++){el.value=String(i);el.dispatchEvent(new Event('input',{bubbles:true}));}});assert.equal(await page.evaluate(()=>window.__sizingWrites.length),count);await volume.locator('input').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('[data-speaker-layout="volume"]').getAttribute('aria-busy')==='false');requests=await page.evaluate(()=>window.__sizingWrites);assert.equal(requests.length-count,2);assert.equal(requests[count].data.data[0].endpointId,5);assert.equal(requests[count].data.data[0].traitCode,'Volume');assert.equal(requests[count].data.data[0].value,34);
  assert.ok(await page.locator('.fd-card.is-offline').count(),'offline fixture rendered');
 }
 assert.deepEqual(errors,[]);if(qa)writeFileSync(join(qa,'results.json'),JSON.stringify({favorites,results,errors},null,2));console.log('SENIOR LARGE PASS: 24 viewport/theme/locale combinations / 48 scope combinations; summary all/room, details, long names, target bounds, directories, role editor policy, scene state geometry');
}finally{await browser.close();await new Promise(r=>server.close(r));}
