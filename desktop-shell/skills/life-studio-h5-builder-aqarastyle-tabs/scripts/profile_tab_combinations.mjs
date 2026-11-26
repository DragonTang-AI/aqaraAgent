#!/usr/bin/env node
// Generate and exercise all supported page combinations in an isolated QA directory.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);const option=name=>args[args.indexOf(name)+1];
const scripts=dirname(fileURLToPath(import.meta.url));
const pkg=await import(args.includes('--playwright-module')?pathToFileURL(resolve(option('--playwright-module'))).href:'playwright');
const sandbox=mkdtempSync(join(tmpdir(),'aqara-tab-combinations-'));
const browser=await (pkg.default||pkg).chromium.launch({headless:true,...(args.includes('--browser')?{executablePath:resolve(option('--browser'))}:{})});
try{
 for(const tabs of [['home'],['home','devices'],['home','automation'],['home','devices','automation']]){
  const output=join(sandbox,tabs.join('-'));
  const generate=spawnSync(process.execPath,[join(scripts,'generate_h5.mjs'),'--output',output,'--tabs',tabs.join(',')],{encoding:'utf8'});assert.equal(generate.status,0,generate.stderr);
  const validate=spawnSync(process.execPath,[join(scripts,'validate_h5.mjs'),output],{encoding:'utf8'});assert.equal(validate.status,0,validate.stderr);
  const page=await browser.newPage({viewport:{width:390,height:844},locale:'zh-CN'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   window.__qaRequests=[];window.__qaCalls=[];window.__AQARA_NATIVE_CONTEXT__={platform:'ios',capabilities:['nativeHttpRequest','subscribeThemeMode','openDevicePlugin','getCurrentStudioConnectStatus']};
   window.webkit={messageHandlers:{nativeBridge:{postMessage({action,data}){
    let response;if(action==='subscribeThemeMode')response={themeMode:'light'};
    else if(action==='getCurrentStudioConnectStatus')response={studioDid:'qa-studio',studioName:'QA',connectStatus:'local'};
    else if(action==='openDevicePlugin')response={accepted:true};
    else{
     window.__qaRequests.push(data.url);window.__qaCalls.push({url:data.url,params:data.params});
     if(data.url.endsWith('/devices'))response={data:[{deviceId:'api-id',deviceName:'真实设备',state:true,deviceTypesList:['Light'],space:{spaceId:'room',name:'客厅'}}],totalCount:1};
     else if(data.url.endsWith('/spaces'))response=[{spaceId:'room',name:'客厅'}];
     else if(data.url.endsWith('/automations'))response={data:[{automationId:'api-auto',name:'自动化',enabled:true}],totalCount:1};
     else response=[];
    }
    queueMicrotask(()=>window.H5Invoke(data.onSuccess,{code:0,data:response}));
   }}}};
  });
  await page.goto(pathToFileURL(join(output,'index.html')).href);await page.waitForFunction(()=>document.getElementById('app').getAttribute('aria-busy')==='false');
  assert.deepEqual(await page.evaluate(()=>window.__LIFE_STUDIO_DASHBOARD_CONFIG__.tabs),tabs);
  assert.equal(await page.locator('#mine-button').isVisible(),true,'Home includes Mine regardless of tab count');
  assert.equal(await page.locator('#studio-tabbar').isVisible(),tabs.length>1);
  assert.equal(await page.locator('[role="tab"]:visible').count(),tabs.length===1?0:tabs.length);
  for(const id of ['devices','automation'])assert.equal(await page.locator(`#${id}-panel`).count(),tabs.includes(id)?1:0);
  const padding=await page.locator('#app').evaluate(node=>parseFloat(getComputedStyle(node).paddingBottom));assert.ok(tabs.length===1?padding<100:padding>=112,'single home retains original bottom spacing');
  const verifySelection = async () => {
   await page.waitForFunction(() => {
    const bar=document.querySelector('#studio-tabbar'), selected=bar.querySelector('[aria-selected="true"]');
    const style=getComputedStyle(bar,'::after'), shift=new DOMMatrixReadOnly(style.transform).m41;
    return Math.abs(shift + parseFloat(style.left) - selected.offsetLeft) <= 1;
   });
   const fill=await page.locator('#studio-tabbar').evaluate(bar => {
    const selected=bar.querySelector('[aria-selected="true"]');
    return {widthDelta:Math.abs(parseFloat(getComputedStyle(bar,'::after').width)-selected.getBoundingClientRect().width),buttonBlur:getComputedStyle(selected).backdropFilter};
   });
   assert.ok(fill.widthDelta<=1,'selection must fit both two-tab and three-tab layouts');
   assert.ok(!fill.buttonBlur || fill.buttonBlur==='none','selected item must not stack another backdrop');
  };
  if(tabs.length>1) await verifySelection();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.evaluate(()=>StudioTabs.prefetch());
  const beforeTab=await page.evaluate(()=>window.__qaCalls);assert.equal(beforeTab.filter(r=>r.url.endsWith('/spaces')).length,1);assert.equal(beforeTab.filter(r=>r.url.endsWith('/scenes')).length,1);assert.equal(beforeTab.filter(r=>r.url.endsWith('/automations')).length,tabs.includes('automation')?1:0);assert.equal(await page.locator('.device-plugin-row').count(),0,'prefetch mounts no hidden directory rows');assert.equal(await page.locator('.automation-switch').count(),0);
  for(const tab of tabs.slice(1)){
   await page.locator(`#tab-${tab}`).click();
   if(tab==='automation')await page.locator('#smart-tab-automations').click();
   await page.waitForSelector(tab==='devices'?'.device-plugin-row':'.automation-switch');
   assert.equal(await page.locator(`#tab-${tab} span`).innerText(),tab==='devices'?'设备':'智能');
   assert.equal((await page.evaluate(()=>window.__qaCalls)).length,beforeTab.length,'first Tab entry reuses prefetched lists');
   await verifySelection();
   assert.equal(await page.locator(`#${tab}-panel`).isVisible(),true);assert.equal(await page.locator('#topbar').isVisible(),false);
  }
  if(tabs.length>1){await page.locator(`#tab-${tabs.at(-1)}`).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#tab-home').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#topbar').isVisible(),true);await page.keyboard.press('ArrowLeft');assert.equal(await page.locator(`#tab-${tabs.at(-1)}`).getAttribute('aria-selected'),'true');}
  if(tabs.length>1){
   await verifySelection();
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.ok(await page.locator('#studio-tabbar').evaluate(bar=>parseFloat(getComputedStyle(bar,'::after').transitionDuration)<=0.00001),'reduced motion must remove the visible selection animation');
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const requests=await page.evaluate(()=>window.__qaRequests);if(!tabs.includes('automation'))assert.equal(requests.some(url=>url.endsWith('/automations')),false);
  assert.deepEqual(errors,[]);await page.close();console.log(`COMBINATION PASS ${tabs.join(',')}`);
 }
 const invalid=spawnSync(process.execPath,[join(scripts,'generate_h5.mjs'),'--output',join(sandbox,'invalid'),'--tabs','devices'],{encoding:'utf8'});assert.notEqual(invalid.status,0);
}finally{await browser.close();rmSync(sandbox,{recursive:true,force:true});}
