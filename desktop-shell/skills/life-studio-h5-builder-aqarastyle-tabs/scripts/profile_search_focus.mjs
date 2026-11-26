#!/usr/bin/env node
// Search appearance regression using a simulated native host, never a real Studio.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertExternalQAOutput} from './qa-output.mjs';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1],root=resolve(args[0]);
const output=args.includes('--screenshots')?resolve(option('--screenshots')):null;assertExternalQAOutput(root,output);if(output)mkdirSync(output,{recursive:true});
const imported=await import(args.includes('--playwright-module')?pathToFileURL(resolve(option('--playwright-module'))).href:'playwright');
const browser=await(imported.default||imported).chromium.launch({headless:true,...(args.includes('--browser')?{executablePath:resolve(option('--browser'))}:{})});
try{for(const mobile of [true,false])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:mobile,isMobile:mobile});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(theme=>{
  window.__AQARA_NATIVE_CONTEXT__={platform:'ios',capabilities:['nativeHttpRequest','subscribeThemeMode','openDevicePlugin']};
  window.webkit={messageHandlers:{nativeBridge:{postMessage({action,data}){
   let result=[];
   if(action==='subscribeThemeMode')result={themeMode:theme};
   else if(data.url?.endsWith('/devices'))result={data:[{deviceId:'d1',deviceName:'客厅灯',deviceTypesList:['Light'],state:true}],totalCount:1};
   else if(data.url?.endsWith('/scenes'))result=[{automationId:'a1',triggerNodeId:'t1',triggerName:'回家',enabled:true}];
   else if(data.url?.endsWith('/automations'))result={data:[{automationId:'a2',name:'开灯',enabled:true}],totalCount:1};
   queueMicrotask(()=>window.H5Invoke(data.onSuccess,{code:0,data:result}));
  }}}};
 },theme);
 await page.goto(pathToFileURL(join(root,'index.html')).href);await page.waitForFunction(()=>document.querySelector('#app').getAttribute('aria-busy')==='false');
 for(const key of ['devices','scenes','automations']){
  await page.locator(key==='devices'?'#tab-devices':'#tab-automation').click();if(key!=='devices')await page.locator('#smart-tab-'+key).click();
  const input=page.locator('#'+key+'-search');await input.waitFor();
  if(mobile)await input.tap();else{await page.locator(key==='devices'?'.directory-menu:visible':'#smart-tab-'+key).focus();await page.keyboard.press('Tab');}
  await page.waitForSelector('.is-directory-searching');
  const geometry=await input.evaluate(n=>{const style=getComputedStyle(n),wrapper=n.closest('.directory-search'),rect=n.getBoundingClientRect(),box=wrapper.getBoundingClientRect();return{outline:style.outlineWidth,outlineStyle:style.outlineStyle,shadow:style.boxShadow,appearance:style.webkitAppearance||style.appearance,height:rect.height,font:style.fontSize,inside:rect.left>=box.left&&rect.right<=box.right,wrapperOutline:getComputedStyle(wrapper).outlineWidth,wrapperOutlineStyle:getComputedStyle(wrapper).outlineStyle,coarse:matchMedia('(pointer:coarse)').matches};});

  assert.equal(geometry.outlineStyle,'none','text region must not acquire the shared input focus ring');assert.equal(geometry.shadow,'none');assert.equal(geometry.appearance,'none');assert.equal(geometry.height,44);assert.equal(geometry.font,'16px');assert.equal(geometry.inside,true);assert.equal(geometry.wrapperOutlineStyle,mobile?'none':'solid','desktop focus belongs to the complete capsule');if(!mobile)assert.equal(geometry.wrapperOutline,'2px');assert.equal(geometry.coarse,mobile);
  if(output)await page.screenshot({path:join(output,`${key}-${mobile?'touch':'keyboard'}-${theme}.png`)});
  await input.fill(key==='scenes'?'回':'灯');await input.press('Enter');await page.locator('.directory-search-close:visible').click();await page.waitForSelector('.is-directory-searching',{state:'hidden'});
  assert.equal(await page.locator('#studio-tabbar').isVisible(),true);assert.equal(await page.evaluate(()=>document.body.style.position),'');
 }
 assert.deepEqual(errors,[]);console.log(`SEARCH FOCUS PASS ${mobile?'touch':'keyboard'} ${theme}: Devices/Scenes/Automations, single capsule, 44px, focus and close`);await context.close();
}}finally{await browser.close();}
