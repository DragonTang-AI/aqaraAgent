#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertExternalQAOutput} from './qa-output.mjs';
const args=process.argv.slice(2), root=resolve(args[0]), option=name=>args[args.indexOf(name)+1];
const screenshots=args.includes('--screenshots')?resolve(option('--screenshots')):null;
assertExternalQAOutput(root,screenshots);if(screenshots)mkdirSync(screenshots,{recursive:true});
const imported=await import(args.includes('--playwright-module')?pathToFileURL(resolve(option('--playwright-module'))).href:'playwright');
const browser=await(imported.default||imported).chromium.launch({headless:true,...(args.includes('--browser')?{executablePath:resolve(option('--browser'))}:{})});
const results=[];
try {
 for(const scenario of ['empty','motion','switch','all','late']) {
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(scenario=>{
   window.__calls=[];window.__aiCalls=[];window.__aiStatusCalls=[];window.__aiStatusValue=true;window.__heldDefinitions=[];window.__releaseAI=()=>window.H5Invoke(window.__aiCalls.at(-1).data.onSuccess,{code:0,data:{accepted:true}});
   window.__AQARA_NATIVE_CONTEXT__={platform:'ios',capabilities:['nativeHttpRequest','subscribeThemeMode','openAIAssistant','aiAssistantInitialMessage','subscribeUserAIAgentStatus','getCurrentPageVisibility']};
   const bool=(traitCode,value)=>({traitCode,value,parameter:{type:'Bool',readable:true,writable:false}});
   const range={traitCode:'CurrentLevel',value:55,parameter:{type:'Integer',min:0,max:100,step:1,readable:true,writable:true}};
   const count=scenario==='empty'?0:scenario==='all'||scenario==='late'?16:1;
   const devices=Array.from({length:count},(_,i)=>({deviceId:'qa-ai-'+i,deviceName:i===0?'客厅灯 <script>安全文本</script>':'设备 '+i,deviceTypesList:[scenario==='motion'||i===14?'Sensor':'Light'],state:scenario==='all'?i!==3:true,space:{spaceId:'qa-living',name:'客厅'}}));
   const definitions=devices.map((d,i)=>({deviceId:d.deviceId,endpoints:[{endpointId:1,deviceType:d.deviceTypesList[0],functions:[{functionCode:'ActualFunction',commands:[],traits:scenario==='motion'?[bool('MotionDetected',true)]:i===14?[bool('OccupancySensed',false)]:scenario==='switch'?[{...bool('OnOff',true),parameter:{type:'Bool',readable:true,writable:true}}]:scenario==='late'?[]:[range]}]}]}));
   window.__releaseDefinitions=()=>{window.__heldDefinitions.splice(0).forEach(fn=>fn());};
   window.webkit={messageHandlers:{nativeBridge:{postMessage(invocation){
    const {action,data}=invocation;
    if(action==='openAIAssistant'){window.__aiCalls.push(invocation);return;}
    if(action==='subscribeUserAIAgentStatus'){window.__aiStatusCalls.push(invocation);queueMicrotask(()=>window.H5Invoke(data.onSuccess,{code:0,data:{status:window.__aiStatusValue}}));return;}
    if(action==='getCurrentPageVisibility'){queueMicrotask(()=>window.H5Invoke(data.onSuccess,{code:0,data:{documentId:'ai-fixture',sequence:0,visible:true}}));return;}
    if(action==='subscribeThemeMode'){queueMicrotask(()=>window.H5Invoke(data.onSuccess,{code:0,data:{themeMode:'light'}}));return;}
    window.__calls.push(data);let value;
    if(data.url.endsWith('/devices'))value={data:devices.slice((data.params.pageNum-1)*data.params.pageSize,data.params.pageNum*data.params.pageSize),totalCount:devices.length};
    else if(data.url.endsWith('/spaces'))value=[{spaceId:'qa-root',name:'真实家庭',children:[{spaceId:'qa-living',name:'客厅'}]}];
    else if(data.url.endsWith('/definitions'))value=definitions.filter(d=>data.params.deviceIds.split(',').includes(d.deviceId));
    else value=[];
    const complete=()=>window.H5Invoke(data.onSuccess,{code:0,data:value});
    if(scenario==='late'&&data.url.endsWith('/definitions')&&data.params.deviceIds.includes('qa-ai-14'))window.__heldDefinitions.push(complete);
    else queueMicrotask(complete);
   }}}};
  },scenario);
  await page.goto(pathToFileURL(join(root,'index.html')).href);
  await page.waitForFunction(()=>document.querySelector('#app').getAttribute('aria-busy')==='false');
  const ai=page.locator('#ai-assistant-button'), suggestions=page.locator('#ai-assistant-suggestions');
  await ai.waitFor({state:'visible'});
  assert.equal(await ai.isVisible(),true);
  if(scenario==='empty') {
   const before=await page.evaluate(()=>window.__aiStatusCalls.length);
   await page.evaluate(()=>{window.__aiStatusValue=false;window.H5Invoke('PageVisibilityChanged',{code:0,data:{documentId:'ai-fixture',sequence:1,visible:false}});window.H5Invoke('PageVisibilityChanged',{code:0,data:{documentId:'ai-fixture',sequence:2,visible:true}});});
   await page.waitForFunction(before=>window.__aiStatusCalls.length>before,before);
   await ai.waitFor({state:'hidden'});
   await page.evaluate(()=>window.__aiStatusValue=true);
   await page.evaluate(()=>window.H5Invoke('UserAIAgentStatusUpdate',{code:0,data:{status:false}}));
   assert.equal(await ai.isVisible(),false,'disabled native status hides the complete AI section');
   await page.evaluate(()=>window.H5Invoke('UserAIAgentStatusUpdate',{code:0,data:{status:true}}));
   await ai.waitFor({state:'visible'});
  }
  if(['empty','motion','switch'].includes(scenario)) {
   assert.equal(await suggestions.isVisible(),false);
   assert.equal(await page.locator('.ai-assistant-chip').count(),0);
   assert.ok((await ai.boundingBox()).height<=64,'no-suggestion card shrinks');
  } else if(scenario==='all') {
   await page.waitForFunction(()=>document.querySelectorAll('.ai-assistant-chip').length===3);
   assert.deepEqual(await page.locator('.ai-assistant-chip').allTextContents(),['看看客厅有没有人？','把客厅的灯光调暗一点','看看客厅有哪些设备离线？']);
   assert.equal(await page.locator('#ai-assistant-section script').count(),0);
  } else {
   await page.waitForFunction(()=>window.__heldDefinitions.length>0);
   assert.equal(await suggestions.isVisible(),false);
   await page.evaluate(()=>scrollTo(0,650));
   const before=await page.locator('.device-card').first().boundingBox();
   await page.evaluate(()=>window.__releaseDefinitions());
   await page.waitForFunction(()=>document.querySelector('.ai-assistant-chip'));
   const after=await page.locator('.device-card').first().boundingBox();
   assert.ok(Math.abs(after.y-before.y)<=1,'late AI row preserves the current reading anchor');
   await page.evaluate(()=>scrollTo(0,0));
  }
  assert.equal(await page.evaluate(()=>scrollY),0);
  const beforeCalls=await page.evaluate(()=>window.__calls.length);
  await page.evaluate(()=>{document.querySelector('#ai-assistant-button').click();document.querySelector('#ai-assistant-button').click();});
  assert.equal(await page.evaluate(()=>window.__aiCalls.length),1);
  assert.equal(await ai.isDisabled(),true);
  await page.evaluate(()=>window.__releaseAI());
  await page.waitForFunction(()=>!document.querySelector('#ai-assistant-button').disabled);
  if(scenario==='empty') {
   await ai.click();
   await page.evaluate(()=>window.H5Invoke(window.__aiCalls.at(-1).data.onSuccess,{code:0,data:{accepted:false,reason:'disabled',status:false}}));
   await ai.waitFor({state:'hidden'});
   assert.match(await page.locator('#toast').innerText(),/已关闭/);
   await page.evaluate(()=>window.H5Invoke('UserAIAgentStatusUpdate',{code:0,data:{status:true}}));
   await ai.waitFor({state:'visible'});
  }
  assert.equal(await page.evaluate(()=>window.__calls.length),beforeCalls,'AI action sends no HTTP/device writes');
  if(scenario==='all') {
   const chips=page.locator('.ai-assistant-chip');
   assert.equal(await page.locator('button button').count(),0);
   const question=await chips.first().innerText();
   await chips.first().click();
   assert.equal(await page.evaluate(()=>window.__aiCalls.at(-1).data.content),question);
   assert.equal(await ai.isDisabled(),true);
   assert.equal(await chips.first().isDisabled(),true);
   const locked=await page.evaluate(()=>window.__aiCalls.length);
   await page.evaluate(()=>{document.querySelector('#ai-assistant-button').click();document.querySelectorAll('.ai-assistant-chip')[1].click();});
   assert.equal(await page.evaluate(()=>window.__aiCalls.length),locked,'question and entry share one lock');
   await page.evaluate(()=>window.__releaseAI());await page.waitForFunction(()=>!document.querySelector('#ai-assistant-button').disabled);
   await page.evaluate(()=>window.__AQARA_NATIVE_CONTEXT__.capabilities=window.__AQARA_NATIVE_CONTEXT__.capabilities.filter(value=>value!=='aiAssistantInitialMessage'));
   await chips.first().click();assert.equal(await page.evaluate(()=>window.__aiCalls.length),locked);
   assert.match(await page.locator('#toast').innerText(),/携带问题/);
   await page.evaluate(()=>window.__AQARA_NATIVE_CONTEXT__.capabilities.push('aiAssistantInitialMessage'));
   for(const [language,theme,width] of [['zh-CN','light',390],['zh-TW','dark',320],['en','dark',320],['en','light',768]]) {
    await page.setViewportSize({width,height:844});
    await page.evaluate(({language,theme})=>{window.LifeI18n.setLocale(language);document.documentElement.dataset.theme=theme;}, {language,theme});
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.ai-assistant-chip').count(),3);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
    assert.ok((await ai.boundingBox()).height>=44);
    assert.ok((await chips.first().boundingBox()).height>=44);
    const localized=await chips.first().innerText();await chips.first().click();
    assert.equal(await page.evaluate(()=>window.__aiCalls.at(-1).data.content),localized);
    await page.evaluate(()=>window.__releaseAI());await page.waitForFunction(()=>!document.querySelector('#ai-assistant-button').disabled);
    if(screenshots)await page.screenshot({path:join(screenshots,`${language}-${theme}-${width}.png`)});
   }
   await page.evaluate(()=>{window.__AQARA_NATIVE_CONTEXT__.capabilities=[];});
   const beforeUnsupported=await page.evaluate(()=>window.__aiCalls.length);
   await ai.click();assert.match(await page.locator('#toast').innerText(),/does not support/);
   assert.equal(await page.evaluate(()=>window.__aiCalls.length),beforeUnsupported,'empty legacy capabilities must fail closed');
  }
  if(scenario==='empty'&&screenshots){await page.waitForTimeout(150);assert.equal(await page.locator('#topbar').count(),1);assert.equal(await page.locator('#studio-tabbar').isVisible(),true);await page.screenshot({path:join(screenshots,'empty-compact.png')});}
  assert.deepEqual(errors,[]);results.push(scenario);await page.close();
 }
 console.log('AI BROWSER PASS: '+results.join(', ')+'; compact/late evidence, origin and anchors, themes/locales/widths, duplicate navigation and zero action requests');
} finally {await browser.close();}
