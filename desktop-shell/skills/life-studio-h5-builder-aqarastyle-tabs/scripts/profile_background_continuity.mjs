#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateWorkspace} from './preview-package.mjs';
import {assertExternalQAOutput} from './qa-output.mjs';
const args=process.argv.slice(2),root=resolve(args[0]),opt=n=>args[args.indexOf(n)+1];validateWorkspace(root);
const qa=args.includes('--screenshots')?resolve(opt('--screenshots')):null;assertExternalQAOutput(root,qa);if(qa)mkdirSync(qa,{recursive:true});
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+sep)||!existsSync(p)||!statSync(p).isFile())throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const imported=await import(args.includes('--playwright-module')?pathToFileURL(resolve(opt('--playwright-module'))).href:'playwright');const browser=await(imported.default||imported).chromium.launch({headless:true,...(args.includes('--browser')?{executablePath:resolve(opt('--browser'))}:{})});const results=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/preview/index.html');await page.waitForFunction(()=>document.querySelector('#app').getAttribute('aria-busy')==='false');
 const tabs=await page.evaluate(()=>__LIFE_STUDIO_DASHBOARD_CONFIG__.tabs);
 await page.evaluate(()=>{const root=document.documentElement;root.style.setProperty('--safe-top','59px');root.style.setProperty('--safe-bottom','34px');const source=webkit.messageHandlers.nativeBridge.postMessage;window.__backgroundCalls=[];webkit.messageHandlers.nativeBridge.postMessage=m=>{__backgroundCalls.push(m);source(m);};});
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  for(const tab of tabs){
   if(tabs.length>1)await page.locator('#tab-'+tab).click();await page.evaluate(()=>scrollTo(0,0));await page.waitForFunction(()=>document.documentElement.dataset.pageScrolled==='false');
   await page.waitForTimeout(240);
   const atTop=await page.evaluate(()=>{const p=getComputedStyle(document.body,'::before');return {background:p.backgroundColor,opacity:p.opacity,filter:p.backdropFilter||p.webkitBackdropFilter,height:p.height,pointer:p.pointerEvents,viewport:innerWidth,overflow:document.documentElement.scrollWidth};});
   assert.equal(Number(atTop.opacity),0);assert.ok(parseFloat(atTop.height)>=59);assert.equal(atTop.pointer,'none');assert.ok(atTop.overflow<=atTop.viewport);
   // Compare the rendered top safe area to the same page with its inert guard hidden.
   // A solid canvas repaint over a gradient/artwork fails this pixel comparison.
   const actual=(await page.screenshot()).toString('base64');const hide=await page.addStyleTag({content:'body::before{opacity:0!important}'});const expected=(await page.screenshot()).toString('base64');await hide.evaluate(n=>n.remove());
   const difference=await page.evaluate(async({actual,expected})=>{
    const decode=async value=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(value),c=>c.charCodeAt(0))],{type:'image/png'}));const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=59;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);image.close();return ctx.getImageData(0,0,canvas.width,59).data;};const a=await decode(actual),b=await decode(expected);let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;
   },{actual,expected});assert.ok(difference<=1,'safe-area paint must equal the continuous underlying page at origin');
   if(tab==='automation'){
    const segment=page.locator('.smart-segment');assert.ok(!(await segment.evaluate(n=>getComputedStyle(n).boxShadow)).includes('8px'),'no spread halo');
    const rect=await segment.boundingBox();if(qa)await page.screenshot({path:join(qa,`${theme}-${tab}-top.png`)});
    // Add inert lower-page height only if fixture content cannot reach the sticky threshold.
    await page.evaluate(()=>{if(document.documentElement.scrollHeight-innerHeight<400){const spacer=document.createElement('div');spacer.id='continuity-qa-spacer';spacer.style.height='1000px';document.body.append(spacer);}});await page.evaluate(y=>scrollTo(0,y+50),rect.y);
    await page.waitForFunction(()=>document.documentElement.dataset.pageScrolled==='true');assert.ok(Math.abs((await segment.boundingBox()).y-59)<=2,'sticky segment geometry preserved');
   }else{
    await page.evaluate(()=>{if(document.documentElement.scrollHeight-innerHeight<400){const spacer=document.createElement('div');spacer.id='continuity-qa-spacer';spacer.style.height='1000px';document.body.append(spacer);}scrollTo(0,260);});await page.waitForFunction(()=>document.documentElement.dataset.pageScrolled==='true');
   }
   await page.waitForTimeout(240);
   const scrolled=await page.evaluate(()=>{const status=getComputedStyle(document.body,'::before'),header=getComputedStyle(document.querySelector('#topbar'));return {status:status.backgroundColor,header:header.backgroundColor,filter:status.backdropFilter||status.webkitBackdropFilter,headerFilter:header.backdropFilter||header.webkitBackdropFilter,opacity:Number(status.opacity),height:parseFloat(status.height),headerHeight:document.querySelector('#topbar').hidden?0:document.querySelector('#topbar').getBoundingClientRect().height};});assert.notEqual(scrolled.filter,'none');assert.equal(scrolled.opacity,1);assert.ok(Math.abs(scrolled.height-(59+scrolled.headerHeight+24))<2);if(tab==='home'){assert.match(scrolled.header,/rgba\(0, 0, 0, 0\)|transparent/);assert.equal(scrolled.headerFilter,'none','header must not create a second backdrop plane');}
   if(qa)await page.screenshot({path:join(qa,`${theme}-${tab}-scroll.png`)});
   for(const y of [0,4,8,12,24,48,120,48,24,12,8,4,0]){
    await page.evaluate(y=>scrollTo(0,y),y);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const progress=await page.evaluate(()=>({scroll:scrollY,opacity:Number(getComputedStyle(document.body,'::before').opacity),transition:getComputedStyle(document.body,'::before').transitionDuration}));
    assert.ok(Math.abs(progress.opacity-Math.min(1,Math.max(0,progress.scroll)/48))<.01,'fast up/down ramp must match current scroll');assert.equal(progress.transition,'0s','no delayed threshold fade');
   }
