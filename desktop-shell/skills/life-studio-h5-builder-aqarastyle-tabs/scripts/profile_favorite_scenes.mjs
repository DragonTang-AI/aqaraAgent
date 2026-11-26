#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateWorkspace} from './preview-package.mjs';
import {assertExternalQAOutput} from './qa-output.mjs';
const args=process.argv.slice(2),root=resolve(args[0]),option=n=>args[args.indexOf(n)+1];validateWorkspace(root);
const qa=resolve(option('--screenshots'));assertExternalQAOutput(root,qa);mkdirSync(qa,{recursive:true});
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+sep)||!existsSync(p)||!statSync(p).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(400).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const imported=await import(pathToFileURL(resolve(option('--playwright-module'))));const browser=await(imported.default||imported).chromium.launch({headless:true,executablePath:resolve(option('--browser'))});
try{
 const page=await browser.newPage({viewport:{width:1100,height:1100}}),errors=[],pngRequests=[];page.on('request',request=>{if(/\.png(?:[?#]|$)|data:image\/png/i.test(request.url()))pngRequests.push(request.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/preview/canvas.html');const frame=page.frameLocator('main > iframe');await frame.locator('#scene-edit').waitFor();await frame.locator('#scene-edit').waitFor({state:'visible'});
 const child=page.frames().find(f=>f.url().includes('/preview/index.html'));await child.waitForFunction(()=>!document.querySelector('#scene-edit').disabled);
 assert.equal(await frame.locator('.favorite-scene').count(),0);await page.locator('main > iframe').screenshot({path:qa+'/empty-light.png'});
 await child.evaluate(()=>{
  const old=window.LifeBridge,original=old.nativeHttpRequest;window.__favoriteRequests=[];window.__favoriteFail=false;window.__favoriteCatalogFail=false;window.__favoriteExecuteDelay=500;
  const scenes=Array.from({length:14},(_,i)=>({automationId:'test-automation-'+Math.floor(i/2),triggerNodeId:'test-trigger-'+i,sceneId:'test-scene-'+i,name:i===0?'晚安 <script>安全文本</script>':i===1?'晚安':'场景 '+i,enabled:i!==13}));
  window.LifeBridge=Object.freeze(Object.assign({},old,{nativeHttpRequest:async request=>{
   window.__favoriteRequests.push(request);
   if(request.url.endsWith('/scenes') && !request.params.enabledOnly){if(window.__favoriteCatalogFail)throw new Error('read failed');return {code:0,data:scenes};}
   if(request.url.endsWith('/scenes/execute')){await new Promise(r=>setTimeout(r,window.__favoriteExecuteDelay));if(window.__favoriteFail)throw new Error('Native scene failure 503');return {code:0,data:{}};}
   return original(request);
  }}));
 });
 await child.evaluate(()=>window.StudioRuntime.invalidateCollections(['/scenes']));await frame.locator('#scene-edit').click();await frame.locator('.favorite-choice').first().waitFor();assert.equal(await frame.locator('.favorite-choice').count(),14);
 for(let i=0;i<10;i++)await frame.locator('.favorite-choice').nth(i).click();assert.equal(await frame.locator('.favorite-editor footer button').innerText(),'确定（10/10）');
 await frame.locator('.favorite-choice').nth(10).click();assert.equal(await frame.locator('.favorite-choice[aria-checked="true"]').count(),10);assert.match(await frame.locator('#toast').innerText(),/最大数量/);assert.equal(await child.evaluate(()=>{const toast=document.querySelector('#toast'),r=toast.getBoundingClientRect();return toast.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),true,'maximum-count Toast must paint above the editor');
 await page.locator('main > iframe').screenshot({path:qa+'/selection-max-light.png'});
 await frame.locator('.favorite-editor footer button').click();await frame.locator('.favorite-editor').waitFor({state:'detached'});assert.equal(await frame.locator('.favorite-editor').count(),0);assert.equal(await frame.locator('.favorite-scene').count(),10);
 assert.equal(await frame.locator('.favorite-scenes-grid script').count(),0);assert.equal(await frame.locator('.favorite-scene-name').first().innerText(),'晚安 <script>安全文本</script>');
 const geometry=await child.evaluate(()=>{const a=document.querySelector('.favorite-scene'),b=a.nextElementSibling,r=a.getBoundingClientRect(),s=getComputedStyle(a);return {width:r.width,height:r.height,radius:s.borderRadius,columns:getComputedStyle(a.parentElement).gridTemplateColumns.split(' ').length,sameRow:Math.abs(r.top-b.getBoundingClientRect().top)<1};});
 assert.equal(geometry.columns,2);assert.equal(geometry.sameRow,true);assert.ok(geometry.height>=56);assert.ok(parseFloat(geometry.radius)>=16,'theme radius keeps the scene card rounded');
 const before=await child.evaluate(()=>window.__favoriteRequests.length);await frame.locator('.favorite-scene').first().click();await frame.locator('.favorite-scene').first().waitFor({state:'visible'});assert.equal(await frame.locator('.favorite-scene[aria-busy="true"]').count(),1);await child.waitForFunction(()=>{const img=document.querySelector('.favorite-scene[aria-busy="true"] .favorite-scene-status img');return img&&img.complete&&img.naturalWidth===20;});assert.equal(await frame.locator('.favorite-scene[aria-busy="true"] .favorite-scene-status img').getAttribute('src'),'assets/icon-loading.svg');
 await child.waitForFunction(()=>document.querySelector('.favorite-scene-status.is-success'));assert.equal(await child.evaluate(before=>window.__favoriteRequests.length-before,before),1);await page.locator('main > iframe').screenshot({path:qa+'/success-light.png'});
 await page.waitForTimeout(2100);assert.equal(await frame.locator('.favorite-scene-status.is-success').count(),0);
 await child.evaluate(()=>window.__favoriteFail=true);await frame.locator('.favorite-scene').nth(1).click();await child.waitForFunction(()=>document.querySelector('.favorite-scene-status img[src$="failed.svg"]'));assert.equal(await frame.locator('#toast').innerText(),'操作失败，请重试');await page.locator('main > iframe').screenshot({path:qa+'/failure-light.png'});
 await page.waitForTimeout(2100);assert.equal(await frame.locator('.favorite-scene-status img[src$="failed.svg"]').count(),0);
 // Cancellation discards a draft; confirmation changes metadata, never the scene itself.
 await frame.locator('#scene-edit').click();await frame.locator('.favorite-choice').first().waitFor();await frame.locator('.favorite-choice').first().click();await frame.locator('.favorite-editor header button').click();assert.equal(await frame.locator('.favorite-scene').count(),10);
 await frame.locator('#scene-edit').click();await frame.locator('.favorite-choice').first().waitFor();for(let i=0;i<10;i++)await frame.locator('.favorite-choice').nth(i).click();await frame.locator('.favorite-editor footer button').click();await frame.locator('.favorite-editor').waitFor({state:'detached'});await frame.locator('#scene-edit:not(:disabled)').waitFor();assert.equal(await frame.locator('.favorite-scene').count(),0);
 assert.equal(await child.evaluate(()=>window.__favoriteRequests.filter(r=>r.url.endsWith('/scenes/execute')).length),2,'only the two explicit executions may write to Studio');
 await child.evaluate(()=>{window.__favoriteCatalogFail=true;window.StudioRuntime.invalidateCollections(['/scenes']);});await frame.locator('#scene-edit').click();await child.waitForFunction(()=>document.querySelector('.favorite-choice-list').textContent.includes('重试'));assert.equal(await frame.locator('.favorite-editor footer button').isDisabled(),true);await frame.locator('.favorite-editor header button').click();
 await child.evaluate(()=>{window.__favoriteCatalogFail=false;window.LifeI18n.setLocale('en');});await frame.locator('#scene-edit').click();await frame.locator('.favorite-choice').first().waitFor();assert.equal(await frame.locator('#favorite-editor-title').innerText(),'Select favorite scenes');await frame.locator('.favorite-editor header button').press('Escape');
 // Fresh dark preview has its own volatile favorites, never shares production localStorage.
 await page.locator('#theme').selectOption('dark');await frame.locator('#scene-edit').waitFor();const dark=page.frames().find(f=>f.url().includes('/preview/index.html'));await dark.waitForFunction(()=>!document.querySelector('#scene-edit').disabled);assert.equal(await frame.locator('.favorite-scene').count(),0);
 await frame.locator('#scene-edit').click();await frame.locator('.favorite-choice').first().waitFor();await page.locator('main > iframe').screenshot({path:qa+'/selection-dark.png'});await frame.locator('.favorite-choice').first().click();await frame.locator('.favorite-choice').nth(1).click();await frame.locator('.favorite-editor footer button').click();await frame.locator('.favorite-editor').waitFor({state:'detached'});assert.equal(await frame.locator('.favorite-scene').nth(1).isDisabled(),true);assert.match(await frame.locator('.favorite-scene').nth(1).innerText(),/已停用/);await page.locator('main > iframe').screenshot({path:qa+'/favorites-dark.png'});
 await page.locator('#width').selectOption('320');await frame.locator('#scene-edit').waitFor();await page.locator('main > iframe').screenshot({path:qa+'/narrow-dark.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(pngRequests,[],'runtime must not request PNG images');
 console.log('FAVORITE SCENES PASS: server-backed empty/0–10, draft/cancel/remove, failed catalog, disabled scenes, themes/locales, 2-second feedback and exact execution. Metadata persistence/failure/isolation is covered by profile_favorite_metadata.mjs.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
