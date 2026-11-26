#!/usr/bin/env node
// QA-only fixtures. No fixture records are copied into generated packages.
import assert from 'node:assert/strict';
import { pullGesture, verifyPullRefresh, verifyTrustedListPull } from './pull_refresh_qa.mjs';
import { assertExternalQAOutput } from './qa-output.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const args = process.argv.slice(2); const option = name=>args[args.indexOf(name)+1];
const dir = resolve(args[0]); const width = args.includes('--width') ? Number(option('--width')) : 390;
const theme = args.includes('--theme') ? option('--theme') : 'light'; const platform = args.includes('--platform') ? option('--platform') : 'ios';
const out = args.includes('--screenshots') ? resolve(option('--screenshots')) : null; assertExternalQAOutput(dir,out); if(out) mkdirSync(out,{recursive:true});
const module = await import(args.includes('--playwright-module') ? pathToFileURL(resolve(option('--playwright-module'))).href : 'playwright');
const browser = await (module.default || module).chromium.launch({headless:true,...(args.includes('--browser') ? {executablePath:resolve(option('--browser'))} : {})});
const errors = [];const page = await browser.newPage({viewport:{width,height:args.includes('--height') ? Number(option('--height')) : 844}});page.on('pageerror',e=>errors.push(e.message));
try {
 await page.addInitScript(({theme,platform})=>{
  window.__calls=[];window.__failScene=false;window.__failSceneExecute=false;window.__failPage=false;window.__failSpaces=false;window.__empty=false;window.__failStatus=false;window.__statusEmpty=false;
  window.__AQARA_NATIVE_CONTEXT__={platform,capabilities:['nativeHttpRequest','subscribeThemeMode','openDevicePlugin']};
  const devices=Array.from({length:201},(_,i)=>({deviceId:`device-${i}`,deviceName:i===0?'超长名称的摄像机 <script>不可作为HTML执行</script>':i===1?'客厅智能窗帘':`真实设备 ${i}`,deviceTypesList:[i===0?'Camera':i===1?'WindowCovering':'Light'],state:i%3===0?false:true,space:i===2?null:{spaceId:`space-${i%2}`,name:'同名空间'}}));
  window.__holdPullReads=false;window.__heldPullReads=[];window.__releasePullReads=()=>{window.__holdPullReads=false;const held=window.__heldPullReads.splice(0);held.forEach(invoke);};
  function invoke({action,data}){
   if(window.__holdPullReads && action==='nativeHttpRequest'){window.__heldPullReads.push({action,data});return;}
   window.__calls.push({action,data});let response;
   if(action==='openDevicePlugin')response={accepted:true};
   else if(action==='subscribeThemeMode')response={themeMode:theme};
   else if(data.url.endsWith('/automations/status')){
    if(window.__failStatus){setTimeout(()=>window.H5Invoke(data.onFailed,{code:500,message:'status failed'}),80);return;}
    setTimeout(()=>window.H5Invoke(data.onSuccess,{code:0,data:{successIds:window.__statusEmpty?[]:data.data.automationIds,failedItems:[]}}),80);return;
   }
   else if(data.url.endsWith('/devices')) {
    if(window.__failPage&&data.params.pageNum===2){queueMicrotask(()=>window.H5Invoke(data.onFailed,{code:500,message:'fixture failure'}));return;}
    response={data:devices.slice((data.params.pageNum-1)*data.params.pageSize,data.params.pageNum*data.params.pageSize),totalCount:devices.length};
   }
   else if(data.url.endsWith('/spaces')){
    if(window.__failSpaces){queueMicrotask(()=>window.H5Invoke(data.onFailed,{code:500,message:'space failure'}));return;}
    response=[{spaceId:'space-0',name:'同名空间'},{spaceId:'space-1',name:'同名空间'}];
   }
   else if(data.url.endsWith('/definitions'))response=[];
   else if(data.url.endsWith('/scenes/execute')||data.url.endsWith('/automations/manual-triggers/execute')){
    if(window.__failSceneExecute){queueMicrotask(()=>window.H5Invoke(data.onFailed,{code:503,message:'Native scene failure'}));return;}
    response={};
   }
   else if(data.url.endsWith('/scenes')){
    if(window.__empty){queueMicrotask(()=>window.H5Invoke(data.onSuccess,{code:0,data:[]}));return;}
    if(window.__failScene){queueMicrotask(()=>window.H5Invoke(data.onFailed,{code:500,message:'fixture failure'}));return;}
    response=[{automationId:'scene-a',triggerNodeId:'trigger-a',triggerName:'回家',enabled:true,space:{spaceId:'space-0',name:'同名空间'}},{automationId:'scene-b',triggerNodeId:'trigger-b',triggerName:'睡眠',enabled:false}];
   }
   else if(data.url.endsWith('/automations')&&window.__empty)response={data:[],totalCount:0};
   else if(data.url.endsWith('/automations'))response={data:[{automationId:'auto-a',name:'有人时打开走廊灯',enabled:true,space:{spaceId:'space-0',name:'同名空间'}},{automationId:'auto-b',name:'夜间安防',enabled:false}],totalCount:2};
   else response=[];
   queueMicrotask(()=>window.H5Invoke(data.onSuccess,{code:0,data:response}));
  }
  if(platform==='android')window.prompt=(action,data)=>{invoke({action,data:JSON.parse(data)});return '';};
  else window.webkit={messageHandlers:{nativeBridge:{postMessage:invoke}}};
 },{theme,platform});
 await page.goto(pathToFileURL(join(dir,'index.html')).href);
 assert.equal(await page.locator('#refresh-button').count(),0,'top-right refresh button must be absent');
 await page.waitForFunction(()=>window.__LIFE_STUDIO_DASHBOARD_CONFIG__.homeDeviceMode==='favorites'?document.querySelector('#favorite-devices-section') && !window.StudioHomeRefresh.busy():document.querySelector('.device-card'));
 assert.equal(await page.locator('#studio-tabbar [role=tab]').count(),3);
 if(out)await page.screenshot({animations:'disabled',path:join(out,`home-${width}-${theme}-${platform}.png`)});
 await page.locator('#tab-devices').click();await page.waitForFunction(()=>document.querySelectorAll('.device-plugin-row').length===200).catch(async error=>{console.error(JSON.stringify({errors,state:await page.evaluate(()=>({tab:window.StudioTabs && window.StudioTabs.active(),rows:document.querySelectorAll('.device-plugin-row').length,text:document.querySelector('#devices-content').textContent,calls:window.__calls.map(c=>({action:c.action,url:c.data.url,params:c.data.params}))}))}));throw error;});assert.equal(await page.locator('#topbar').isVisible(),false);
 assert.equal(await page.locator('#devices-content .directory-group').count(),3,'group by IDs plus unassigned');
 await page.locator('.device-plugin-row').first().click();assert.equal(await page.evaluate(()=>window.__calls.filter(x=>x.action==='openDevicePlugin').at(-1).data.deviceId),'device-0');
 assert.equal(await page.locator('#devices-content script').count(),0,'API text cannot inject HTML');
 if(out)await page.screenshot({animations:'disabled',path:join(out,`devices-${width}-${theme}-${platform}.png`)});
 await page.evaluate(()=>{window.__failPage=true;});await page.locator('#devices-content > .directory-body > .directory-action').click();await page.waitForFunction(()=>document.querySelector('#devices-content > .directory-body > .directory-action')?.textContent==='重试');
 assert.equal(await page.locator('.device-plugin-row').count(),200);await page.evaluate(()=>{window.__failPage=false;});await page.locator('#devices-content > .directory-body > .directory-action').click();await page.waitForFunction(()=>document.querySelectorAll('.device-plugin-row').length===201);
 assert.equal(await page.locator('#devices-content .directory-group').last().getAttribute('data-space-id'),'','unassigned is last');
 await page.evaluate(()=>{window.__failScene=true;});await page.locator('#tab-automation').click();await page.waitForSelector('#automations-directory .directory-row',{state:'attached'});assert.equal(await page.locator('#topbar').isVisible(),false);
 await page.waitForSelector('#scenes-directory .directory-action');assert.equal(await page.locator('#automations-directory .directory-row').count(),2);
 await page.evaluate(()=>{window.__failScene=false;});await page.locator('#scenes-directory .directory-action').click();await page.waitForSelector('#scenes-directory .directory-row');
 assert.equal(await page.locator('#scenes-directory .directory-row').count(),2);assert.match(await page.locator('#scenes-directory').innerText(),/已停用/);
 await page.evaluate(()=>{window.__failSceneExecute=true;});await page.locator('#scenes-directory .scene-execute').first().click();await page.waitForFunction(()=>document.querySelector('#scenes-directory .scene-execute.is-failed'));assert.equal(await page.locator('#toast').innerText(),'操作失败，请重试');await page.evaluate(()=>{window.__failSceneExecute=false;});
 if(out)await page.screenshot({animations:'disabled',path:join(out,`automation-${width}-${theme}-${platform}.png`)});
 await page.locator('#smart-tab-automations').click();
 const toggle=page.locator('.automation-switch[data-automation-id="auto-a"]');
 assert.equal(await toggle.getAttribute('aria-checked'),'true');
 const writes=()=>page.evaluate(()=>window.__calls.filter(x=>x.data.url?.endsWith('/automations/status')));
 await toggle.click();await toggle.evaluate(node=>node.click());await page.waitForFunction(()=>document.querySelector('[data-automation-id="auto-a"]').getAttribute('aria-busy')==='false');
 assert.equal(await toggle.getAttribute('aria-checked'),'false');assert.equal((await writes()).length,1);assert.deepEqual((await writes())[0].data.data,{automationIds:['auto-a'],enabled:false});
 await toggle.click();await page.waitForFunction(()=>document.querySelector('[data-automation-id="auto-a"]').getAttribute('aria-busy')==='false');assert.equal(await toggle.getAttribute('aria-checked'),'true');
 await page.evaluate(()=>{window.__failStatus=true;});await toggle.click();await page.waitForFunction(()=>document.querySelector('[data-automation-id="auto-a"]').getAttribute('aria-busy')==='false');assert.equal(await toggle.getAttribute('aria-checked'),'true');assert.match(await page.locator('#toast').innerText(),/更新失败/);
 await page.evaluate(()=>{window.__failStatus=false;window.__statusEmpty=true;});await toggle.click();await page.waitForFunction(()=>document.querySelector('[data-automation-id="auto-a"]').getAttribute('aria-busy')==='false');assert.equal(await toggle.getAttribute('aria-checked'),'true');
 await page.evaluate(()=>{window.__statusEmpty=false;window.__AQARA_NATIVE_CONTEXT__.capabilities=['openDevicePlugin','subscribeThemeMode'];window.LifeI18n.setLocale('zh-TW');});assert.equal(await toggle.isDisabled(),true);await page.evaluate(()=>{window.__AQARA_NATIVE_CONTEXT__.capabilities=['nativeHttpRequest','openDevicePlugin','subscribeThemeMode'];window.LifeI18n.setLocale('zh-CN');});
 const count=await page.evaluate(()=>window.__calls.length);await page.locator('#tab-devices').click();await page.locator('#tab-automation').click();assert.equal(await page.evaluate(()=>window.__calls.length),count,'warm switches do not fetch');
 await page.locator('#tab-automation').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#tab-devices').getAttribute('aria-selected'),'true');
 await page.evaluate(()=>{window.__AQARA_NATIVE_CONTEXT__.capabilities=['nativeHttpRequest','subscribeThemeMode'];});await page.locator('.device-plugin-row').first().click();assert.match(await page.locator('#toast').innerText(),/更新 App/);
 await page.evaluate(()=>{window.__AQARA_NATIVE_CONTEXT__.capabilities=[];window.dispatchEvent(new Event('aqara:native-context-ready'));});assert.equal(await page.locator('#devices-content').innerText().then(text=>text.includes('更新 App')),false);const priorNavigation=await page.evaluate(()=>window.__calls.filter(item=>item.action==='openDevicePlugin').length);await page.locator('.device-plugin-row').first().click();assert.equal(await page.evaluate(()=>window.__calls.filter(item=>item.action==='openDevicePlugin').length),priorNavigation+1);
 await page.evaluate(()=>window.LifeI18n.setLocale('en'));assert.equal(await page.locator('#tab-home span').innerText(),'Home');assert.equal(await page.locator('#tab-devices span').innerText(),'Devices');assert.equal(await page.locator('#tab-automation span').innerText(),'Smart');
 await verifyPullRefresh(page);
 await verifyTrustedListPull(page);
 await page.locator('#tab-automation').click();await page.locator('#smart-tab-scenes').click();assert.match(await page.locator('#scenes-directory').innerText(),/Disabled/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 const geometry=await page.evaluate(()=>({nav:document.querySelector('#studio-tabbar').getBoundingClientRect().toJSON(),last:document.querySelector('#automation-content .smart-directory:not([hidden])').getBoundingClientRect().toJSON()}));assert.ok(geometry.last.bottom<=geometry.nav.top,'last row clears bottom navigation');
 await page.evaluate(()=>{window.__empty=true;window.scrollTo(0,0);});await pullGesture(page);await page.waitForFunction(()=>document.querySelector('#scenes-directory .directory-message')?.textContent==='No scenes yet');await page.locator('#smart-tab-automations').click();await page.evaluate(()=>scrollTo(0,0));await pullGesture(page,{selector:'#automations-directory'});await page.waitForFunction(()=>document.querySelector('#automations-directory .directory-message')?.textContent==='No automations yet');
 await page.locator('#tab-home').click();assert.equal(await page.locator('#home-panel').isVisible(),true);assert.equal(await page.locator('#topbar').isVisible(),true);assert.equal(await page.locator('#devices-panel').isVisible(),false);
 assert.deepEqual(errors,[]);if(out)writeFileSync(join(out,`verification-${width}-${theme}-${platform}.md`),`# 三 Tab 浏览器自查\n\n视口 ${width}px，主题 ${theme}，桥接 ${platform}。测试通过：空间 ID 分组、分页失败保留与重试、真实记录 ID 跳转参数、文本注入防护、场景/自动化失败隔离、停用状态、空列表、tab 缓存、键盘切换、语言切换、自动化启用/停用、重复点击拦截、失败与空successIds保留原状态、无横向溢出和底部遮挡。\n\n截图使用 QA 脚本中的模拟接口数据，仅证明界面与桥接契约；生产 H5 不含这些夹具。真实 Studio 鉴权、设备插件实际呈现及摄像机局域网/远程连续性仍须真机验证。没有执行真机 build 或运行。\n`);console.log(`TABS PROFILE PASS (${width}px ${theme}, ${platform}: grouping, paginated retry, navigation, text safety, failure isolation, disabled status, warm tabs, keyboard, locale, automation switches, overlap and isolated controlled pull refresh)`);
} finally{await browser.close();}