await page.evaluate(()=>{document.querySelector('#continuity-qa-spacer')?.remove();scrollTo(0,0);});await page.waitForFunction(()=>document.documentElement.dataset.pageScrolled==='false');
   results.push({theme,tab,safeTop:59,pixelDifference:difference});
  }
 }
 for(const width of [320,768]){await page.setViewportSize({width,height:844});if(tabs.length>1)await page.locator('#tab-home').click();await page.evaluate(()=>scrollTo(0,0));await page.waitForFunction(()=>document.documentElement.dataset.pageScrolled==='false');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-transparency:reduce)').matches),true);await page.waitForTimeout(500);await page.evaluate(()=>{const spacer=document.createElement('div');spacer.style.height='1000px';document.body.append(spacer);scrollTo(0,260);});await page.waitForFunction(()=>scrollY>8);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const finalState=await page.evaluate(()=>({state:document.documentElement.dataset.pageScrolled,y:scrollY,opacity:getComputedStyle(document.body,'::before').opacity}));assert.ok(finalState.y>8,'layout settles before testing reduced-transparency scroll');assert.equal(finalState.state,'true');assert.equal(await page.evaluate(()=>getComputedStyle(document.body,'::before').backdropFilter),'none');
 assert.deepEqual(errors,[]);if(qa)writeFileSync(join(qa,'results.json'),JSON.stringify({passed:true,results},null,2));console.log('BACKGROUND CONTINUITY PASS: origin pixel equality, 59px safe area, shared scrolled chrome, Smart halo/sticky, themes/tabs, narrow/desktop, reduced transparency');
}finally{await browser.close();await new Promise(r=>server.close(r));}
