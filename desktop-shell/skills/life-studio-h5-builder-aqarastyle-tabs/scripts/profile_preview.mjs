#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync,existsSync,statSync,mkdirSync } from 'node:fs';
import { resolve,join,extname,sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateWorkspace } from './preview-package.mjs';
import { assertExternalQAOutput } from './qa-output.mjs';
const args=process.argv.slice(2),root=resolve(args[0]);const option=name=>args[args.indexOf(name)+1];validateWorkspace(root);
const screenshots=args.includes('--screenshots')?resolve(option('--screenshots')):null;assertExternalQAOutput(root,screenshots);if(screenshots)mkdirSync(screenshots,{recursive:true});
const server=createServer((request,response)=>{
 try{
  const url=new URL(request.url,'http://localhost'),file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+sep)||!existsSync(file)||!statSync(file).isFile()){response.writeHead(404).end();return;}
  response.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[extname(file)]||'application/octet-stream');response.end(readFileSync(file));
 }catch{response.writeHead(400).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const imported=await import(args.includes('--playwright-module')?pathToFileURL(resolve(option('--playwright-module'))).href:'playwright');
let browser;
try{
 browser=await(imported.default||imported).chromium.launch({headless:true,...(args.includes('--browser')?{executablePath:resolve(option('--browser'))}:{})});
 const page=await browser.newPage({viewport:{width:1280,height:1100}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(() => { window.__qaInitialScroll = []; window.addEventListener('scroll', () => window.__qaInitialScroll.push(scrollY), { passive: true }); });
 await page.goto(origin+'/preview/canvas.html');
 const waitSelection = async () => {
  const child=page.frames().find(item=>item.url().includes('/preview/index.html'));
  await child.waitForFunction(()=>{
   const bar=document.querySelector('#studio-tabbar'), selected=bar && bar.querySelector('[aria-selected="true"]');
   if(!bar || !selected) return false;
   const style=getComputedStyle(bar,'::after');
   return Math.abs(new DOMMatrixReadOnly(style.transform).m41 + parseFloat(style.left)-selected.offsetLeft)<=1;
  });
 };
 const frame=page.frameLocator('main > iframe');await frame.locator('.device-card').first().waitFor();
 const homeFrame=page.frames().find(item=>item.url().includes('/preview/index.html'));await homeFrame.waitForFunction(()=>/全部|All/.test(document.querySelector('#overview-coverage').textContent));
 assert.deepEqual(await homeFrame.evaluate(()=>({y:scrollY,moved:window.__qaInitialScroll.some(y=>y>1)})),{y:0,moved:false},'preview data loading must retain the page origin');
 assert.equal(await frame.locator('[data-space-id="*"]').innerText(),'我的家');
 assert.equal(await frame.locator('.preview-badge').count(),1);
 await frame.locator('#mine-button').click();
 await frame.locator('.preview-mine-panel').waitFor();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('模拟打开我的'));
 assert.equal(await frame.locator('.preview-mine-panel').getAttribute('aria-modal'),'true');
 if(screenshots)await page.screenshot({path:join(screenshots,'canvas-mine-drawer.png'),fullPage:true});
 await frame.locator('.preview-mine-close').press('Escape');
 assert.equal(await frame.locator('.preview-mine-panel').count(),0);
 assert.equal(await frame.locator('#mine-button').isDisabled(),false);
 assert.equal(await homeFrame.evaluate(()=>document.activeElement.id),'mine-button');
 assert.equal(await homeFrame.evaluate(()=>scrollY),0);
 await frame.locator('#mine-button').click();await frame.locator('.preview-mine-close').click();
 assert.equal(await frame.locator('.preview-mine-panel').count(),0);
 const drawerCapabilities=await homeFrame.evaluate(()=>window.__AQARA_NATIVE_CONTEXT__.capabilities.slice());
 await homeFrame.evaluate(()=>{window.__AQARA_NATIVE_CONTEXT__.capabilities=window.__AQARA_NATIVE_CONTEXT__.capabilities.filter(item=>item!=='openNavigationDrawer');});
 await frame.locator('#mine-button').click();assert.match(await frame.locator('#toast').innerText(),/不支持我的抽屉/);assert.equal(await frame.locator('.preview-mine-panel').count(),0);
 await homeFrame.evaluate(values=>{window.__AQARA_NATIVE_CONTEXT__.capabilities=values;},drawerCapabilities);

 await frame.locator('#ai-assistant-button').click();
 await frame.locator('.preview-ai-panel').waitFor();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('模拟打开 AI 助手'));
 assert.equal(await frame.locator('.preview-ai-panel').getAttribute('aria-modal'),'true');
 assert.match(await frame.locator('.preview-ai-panel').innerText(),/不发送消息或控制设备/);
 await frame.locator('.preview-mine-close').press('Escape');
 assert.equal(await frame.locator('.preview-ai-panel').count(),0);
 assert.equal(await homeFrame.evaluate(()=>document.activeElement.id),'ai-assistant-button');
 assert.equal(await homeFrame.evaluate(()=>scrollY),0);
 const firstQuestion=frame.locator('.ai-assistant-chip').first();
 if(await firstQuestion.count()) {
  const text=await firstQuestion.innerText();await firstQuestion.click();
  await frame.locator('.preview-ai-question').waitFor();
  assert.equal(await frame.locator('.preview-ai-question').innerText(),text);
  assert.equal(await frame.locator('.preview-ai-panel script').count(),0);
  await frame.locator('.preview-mine-close').click();
  assert.equal(await homeFrame.evaluate(()=>document.activeElement.classList.contains('ai-assistant-chip')),true);
 }
 const aiCapabilities=await homeFrame.evaluate(()=>window.__AQARA_NATIVE_CONTEXT__.capabilities.slice());
 await homeFrame.evaluate(()=>{window.__AQARA_NATIVE_CONTEXT__.capabilities=[];});
 await frame.locator('#ai-assistant-button').click();
 assert.match(await frame.locator('#toast').innerText(),/不支持 AI 助手/);
 assert.equal(await frame.locator('.preview-ai-panel').count(),0);
 await homeFrame.evaluate(values=>{window.__AQARA_NATIVE_CONTEXT__.capabilities=values;},aiCapabilities);

 if(screenshots){
  await waitSelection();await page.screenshot({path:join(screenshots,'canvas-home.png'),fullPage:true});
  await homeFrame.evaluate(()=>scrollTo(0,650));
  await page.screenshot({path:join(screenshots,'canvas-home-content-under-glass.png'),fullPage:true});
  await homeFrame.evaluate(()=>scrollTo(0,0));
 }
 const toggle=frame.locator('.device-toggle').first();const before=await toggle.getAttribute('aria-checked');await toggle.click();
 await page.waitForTimeout(2400);assert.notEqual(await toggle.getAttribute('aria-checked'),before);assert.equal(await toggle.isDisabled(),false);
 await page.evaluate(()=>{const frame=document.createElement('iframe');frame.id='sibling-preview';frame.src='index.html?scenario=typical';frame.style.display='none';document.body.append(frame);});
 // Wait for navigation before selecting the sibling frame.
 await page.waitForTimeout(300);const siblingFrame=page.frames().find(item=>item.url().includes('/preview/index.html?scenario=typical'));
 await siblingFrame.waitForFunction(()=>document.querySelector('.device-toggle'));
 assert.notEqual(await siblingFrame.locator('.device-toggle').first().getAttribute('aria-checked'),await toggle.getAttribute('aria-checked'),'sibling preview state/cache must be isolated');
 await page.locator('#sibling-preview').evaluate(element=>element.remove());
 await frame.locator('.preview-camera').first().click();assert.equal(await frame.locator('.preview-camera-image').count(),1);
 await frame.locator('#tab-devices').click();await frame.locator('.device-plugin-row').first().waitFor();
 const search=frame.locator('#devices-search');await search.fill('窗帘');await page.waitForTimeout(600);
 assert.ok((await frame.locator('.device-plugin-row').allTextContents()).every(text=>text.includes('窗帘')));
 await frame.locator('.device-plugin-row').first().click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('模拟打开设备'));
 if(await frame.locator('.directory-search-close:visible').count())await frame.locator('.directory-search-close:visible').click();await frame.locator('#tab-automation').click();await frame.locator('#smart-tab-automations').click();const auto=frame.locator('.automation-switch').first();await auto.waitFor();const enabled=await auto.getAttribute('aria-checked');await auto.click();await page.waitForTimeout(200);assert.notEqual(await auto.getAttribute('aria-checked'),enabled);
 await page.locator('#scenario').selectOption('complex');await frame.locator('.device-card').first().waitFor();
 await frame.locator('#tab-devices').click();await page.waitForTimeout(250);assert.equal(await frame.locator('.device-plugin-row').count(),200);
 await frame.locator('#devices-content > .directory-body > .directory-action').click();await page.waitForTimeout(250);assert.equal(await frame.locator('.device-plugin-row').count(),240);
 assert.equal(await frame.locator('#devices-content script').count(),0);
 if(screenshots){await waitSelection();await page.screenshot({path:join(screenshots,'canvas-devices.png'),fullPage:true});}
 await page.locator('#language').selectOption('en');await frame.locator('.device-card').first().waitFor();assert.equal(await frame.locator('#tab-automation span').innerText(),'Smart');
 await page.locator('#theme').selectOption('dark');await frame.locator('.device-card').first().waitFor();assert.equal(await frame.locator('html').getAttribute('data-theme'),'dark');
 const child=page.frames().find(item=>item.url().includes('/preview/index.html'));
 // Correct origin but wrong instance/source; it must not reset the preview.
 await child.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{protocol:'life-preview',version:'1.0',instanceId:'wrong',type:'reset',payload:{scenario:'failure'}}})));
 assert.equal(new URL(child.url()).searchParams.get('scenario'),'complex');
 await child.evaluate(()=>{const instanceId=new URLSearchParams(location.search).get('instanceId');for(const value of [{origin:'https://wrong.invalid',instanceId},{origin:location.origin,instanceId:'wrong'}])window.dispatchEvent(new MessageEvent('message',{origin:value.origin,source:parent,data:{protocol:'life-preview',version:'1.0',instanceId:value.instanceId,type:'reset',payload:{scenario:'failure'}}}));});
 assert.equal(new URL(child.url()).searchParams.get('scenario'),'complex');
 assert.equal(await child.evaluate(async()=>{try{await fetch('https://example.invalid/');return false;}catch{return true;}}),true,'CSP must deny real network requests');
 await page.locator('#scenario').selectOption('failure');await frame.locator('.device-card').first().waitFor();if(await frame.locator('.directory-search-close:visible').count())await frame.locator('.directory-search-close:visible').click();await frame.locator('#tab-automation').click();await frame.locator('#smart-tab-automations').click();await frame.locator('.automation-switch').first().waitFor();
 if(screenshots){await waitSelection();await page.screenshot({path:join(screenshots,'canvas-smart-dark.png'),fullPage:true});}
 const failing=frame.locator('.automation-switch').first();const old=await failing.getAttribute('aria-checked');await failing.click();await page.waitForTimeout(200);assert.equal(await failing.getAttribute('aria-checked'),old);assert.equal(await frame.locator('#toast').isVisible(),true);
 assert.equal(await child.evaluate(()=>typeof window.RTCPeerConnection==='function'&&window.LifeBridge.supports('cameraWebRTCPrepareLive')),false);
 const guarded=await browser.newPage();await guarded.addInitScript(()=>{window.webkit={messageHandlers:{nativeBridge:{postMessage(){throw new Error('Must not reach real host');}}}};});await guarded.goto(origin+'/preview/index.html');await guarded.waitForSelector('body > p');assert.match(await guarded.locator('body').innerText(),/cannot run inside a native host/);assert.equal(await guarded.evaluate(()=>typeof window.StudioRuntime),'undefined');await guarded.close();
 const production=await browser.newPage();await production.goto(origin+'/runtime/index.html');await production.waitForFunction(()=>!document.querySelector('#fatal-state').hidden);assert.equal(await production.evaluate(()=>Boolean(window.__PREVIEW_SCENARIOS__||window.PreviewHost||window.webkit)),false);assert.equal(await production.locator('.device-card').count(),0);await production.close();
 assert.deepEqual(errors,[]);
 console.log('PREVIEW BROWSER PASS: real UI/bridge, stateful controls, camera sample, search/pagination, plugin ack, automation rollback, scenario/theme/language, origin/instance checks, CSP, native guard and production isolation');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
