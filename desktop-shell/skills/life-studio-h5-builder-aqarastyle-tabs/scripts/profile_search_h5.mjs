#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertExternalQAOutput} from './qa-output.mjs';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1],dir=resolve(args[0]);
const out=args.includes('--screenshots')?resolve(option('--screenshots')):null;assertExternalQAOutput(dir,out);if(out)mkdirSync(out,{recursive:true});
const module=await import(args.includes('--playwright-module')?pathToFileURL(resolve(option('--playwright-module'))).href:'playwright');
const browser=await (module.default||module).chromium.launch({headless:true,...(args.includes('--browser')?{executablePath:resolve(option('--browser'))}:{})});
const width=args.includes('--width')?Number(option('--width')):390,theme=args.includes('--theme')?option('--theme'):'light';
const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 await page.addInitScript(({theme})=>{
  window.__requests=[];window.__held=null;window.__failSearch=false;
  window.__AQARA_NATIVE_CONTEXT__={platform:'ios',capabilities:['nativeHttpRequest','subscribeThemeMode','openDevicePlugin']};
  window.webkit={messageHandlers:{nativeBridge:{postMessage({action,data}){
   if(action==='subscribeThemeMode'){queueMicrotask(()=>window.H5Invoke(data.onSuccess,{code:0,data:{themeMode:theme}}));return;}
   window.__requests.push(data);let response;
   if(data.url.endsWith('/devices')||data.url.endsWith('/automations')){
    const device=data.url.endsWith('/devices'),keyword=data.params.deviceName||data.params.automationName||'';
    const names=keyword==='分页'?Array.from({length:205},(_,i)=>`分页 ${i}`):['客厅灯','卧室灯','最新查询结果','旧查询结果'];
    const rows=names.map((name,i)=>device?{deviceId:`d-${i}`,deviceName:name,deviceTypesList:['Light'],state:true,space:{spaceId:'room',name:'客厅'}}:{automationId:`a-${i}`,name,enabled:true});
    const filtered=rows.filter(row=>(device?row.deviceName:row.name).includes(keyword));response={data:filtered.slice((data.params.pageNum-1)*data.params.pageSize,data.params.pageNum*data.params.pageSize),totalCount:filtered.length};
    if(keyword==='旧查询'){window.__held=()=>window.H5Invoke(data.onSuccess,{code:0,data:response});return;}
    if(window.__failSearch&&keyword==='失败'){queueMicrotask(()=>window.H5Invoke(data.onFailed,{code:500,message:'fixture failed'}));return;}
   }else if(data.url.endsWith('/spaces'))response=[{spaceId:'room',name:'客厅'}];
   else if(data.url.endsWith('/scenes'))response=[{automationId:'scene-1',triggerNodeId:'trigger-1',triggerName:'回家场景',enabled:true}];
   else response=[];
   queueMicrotask(()=>window.H5Invoke(data.onSuccess,{code:0,data:response}));
  }}}};
 },{theme});
 await page.goto(pathToFileURL(join(dir,'index.html')).href);await page.waitForFunction(()=>document.getElementById('app').getAttribute('aria-busy')==='false');
 await page.locator('#tab-devices').click();await page.waitForSelector('.device-plugin-row');
 assert.equal(await page.locator('.directory-subtitle').count(),0);assert.equal(await page.locator('#devices-content .eyebrow').count(),0);
 const input=page.locator('#devices-search');await input.focus();await input.evaluate(node=>{window.__searchInput=node;});
 const count=()=>page.evaluate(()=>window.__requests.filter(x=>x.url.endsWith('/devices')).length);
 let before=await count();await input.fill('客');await input.fill('客厅');await page.waitForFunction(()=>window.__requests.some(x=>x.params.deviceName==='客厅'));await page.waitForFunction(()=>document.querySelectorAll('.device-plugin-row').length===1);
 assert.equal(await count(),before+1,'rapid input coalesces');assert.equal(await input.evaluate(node=>node===window.__searchInput&&node===document.activeElement),true,'input and focus retained');
 before=await count();await input.fill('  客厅  ');await input.press('Enter');assert.equal(await count(),before,'trimmed identical query deduplicates');
 const spaces=await page.evaluate(()=>window.__requests.filter(x=>x.url.endsWith('/spaces')).length);
 await input.fill('分页');await input.press('Enter');await page.waitForFunction(()=>document.querySelectorAll('.device-plugin-row').length===200);await page.locator('#devices-content .directory-action').click();await page.waitForFunction(()=>document.querySelectorAll('.device-plugin-row').length===205);
 const last=await page.evaluate(()=>window.__requests.filter(x=>x.url.endsWith('/devices')).at(-1));assert.equal(last.params.deviceName,'分页');assert.equal(last.params.pageNum,2);
 await input.fill('旧查询');await input.press('Enter');await page.waitForFunction(()=>typeof window.__held==='function');before=await count();
 await input.fill('中间查询');await input.press('Enter');await input.fill('最新查询');await input.press('Enter');assert.equal(await count(),before,'one request in flight');
 await page.evaluate(()=>window.__held());await page.waitForFunction(()=>document.querySelector('.device-plugin-row strong')?.textContent==='最新查询结果');assert.equal(await count(),before+1,'only latest queued query sent');
 assert.equal(await page.locator('#devices-content').innerText().then(text=>text.includes('旧查询结果')),false);assert.equal(await page.evaluate(()=>window.__requests.filter(x=>x.url.endsWith('/spaces')).length),spaces,'search does not refetch spaces');
 before=await count();await input.evaluate(node=>{node.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));node.value='卧室';node.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});
 await page.waitForTimeout(350);assert.equal(await count(),before,'IME sends no unfinished query');await input.evaluate(node=>node.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await page.waitForFunction(()=>document.querySelector('.device-plugin-row strong')?.textContent==='卧室灯');
 if(out)await page.screenshot({animations:'disabled',path:join(out,`device-search-${width}-${theme}.png`)});
 await page.locator('.directory-search-clear').first().click();await page.waitForFunction(()=>document.querySelectorAll('.device-plugin-row').length===0);assert.equal(await input.inputValue(),'');
 await page.evaluate(()=>{window.__failSearch=true;});await input.fill('失败');await input.press('Enter');await page.waitForFunction(()=>document.querySelector('#devices-content .directory-message')?.textContent==='读取失败，请重试');
 await page.evaluate(()=>{window.__failSearch=false;});await page.locator('#devices-content .directory-action').click();await page.waitForFunction(()=>document.querySelector('#devices-content .directory-message')?.textContent==='没有匹配结果');assert.equal(await page.evaluate(()=>window.__requests.filter(x=>x.url.endsWith('/devices')).at(-1).params.pageNum),1);
 await page.locator('.directory-search-close:visible').click();await page.locator('#tab-automation').click();await page.locator('#smart-tab-automations').click();await page.waitForSelector('.automation-switch');
 const sceneNode=await page.locator('#scenes-directory .directory-row').elementHandle();const sceneCalls=await page.evaluate(()=>window.__requests.filter(x=>x.url.endsWith('/scenes')).length);
 await page.locator('#automations-search').fill('客厅');await page.locator('#automations-search').press('Enter');await page.waitForFunction(()=>document.querySelectorAll('.automation-switch').length===1);
 assert.equal(await page.evaluate(node=>node===document.querySelector('#scenes-directory .directory-row'),sceneNode),true,'automation search preserves scene DOM');
 assert.equal(await page.evaluate(()=>window.__requests.filter(x=>x.url.endsWith('/scenes')).length),sceneCalls,'automation search does not query scenes');
 assert.equal(await page.evaluate(()=>window.__requests.filter(x=>x.url.endsWith('/automations')).at(-1).params.automationName),'客厅');
 if(out)await page.screenshot({animations:'disabled',path:join(out,`automation-search-${width}-${theme}.png`)});
 await page.locator('.directory-search-close:visible').click();
 const requests=await page.evaluate(()=>window.__requests.length);await page.locator('#tab-devices').click();await page.locator('#tab-automation').click();assert.equal(await page.evaluate(()=>window.__requests.length),requests,'warm tabs preserve search results');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);console.log('SEARCH PROFILE PASS (debounce, IME, focus, query pagination, serial coalescing, stale responses, spaces reuse, scene isolation and warm tabs)');
}finally{await browser.close();}
