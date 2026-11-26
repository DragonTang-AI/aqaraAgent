#!/usr/bin/env node
// Simulated host/OpenAPI regression. Never copied to production.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertExternalQAOutput} from './qa-output.mjs';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1],dir=resolve(args[0]);
const out=args.includes('--screenshots')?resolve(option('--screenshots')):null;assertExternalQAOutput(dir,out);if(out)mkdirSync(out,{recursive:true});
const width=args.includes('--width')?Number(option('--width')):390,theme=args.includes('--theme')?option('--theme'):'light';
const imported=await import(args.includes('--playwright-module')?pathToFileURL(resolve(option('--playwright-module'))).href:'playwright');
const browser=await(imported.default||imported).chromium.launch({headless:true,...(args.includes('--browser')?{executablePath:resolve(option('--browser'))}:{})});
const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(({theme})=>{
  window.__calls=[];window.__failExecute=false;window.__holdSearch=false;window.__releaseSearch=null;
  const devices=Array.from({length:205},(_,i)=>({deviceId:'d'+i,deviceName:(i%2?'灯':'摄像机')+' '+i,deviceTypesList:[i%2?'Light':'Camera'],state:i%3===0?'0':i%7===0?undefined:true,space:i===2?null:{spaceId:i%2?'r1':'r2',name:'同名房间'}}));
  const scenes=[{automationId:'a1',triggerNodeId:'t1',triggerName:'回家',enabled:true,space:{spaceId:'r1',name:'同名房间'}},{automationId:'a2',triggerNodeId:'t2',triggerName:'睡眠',enabled:false},{automationId:'a1',triggerNodeId:'t3',triggerName:'阅读',enabled:true}];
  let enabled=true;
  window.__AQARA_NATIVE_CONTEXT__={platform:'ios',capabilities:['nativeHttpRequest','subscribeThemeMode','openDevicePlugin','openNavigationDrawer']};
  window.webkit={messageHandlers:{nativeBridge:{postMessage({action,data}){
   window.__calls.push({action,data});let result;
   const reply=()=>window.H5Invoke(data.onSuccess,{code:0,data:result});
   if(action==='subscribeThemeMode')result={themeMode:theme};
   else if(action==='openDevicePlugin'||action==='openNavigationDrawer')result={accepted:true};
   else if(data.url.endsWith('/devices')){
    const params=data.params;
    const items=devices.filter(item=>(!params.deviceName||item.deviceName.includes(params.deviceName))&&(params.state!==false||item.state==='0')&&(!params.deviceTypesList||item.deviceTypesList.includes(params.deviceTypesList)));
    result={data:items.slice((params.pageNum-1)*params.pageSize,params.pageNum*params.pageSize),totalCount:items.length};
    if(params.deviceName==='延迟'&&window.__holdSearch){window.__releaseSearch=reply;return;}
   }else if(data.url.endsWith('/spaces'))result=[{spaceId:'r1',name:'同名房间'},{spaceId:'r2',name:'同名房间'}];
   else if(data.url.endsWith('/manual-triggers'))result=scenes;
   else if(data.url.endsWith('/manual-triggers/execute')){
    if(window.__failExecute){setTimeout(()=>window.H5Invoke(data.onFailed,{code:500,message:'fixture failed'}),80);return;}result={};setTimeout(reply,80);return;
   }else if(data.url.endsWith('/automations/status')){enabled=data.data.enabled;scenes.filter(x=>x.automationId==='a1').forEach(x=>x.enabled=enabled);result={successIds:data.data.automationIds,failedItems:[]};setTimeout(reply,80);return;}
   else if(data.url.endsWith('/automations')){const items=[{automationId:'a1',name:'有人开灯',enabled},{automationId:'a2',name:'夜间安防',enabled:false}].filter(item=>!data.params.automationName||item.name.includes(data.params.automationName));result={data:items,totalCount:items.length};}
   else result=[];
   queueMicrotask(reply);
  }}}};
 },{theme});
 await page.goto(pathToFileURL(join(dir,'index.html')).href);await page.waitForFunction(()=>document.querySelector('#app').getAttribute('aria-busy')==='false');
 await page.locator('#tab-devices').click();await page.waitForFunction(()=>document.querySelectorAll('.device-plugin-row').length===200);
 assert.match(await page.locator('#devices-count').innerText(),/205/);assert.equal(await page.locator('#devices-content .directory-group').count(),3);assert.equal(await page.locator('#devices-content .directory-group').last().getAttribute('data-space-id'),'');
 assert.equal(await page.locator('.device-plugin-row[data-device-id="d0"]').evaluate(n=>n.classList.contains('is-offline')),true);assert.match(await page.locator('.device-plugin-row[data-device-id="d7"]').innerText(),/状态未知/);
 const filter=page.locator('.directory-filter');await filter.click();await page.locator('[data-filter-value="true"]').click();
 let reads=await page.evaluate(()=>window.__calls.filter(x=>x.data.url?.endsWith('/devices')).length);
 await page.locator('.directory-filter-backdrop').click({position:{x:4,y:4}});assert.equal(await filter.getAttribute('aria-pressed'),'false');assert.equal(await page.evaluate(()=>window.__calls.filter(x=>x.data.url?.endsWith('/devices')).length),reads,'cancel applies no query');
 await filter.click();await page.locator('[data-filter-value="true"]').click();await page.locator('[data-filter-value="Light"]').click();
 if(out)await page.screenshot({path:join(out,`filter-${width}-${theme}.png`)});
 await page.locator('.directory-filter-apply').click();await page.waitForFunction(()=>document.querySelectorAll('.device-plugin-row').length===34);
 let last=await page.evaluate(()=>window.__calls.filter(x=>x.data.url?.endsWith('/devices')).at(-1).data);assert.equal(last.params.state,false);assert.equal(last.params.deviceTypesList,'Light');assert.equal(last.params.pageNum,1);assert.match(await page.locator('#devices-count').innerText(),/34/);assert.equal(await filter.getAttribute('aria-pressed'),'true');
 await filter.click();await page.keyboard.press('Escape');assert.equal(await page.locator('.directory-filter-layer').count(),0);assert.equal(await filter.evaluate(n=>n===document.activeElement),true);
 // Search intersects the committed device filter, with blank initial view and independent close.
 await page.locator('#devices-search').focus();assert.equal(await page.locator('.device-plugin-row').count(),0);assert.equal(await page.locator('#studio-tabbar').isVisible(),false);
 await page.locator('#devices-search').fill('灯 3');await page.locator('#devices-search').press('Enter');await page.waitForFunction(()=>document.querySelectorAll('.device-plugin-row').length>0);
 last=await page.evaluate(()=>window.__calls.filter(x=>x.data.url?.endsWith('/devices')).at(-1).data);assert.equal(last.params.state,false);assert.equal(last.params.deviceTypesList,'Light');assert.equal(last.params.deviceName,'灯 3');
 await page.locator('.directory-search-close:visible').click();await page.waitForSelector('.is-directory-searching',{state:'hidden'});assert.equal(await page.locator('.device-plugin-row').count(),34);assert.equal(await page.locator('#studio-tabbar').isVisible(),true);
 await filter.click();await page.locator('.directory-filter-reset').click();await page.waitForFunction(()=>document.querySelectorAll('.device-plugin-row').length===200);assert.equal(await filter.getAttribute('aria-pressed'),'false');
 // Closing an in-flight search must not paint stale results over the restored directory.
 await page.evaluate(()=>window.__holdSearch=true);await page.locator('#devices-search').fill('延迟');await page.locator('#devices-search').press('Enter');await page.waitForFunction(()=>typeof window.__releaseSearch==='function');await page.locator('.directory-search-close:visible').click();await page.waitForSelector('.is-directory-searching',{state:'hidden'});await page.evaluate(()=>window.__releaseSearch());await page.waitForTimeout(80);assert.equal(await page.locator('.device-plugin-row').count(),200);
 if(out)await page.screenshot({path:join(out,`devices-${width}-${theme}.png`)});
 await page.locator('#tab-automation').click();await page.waitForSelector('.scene-execute');assert.equal(await page.locator('#scenes-directory').isVisible(),true);assert.equal(await page.locator('#automations-directory').isVisible(),false);assert.equal(await page.locator('#automation-content .directory-filter').count(),0);assert.equal(await page.locator('.smart-segment').evaluate(n=>getComputedStyle(n).backgroundColor!==getComputedStyle(n.querySelector('[aria-selected="true"]')).backgroundColor),true,'selected segment is visually distinct');
 assert.equal(await page.locator('.scene-execute[data-scene-id="a2#t2"]').isDisabled(),true);
 const run=page.locator('.scene-execute[data-scene-id="a1#t1"]');await run.evaluate(n=>window.__runNode=n);await run.click();await run.evaluate(n=>n.click());await page.waitForFunction(()=>document.querySelector('[data-scene-id="a1#t1"]').getAttribute('aria-busy')==='false');assert.equal(await run.evaluate(n=>n===window.__runNode),true,'scene writes retain DOM');assert.equal(await page.evaluate(()=>window.__calls.filter(x=>x.data.url?.endsWith('/manual-triggers/execute')).length),1);assert.match(await run.getAttribute('aria-label'),/执行成功/);await page.waitForTimeout(2100);assert.equal(await run.isDisabled(),false);
 await page.evaluate(()=>window.__failExecute=true);await run.click();await page.waitForFunction(()=>document.querySelector('[data-scene-id="a1#t1"]').classList.contains('is-failed'));assert.match(await page.locator('#toast').innerText(),/执行失败/);
 const sceneReads=await page.evaluate(()=>window.__calls.filter(x=>x.data.url?.endsWith('/manual-triggers')).length);await page.locator('#scenes-search').fill('阅读');await page.locator('#scenes-search').press('Enter');assert.equal(await page.locator('#scenes-directory .directory-row').count(),1);assert.equal(await page.evaluate(()=>window.__calls.filter(x=>x.data.url?.endsWith('/manual-triggers')).length),sceneReads,'scene search local, no invented API');await page.locator('.directory-search-close:visible').click();await page.waitForSelector('.is-directory-searching',{state:'hidden'});
 if(out)await page.screenshot({path:join(out,`scenes-${width}-${theme}.png`)});
 await page.locator('#smart-tab-automations').click();await page.waitForSelector('.automation-switch');const toggle=page.locator('[data-automation-id="a1"]');await toggle.evaluate(n=>window.__toggleNode=n);await toggle.click();await page.waitForFunction(()=>document.querySelector('[data-automation-id="a1"]').getAttribute('aria-busy')==='false');assert.equal(await toggle.evaluate(n=>n===window.__toggleNode),true,'automation writes retain DOM');assert.equal(await toggle.getAttribute('aria-checked'),'false');
 await page.locator('#smart-tab-scenes').click();assert.equal(await run.isDisabled(),true,'automation state gates linked scene');
 await page.locator('#smart-tab-automations').click();await page.locator('#automations-search').fill('有人');await page.locator('#automations-search').press('Enter');await page.waitForFunction(()=>document.querySelectorAll('.automation-switch').length===1);await page.locator('[data-automation-id="a1"]').click();await page.waitForFunction(()=>document.querySelector('[data-automation-id="a1"]').getAttribute('aria-busy')==='false');await page.locator('.directory-search-close:visible').click();await page.waitForSelector('.is-directory-searching',{state:'hidden'});assert.equal(await toggle.getAttribute('aria-checked'),'true','search write updates restored directory snapshot');
 // Sticky sub-tabs remain below a real safe-area boundary without a scroll listener.
 await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-top','59px');scrollTo(0,220);});await page.waitForTimeout(30);assert.ok(await page.locator('.smart-segment').evaluate(n=>Math.abs(n.getBoundingClientRect().top-59)<2));
 await page.locator('#smart-tab-scenes').click();assert.ok(await page.locator('.smart-segment').evaluate(n=>Math.abs(n.getBoundingClientRect().top-59)<2));
 await page.evaluate(()=>{document.documentElement.style.removeProperty('--safe-top');scrollTo(0,0);window.LifeI18n.setLocale('zh-TW');});assert.equal(await page.locator('#smart-tab-scenes').innerText(),'場景');await page.evaluate(()=>window.LifeI18n.setLocale('en'));assert.equal(await page.locator('#smart-tab-automations').innerText(),'Automations');
 await page.locator('#smart-tab-automations').click();if(out)await page.screenshot({path:join(out,`automations-${width}-${theme}.png`)});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 console.log(`FIGMA DIRECTORY PASS ${width}px ${theme}: filters AND/cancel/reset/counts, unknown/offline, isolated search/late replies, local scenes, one-write action feedback, stable DOM, linked state, sticky safe area, i18n`);
}finally{await browser.close();}
