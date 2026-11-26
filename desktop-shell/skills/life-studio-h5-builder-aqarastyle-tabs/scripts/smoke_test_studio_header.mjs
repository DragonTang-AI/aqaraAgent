#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import vm from 'node:vm';
const root=resolve(process.argv[2]),methods=['getCurrentStudioConnectStatus','subscribeStudioConnectStatus','unsubscribeStudioConnectStatus'];
let status={studioDid:'mock-A',studioName:'真实名称 <img onerror=bad()>',connectStatus:'local'},held=null,hold=false;
const calls=[],document=new EventTarget();document.hidden=false;
const window={document,location:{search:''},navigator:{userAgent:'iOS'},__AQARA_NATIVE_CONTEXT__:{platform:'ios',capabilities:methods},webkit:{messageHandlers:{nativeBridge:{postMessage(req){calls.push(req.action);if(req.action==='subscribeStudioConnectStatus'&&hold){held=req;return;}queueMicrotask(()=>window.H5Invoke(req.data.onSuccess,{code:0,data:req.action==='unsubscribeStudioConnectStatus'?{accepted:true}:status}));}}}}};
vm.runInContext(readFileSync(join(root,'life-bridge.js'),'utf8'),vm.createContext({window,URLSearchParams,setTimeout,clearTimeout,queueMicrotask,console}));
const plain=v=>JSON.parse(JSON.stringify(v)),tick=()=>new Promise(r=>setTimeout(r,0));
assert.deepEqual(plain(await window.LifeBridge.getCurrentStudioConnectStatus()),status);
hold=true;const values=[];const dispose=window.LifeBridge.subscribeStudioConnectStatus(v=>values.push(plain(v)));assert.ok(held);
window.H5Invoke('StudioConnectStatusUpdate',JSON.stringify({...status,connectStatus:'cloud'}));
window.H5Invoke(held.data.onSuccess,{code:0,data:status});await tick();assert.equal(values.at(-1).connectStatus,'cloud','late initial ACK must not overwrite a newer push');
for(const errorCode of [60101,60102]){window.H5Invoke('StudioConnectStatusUpdate',{...status,connectStatus:'error',errorCode});assert.equal(values.at(-1).errorCode,errorCode);}
window.H5Invoke('StudioConnectStatusUpdate',{...status,connectStatus:'local',errorCode:60101});assert.equal(values.at(-1).errorCode,undefined,'recovery clears stale code');
window.H5Invoke('StudioConnectStatusUpdate',{studioDid:'',studioName:'wrong',connectStatus:'cloud'});assert.deepEqual(values.at(-1),{studioDid:'',studioName:'',connectStatus:'unknown'});
window.H5Invoke('StudioConnectStatusUpdate',{studioDid:'',studioName:'',connectStatus:'unknown'});assert.equal(values.at(-1).studioName,'');
hold=false;status={studioDid:'mock-A',studioName:'重命名 Studio',connectStatus:'cloud'};document.dispatchEvent(new Event('visibilitychange'));await tick();assert.equal(values.at(-1).studioName,'重命名 Studio');
const size=values.length;dispose();dispose();window.H5Invoke('StudioConnectStatusUpdate',status);document.dispatchEvent(new Event('visibilitychange'));await tick();assert.equal(values.length,size);assert.equal(calls.filter(c=>c==='unsubscribeStudioConnectStatus').length,1);
window.__AQARA_NATIVE_CONTEXT__.capabilities=[];const count=calls.length;await assert.rejects(window.LifeBridge.getCurrentStudioConnectStatus(),/unavailable/);const missing=[];const d2=window.LifeBridge.subscribeStudioConnectStatus(v=>missing.push(plain(v)));await tick();assert.equal(missing[0].connectStatus,'unknown');d2();assert.equal(calls.length,count,'undeclared legacy capability cannot be attempted');
assert.ok(calls.every(c=>methods.includes(c)),'header bridge must make zero HTTP requests');
console.log('STUDIO HEADER BRIDGE PASS: real fields, strict capabilities, local/cloud/errors/unknown, stale ACK protection, visibility resync, rename, dispose and zero HTTP');
