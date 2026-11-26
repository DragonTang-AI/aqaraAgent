#!/usr/bin/env node
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs';import {resolve,extname,sep} from 'node:path';import {pathToFileURL} from 'node:url';import {validateWorkspace} from './preview-package.mjs';
const args=process.argv.slice(2),base=resolve(args[0]),opt=n=>args[args.indexOf(n)+1],qa=resolve(opt('--qa-output'));assert.ok(!qa.startsWith(base+sep));mkdirSync(qa,{recursive:true});
const server=createServer((req,res)=>{try{const file=resolve(base,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(base+sep)||!statSync(file).isFile())throw new Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(pathToFileURL(resolve(opt('--playwright-module'))));const browser=await chromium.launch({headless:true,executablePath:resolve(opt('--browser'))});const results=[];
try{
 for(const role of ['senior','child'])for(const variant of (args.includes('--variants')?opt('--variants').split(','):['missing','empty','saved','malformed','none','one','five','six','many','partial','offline','catalog-error'])){
  if(role==='child'&&variant==='partial')continue;
  validateWorkspace(resolve(base,role));const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({role,variant})=>{Object.defineProperty(window,'PreviewStudio',{configurable:true,set(api){Object.defineProperty(window,'PreviewStudio',{value:{create(source){
   const count={none:0,one:1,five:5,six:6}[variant]===undefined?8:{none:0,one:1,five:5,six:6}[variant];
   source.scenes=Array.from({length:count},(_,i)=>({sceneId:'relevant-'+i,name:(role==='senior'?'阅读休息':'学习阅读')+i,enabled:true})).concat([{sceneId:'irrelevant',name:'普通测试场景',enabled:true},{sceneId:'unsafe',name:'晚安自动开锁',enabled:true},{sceneId:'disabled',name:'阅读停用',enabled:false}]);
   if(variant==='catalog-error')source.failures={'GET /scenes':100};
   source.metadata=variant==='missing'?{}:variant==='empty'?{favoriteScenes:[],favoriteDevices:[]}:variant==='malformed'?{favoriteScenes:'invalid',favoriteDevices:'invalid'}:{favoriteScenes:['irrelevant'],favoriteDevices:[{did:'official-private-device',endpointId:'99'}],preferences:{theme:'official'}};
   if(variant==='partial'){const sample=source.devices[0],definition=source.definitions.find(d=>d.deviceId===sample.deviceId);source.devices=Array.from({length:60},(_,i)=>Object.assign({},sample,{deviceId:'large-'+i,deviceName:'客厅灯'+i}));source.definitions=source.devices.map(d=>Object.assign({},JSON.parse(JSON.stringify(definition)),{deviceId:d.deviceId}));}if(variant==='offline')source.devices.forEach(d=>d.state=false);
   source.spaces[0].children.push({spaceId:'second-bedroom',name:'次卧'});
   if(role==='child'&&variant==='many'){
    const light=source.devices.find(item=>item.deviceTypesList.includes('Light')&&item.space.spaceId==='mock-bedroom');
    const definition=source.definitions.find(item=>item.deviceId===light.deviceId);
    for(let i=0;i<7;i++){const deviceId='child-extra-light-'+i;source.devices.push({...light,deviceId,deviceName:'卧室附加灯 '+i});source.definitions.push({...JSON.parse(JSON.stringify(definition)),deviceId});}
    const camera=source.devices.find(item=>item.deviceTypesList.includes('Camera'));
    camera.deviceName='卧室灯摄像机';
   }
   const mock=api.create(source);window.__calls=[];window.__expected=variant==='catalog-error'?0:Math.min(count,6);
   return {request(input){__calls.push(input);if(/\/metadata\//.test(input.url))throw Error('Official metadata forbidden for automatic role');return mock.request(input);}};
  }}});}});},{role,variant});
  if(variant==='partial')await page.route('**/config.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/("(?:overviewMaxDevices|overviewCatalogPageSize)"\s*:\s*)\d+/g,(_,prefix)=>prefix+'40')});});
  await page.goto('http://127.0.0.1:'+server.address().port+'/'+role+'/preview/index.html');await page.waitForFunction(()=>!window.StudioHomeRefresh.busy()&&StudioRuntime.favoriteDeviceIndex().settled);
  const scenes=page.locator('.favorite-scene');assert.equal(await scenes.count(),await page.evaluate(()=>__expected));assert.ok((await scenes.allTextContents()).every(n=>!/(普通测试|开锁|停用)/.test(n)));
  assert.equal(await page.locator('#scene-edit').isVisible(),false);assert.equal(await page.locator('#favorite-devices-edit').isVisible(),false);
  await page.locator('#scene-edit').evaluate(e=>{e.click();e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});await page.locator('#favorite-devices-edit').evaluate(e=>e.click());assert.equal(await page.locator('.favorite-editor,.fd-editor').count(),0);
  const picker=page.locator('.role-rest-choice select');await picker.waitFor();const before=await page.evaluate(()=>__calls.length);await picker.selectOption('mock-bedroom');await picker.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>__calls.length),before,'room choice is local');
  if(role==='senior'){assert.ok(await page.locator('.fd-card').count()>0);assert.ok(await page.locator('.fd-card').count()<=3);assert.ok(!(await page.locator('.fd-card').allTextContents()).join('').includes('official-private-device'));}
  else {const rooms=await page.locator('#device-filters .filter-chip').allTextContents();assert.ok(rooms.includes('卧室'));assert.ok(!rooms.some(n=>/推荐|我的家/.test(n)));const n=await page.evaluate(()=>__calls.length);for(const id of ['mock-living','mock-bedroom']){await page.locator('#device-filters [data-space-id="'+id+'"]').click();const cards=page.locator('#device-grid .device-card');assert.ok(await cards.count()<=4,'each child room shows at most four devices');if(id==='mock-living'&&variant==='many')assert.equal(await page.locator('#device-grid [data-device-id="mock-device-4"]').count(),1,'real ambient sensor remains eligible');assert.equal(await page.evaluate(()=>__calls.length),n,'room switches issue zero requests');}assert.ok(await page.locator('.device-card').evaluateAll(cards=>cards.every(c=>c.querySelector('.device-meta>span').textContent.includes('卧室')&&['light','curtain','climate','sensor'].some(k=>c.classList.contains('category-'+k)))));if(variant==='many'){assert.equal(await page.locator('.device-card').count(),4);assert.equal(await page.locator('[data-device-id="mock-device-3"]').count(),0,'camera named as a lamp remains excluded');}}
  if(variant==='partial'){assert.equal(await page.evaluate(()=>StudioRuntime.favoriteDeviceIndex().complete),false);const ids=await page.evaluate(()=>__calls.filter(r=>r.url.endsWith('/definitions')).flatMap(r=>String(r.params.deviceIds).split(',')));assert.ok(new Set(ids).size<=40,'bounded index, no scan to fill three');assert.equal(await page.locator('.fd-card').count(),3);}
  if(variant==='offline'&&role==='senior'){assert.equal(await page.locator('.fd-card.is-offline').count(),await page.locator('.fd-card').count());const before=await page.evaluate(()=>__calls.filter(r=>/\/execute$/.test(r.url)).length);await page.locator('.fd-action').first().click();assert.equal(await page.evaluate(()=>__calls.filter(r=>/\/execute$/.test(r.url)).length),before,'offline action only explains status; no command');}
  if(variant==='many'){
   const n=await page.evaluate(()=>__calls.filter(r=>/\/scenes\/execute$/.test(r.url)).length);await scenes.first().click();await page.waitForFunction(()=>__calls.some(r=>/\/scenes\/execute$/.test(r.url)));assert.equal(await page.evaluate(()=>__calls.filter(r=>/\/scenes\/execute$/.test(r.url)).length),n+1,'one actual scene command');await page.waitForFunction(()=>!document.querySelector('.favorite-scene').disabled);
   if(role==='senior'){const action=page.locator('.fd-action:not(:disabled)').first();await action.click();await page.waitForFunction(()=>__calls.some(r=>/\/devices\/trait\/execute$/.test(r.url)));assert.equal(await page.evaluate(()=>__calls.filter(r=>/\/devices\/trait\/execute$/.test(r.url)).length),1,'one actual device command');}
   await page.screenshot({path:qa+'/'+role+'-isolated.png'});
  }
  await page.evaluate(() => window.StudioHomeRefresh.refresh());await page.waitForFunction(()=>!window.StudioHomeRefresh.busy()&&StudioRuntime.favoriteDeviceIndex().settled);assert.equal(await scenes.count(),await page.evaluate(()=>__expected));
  assert.equal(await page.evaluate(()=>__calls.filter(r=>/\/metadata\//.test(r.url)).length),0,'no official favorite reads, writes or deletes');assert.equal(await page.locator('.role-rest-choice').count(),0,'room choice survives refresh');assert.deepEqual(errors,[]);results.push({role,variant,passed:true});console.log('AUTOMATIC COLLECTION PASS '+role+' '+variant);await page.close();
 }
 writeFileSync(qa+'/results.json',JSON.stringify(results,null,2));
}finally{await browser.close();server.close();}
