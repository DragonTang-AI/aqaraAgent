#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import vm from 'node:vm';
const root=resolve(process.argv[2]);let held;const calls=[];
const window={location:{search:''},navigator:{userAgent:'iOS'},__AQARA_NATIVE_CONTEXT__:{platform:'ios',capabilities:['getCurrentPageVisibility']},webkit:{messageHandlers:{nativeBridge:{postMessage(req){calls.push(req);held=req;}}}}};
vm.runInContext(readFileSync(join(root,'life-bridge.js'),'utf8'),vm.createContext({window,URLSearchParams,setTimeout,clearTimeout,console}));
const tick=()=>new Promise(r=>setTimeout(r,0)),values=[];
const dispose=window.LifeBridge.subscribePageVisibility(v=>values.push(JSON.parse(JSON.stringify(v))));assert.equal(calls.length,1);
const emit=v=>window.H5Invoke('PageVisibilityChanged',v);
emit({documentId:'page-A',sequence:2,visible:false});
window.H5Invoke(held.data.onSuccess,{code:0,data:{documentId:'page-A',sequence:1,visible:true}});await tick();assert.deepEqual(values,[{documentId:'page-A',sequence:2,visible:false}]);
for(const bad of [{documentId:'page-A',sequence:2,visible:true},{documentId:'page-A',sequence:1,visible:true},{documentId:'child-B',sequence:3,visible:true},{documentId:'page-A',sequence:3,visible:'true'},{documentId:'page-A',sequence:-1,visible:true}])emit(bad);
assert.equal(values.length,1);emit({documentId:'page-A',sequence:3,visible:true});assert.equal(values.length,2);
dispose();emit({documentId:'page-A',sequence:4,visible:false});assert.equal(values.length,2);
window.__AQARA_NATIVE_CONTEXT__.capabilities=[];window.LifeBridge.subscribePageVisibility(()=>assert.fail('legacy host must not subscribe'))();assert.equal(calls.length,1);
assert.ok(calls.every(req=>req.action==='getCurrentPageVisibility'));
console.log('PAGE VISIBILITY BRIDGE PASS: strict opt-in / stale ACK / sequence dedup / parent-child isolation / malformed payloads / disposal / zero HTTP');
