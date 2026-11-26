#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import vm from 'node:vm';

const root = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('usage: node smoke_test_phone_network.mjs <runtime>');
const methods = ['getCurrentPhoneNetworkStatus','subscribePhoneNetworkStatus','unsubscribePhoneNetworkStatus'];
const document = new EventTarget(); document.hidden = false;
const calls = []; let held = null; let current = 'unknown';
const window = { document, location:{search:''}, navigator:{userAgent:'iOS'},
  __AQARA_NATIVE_CONTEXT__:{platform:'ios',capabilities:methods},
  addEventListener(){}, removeEventListener(){},
  webkit:{messageHandlers:{nativeBridge:{postMessage(request){
    calls.push(request.action);
    if (request.action === 'subscribePhoneNetworkStatus') { held=request; return; }
    queueMicrotask(() => window.H5Invoke(request.data.onSuccess,{code:0,data:request.action === 'unsubscribePhoneNetworkStatus' ? {accepted:true} : {status:current}}));
  }}}}
};
vm.runInContext(readFileSync(join(root,'life-bridge.js'),'utf8'),vm.createContext({window,URLSearchParams,setTimeout,clearTimeout,queueMicrotask,console}));
const tick = () => new Promise(resolve => setTimeout(resolve,0));
assert.equal((await window.LifeBridge.getCurrentPhoneNetworkStatus()).status,'unknown');
const values=[]; const dispose=window.LifeBridge.subscribePhoneNetworkStatus(value=>values.push(value.status));
assert.ok(held);
window.H5Invoke('PhoneNetworkStatusUpdate',{status:'offline'});
window.H5Invoke(held.data.onSuccess,{code:0,data:{status:'online'}}); await tick();
assert.deepEqual(values,['offline'],'late subscription ACK must not overwrite an offline push');
window.H5Invoke('PhoneNetworkStatusUpdate',{status:'online'});
assert.equal(values.at(-1),'online');
window.H5Invoke('PhoneNetworkStatusUpdate',{status:'bogus'});
assert.equal(values.at(-1),'unknown','invalid payload must not claim connectivity');
current='offline'; document.dispatchEvent(new Event('visibilitychange')); await tick();
assert.equal(values.at(-1),'offline','foreground resync reads current native reachability');
const count=values.length; dispose(); dispose(); window.H5Invoke('PhoneNetworkStatusUpdate',{status:'online'}); await tick();
assert.equal(values.length,count); assert.equal(calls.filter(value=>value==='unsubscribePhoneNetworkStatus').length,1);
window.__AQARA_NATIVE_CONTEXT__.capabilities=[];
const before=calls.length; assert.equal((await window.LifeBridge.getCurrentPhoneNetworkStatus()).status,'unknown');
assert.equal(calls.length,before,'undeclared bridge capability must never be invoked');
assert.ok(calls.every(value=>methods.includes(value)),'network status never calls Studio HTTP or camera bridge');
const elements = new Map(['phone-offline-banner','phone-offline-text','phone-offline-retry'].map(id=>[id,{hidden:true,dataset:{},textContent:'',setAttribute(){},addEventListener(){}}]));
const rootElement={dataset:{}};let deliverNetwork;
const uiWindow={
  LifeI18n:{getLocale:()=> 'zh-CN',onChange(){}},
  LifeBridge:{subscribePhoneNetworkStatus(listener){deliverNetwork=listener;return()=>{};},capabilities:()=>methods},
  addEventListener(){},
};
const uiDocument={documentElement:rootElement,getElementById:id=>elements.get(id)};
vm.runInContext(readFileSync(join(root,'phone-network.js'),'utf8'),vm.createContext({window:uiWindow,document:uiDocument,Set}));
const alert=elements.get('phone-offline-banner'),label=elements.get('phone-offline-text');
assert.equal(alert.hidden,true);
uiWindow.LifePhoneNetwork.setStudioUnavailable(true);
assert.equal(rootElement.dataset.statusBanner,'studio');
assert.equal(label.textContent,'无法访问 Studio');
assert.equal(alert.hidden,false);
deliverNetwork({status:'offline'});
assert.equal(rootElement.dataset.statusBanner,'phone','phone offline takes priority over Studio unavailable');
assert.equal(label.textContent,'网络异常，请重试');
deliverNetwork({status:'online'});
assert.equal(rootElement.dataset.statusBanner,'studio','Studio banner returns when phone recovers');
uiWindow.LifePhoneNetwork.setStudioUnavailable(false);
assert.equal(rootElement.dataset.statusBanner,'');
assert.equal(alert.hidden,true);
console.log('PHONE NETWORK BRIDGE PASS: strict capability, unknown/offline/online, stale ACK, foreground resync, disposal and no HTTP');
