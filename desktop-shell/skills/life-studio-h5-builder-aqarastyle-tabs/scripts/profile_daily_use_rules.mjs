#!/usr/bin/env node
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs';import {resolve,extname,sep} from 'node:path';import {pathToFileURL} from 'node:url';import {validateWorkspace} from './preview-package.mjs';
const args=process.argv.slice(2),base=resolve(args[0]),opt=n=>args[args.indexOf(n)+1],qa=resolve(opt('--qa-output'));assert.ok(!qa.startsWith(base+sep));mkdirSync(qa,{recursive:true});
const server=createServer((req,res)=>{try{const file=resolve(base,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(base+sep)||!statSync(file).isFile())throw new Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(pathToFileURL(resolve(opt('--playwright-module'))));const browser=await chromium.launch({headless:true,executablePath:resolve(opt('--browser'))});const results=[];
try{
 const reports=[];
 async function run(mode,count,saved='missing',failure=''){
  if(args.includes('--modes')&&!opt('--modes').split(',').includes(mode))return;
  validateWorkspace(resolve(base,mode));const page=await browser.newPage({viewport:{width:390,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{let bridge;window.__dailyCalls=[];window.__dailySettled=[];Object.defineProperty(window,'LifeBridge',{configurable:true,get:()=>bridge,set:value=>{bridge=Object.freeze({...value,nativeHttpRequest:async req=>{window.__dailyCalls.push(req);try{return await value.nativeHttpRequest(req);}finally{window.__dailySettled.push(req.url);}}});}});});
  await page.route('**/scenarios.js',async route=>{const response=await route.fetch();const patch=`;{const d=__PREVIEW_SCENARIOS__.typical;d.scenes=Array.from({length:${count}},(_,i)=>({sceneId:'s'+(i+1),name:'阅读 Scene '+(i+1),enabled:i!==1}));d.metadata=${JSON.stringify(saved==='missing'?{}:{favoriteScenes:saved})};d.failures=${JSON.stringify(failure?{[failure]:100}:{})};}`;await route.fulfill({response,body:await response.text()+patch});});
  await page.goto('http://127.0.0.1:'+server.address().port+'/'+mode+'/preview/index.html');
  const automatic=await page.evaluate(()=>['senior','child'].includes(__LIFE_STUDIO_DASHBOARD_CONFIG__.role));
  if(automatic){await page.waitForFunction(()=>!window.StudioHomeRefresh.busy());const expected=failure==='GET /scenes'?0:Math.min(Math.max(0,count-(count>1?1:0)),6);await page.waitForFunction(n=>document.querySelectorAll('.favorite-scene').length===n,expected);assert.equal(await page.locator('#scene-edit').isVisible(),false);assert.equal(await page.evaluate(()=>__dailyCalls.filter(r=>/\/metadata\//.test(r.url)).length),0);assert.deepEqual(errors,[]);reports.push({mode,count,saved,failure,automatic:true,expected});await page.close();return;}
  await page.waitForFunction(()=>document.querySelector('#app').getAttribute('aria-busy')==='false'&&__dailySettled.some(url=>url.endsWith('/metadata/query')));
  if(!failure)await page.locator('#scene-edit:not(:disabled)').waitFor();
  const expected=Array.isArray(saved)?saved.length:failure?0:Math.min(count,6);
  try{await page.waitForFunction(expected=>document.querySelectorAll('.favorite-scene').length===expected,expected);}catch(error){console.error(JSON.stringify({mode,count,expected,errors,text:await page.locator('#scene-grid').innerText()}));throw error;}
  const keys=await page.locator('.favorite-scene').evaluateAll(nodes=>nodes.map(n=>n.dataset.sceneKey));
  if(Array.isArray(saved))assert.deepEqual(keys,saved);
  if(mode==='confirmed'&&count>6)assert.deepEqual(keys,['s7','s3','s1','s6','s5','s2']);
  if(!failure&&!Array.isArray(saved)&&count>6&&mode!=='confirmed')assert.equal(keys.length,6);
  const updates=()=>page.evaluate(()=>__dailyCalls.filter(r=>r.url.endsWith('/metadata/update')).length);
  assert.equal(await updates(),0,'startup never persists defaults');assert.equal(await page.evaluate(()=>__dailyCalls.filter(r=>r.url.endsWith('/scenes/execute')).length),0);
  if(mode==='senior'||mode==='child')assert.equal(await page.locator('#studio-tabbar').isVisible(),false);
  if(mode==='extra-tabs')assert.equal(await page.locator('#studio-tabbar').isVisible(),true);
  if(mode==='child'&&count===5&&saved==='missing'&&!failure){
   const node=await page.locator('.favorite-scene').first().elementHandle();await page.locator('.favorite-scene').first().click();await page.waitForFunction(()=>__dailySettled.some(url=>url.endsWith('/scenes/execute')));assert.equal(await page.evaluate(()=>__dailyCalls.filter(r=>r.url.endsWith('/scenes/execute')).length),1);assert.equal(await page.locator('.favorite-scene').first().evaluate((el,old)=>el===old,node),true);assert.equal(await updates(),0);
   assert.equal(await page.locator('.favorite-scene[data-scene-key="s2"]').isDisabled(),true,'disabled scene remains visible, never executable');
   await page.locator('#scene-edit').click();await page.locator('.favorite-choice').first().waitFor();assert.equal(await page.locator('.favorite-choice[aria-checked="true"]').count(),5);await page.locator('.favorite-choice').first().click();await page.locator('.favorite-editor header button').click();assert.equal(await page.locator('.favorite-scene').count(),5);assert.equal(await updates(),0,'cancel writes nothing');
   await page.locator('#scene-edit').click();await page.locator('.favorite-choice').first().waitFor();while(await page.locator('.favorite-choice[aria-checked="true"]').count())await page.locator('.favorite-choice[aria-checked="true"]').first().click();await page.locator('.favorite-editor footer button').click();await page.waitForFunction(()=>!document.querySelector('.favorite-editor'));assert.equal(await updates(),1);assert.equal(await page.locator('.favorite-scene').count(),0);await page.evaluate(() => window.StudioHomeRefresh.refresh());await page.waitForFunction(()=>document.querySelector('#app').getAttribute('aria-busy')==='false');assert.equal(await page.locator('.favorite-scene').count(),0,'explicit clear survives refresh');assert.equal(await updates(),1);
  }
  if(mode==='child'&&count===6&&saved==='missing'&&!failure)for(const width of [320,390])for(const theme of ['light','dark'])for(const locale of ['zh-CN','zh-TW','en']){await page.setViewportSize({width,height:1000});await page.evaluate(({theme,locale})=>{document.documentElement.dataset.theme=theme;LifeI18n.setLocale(locale);},{theme,locale});assert.equal(await page.locator('.favorite-scene').count(),6);assert.equal(await updates(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);if(locale==='en')await page.screenshot({path:qa+'/six-'+width+'-'+theme+'.png'});}
  if(mode==='environment'){
   await page.waitForFunction(()=>StudioRuntime.spaceControlIndex().complete);assert.match(await page.locator('#temperature-label').innerText(),/卧室/);const before=await page.locator('#temperature-value').innerText(),n=await page.evaluate(()=>__dailyCalls.length);await page.locator('#device-filters [data-space-id="mock-living"]').click();assert.equal(await page.locator('#temperature-value').innerText(),before);assert.match(await page.locator('#temperature-label').innerText(),/卧室/);assert.equal(await page.evaluate(()=>__dailyCalls.length),n,'source and local device filter are independent');
  }
  assert.deepEqual(errors,[]);reports.push({mode,count,saved,failure,expected,passed:true});console.log('DAILY UI PASS '+mode+' '+count+' '+JSON.stringify(saved)+' '+failure);await page.close();
 }
 for(const mode of ['senior','child']){
  for(const count of [0,1,5,6,7,116])await run(mode,count);
  for(const saved of [[],['s3','s1'],Array.from({length:8},(_,i)=>'s'+(i+1))])await run(mode,116,saved);
 }
 await run('confirmed',116);await run('confirmed',6);await run('child',5,'missing','POST /users/me/metadata/query');await run('child',5,'missing','GET /scenes');await run('environment',5);await run('extra-tabs',5);
 writeFileSync(qa+'/results.json',JSON.stringify({passed:true,reports},null,2));console.log('DAILY USE BROWSER PASS: '+reports.length+' cases / automatic-role isolation and service-backed defaults, count thresholds, source scope, Home-only and overrides');
}finally{await browser.close();await new Promise(r=>server.close(r));}
