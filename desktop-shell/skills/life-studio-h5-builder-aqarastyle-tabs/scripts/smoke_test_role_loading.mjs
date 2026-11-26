#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const base=JSON.parse(read('../assets/preview-template/scenarios/typical.json'));
async function fixture(role,mode){
 const data=structuredClone(base),calls=[];let mock,fail=mode==='replay'?1:0;
 // One bad preferred reading must not shadow a valid same-device ambient reading.
 for(const d of data.definitions)for(const e of d.endpoints)for(const f of e.functions){const p=f.traits.find(t=>t.traitCode==='CurrentTemperature');if(p){p.value=999;f.traits.push({...p,traitCode:'RoomTemperature',value:23});}}
 const host={__LIFE_STUDIO_DASHBOARD_CONFIG__:{scope:'studio',role,homeDeviceMode:role==='senior'||role==='female'?'favorites':'space',enableOverviewIndex:true,enableDeviceWrites:true},setTimeout,LifeBridge:{supports:()=>true,nativeHttpRequest:async req=>{
  calls.push(req);
  if(req.url.endsWith('/definitions')){
   if(fail-->0)throw new Error('Replay request is rejected');
   if(mode==='missing')return {code:0,data:[]};
  }
  if(mode==='unavailable'&&req.url.endsWith('/devices')&&req.params.pageSize===200)throw new Error('fixture unavailable');
  if(req.url.endsWith('/trait/execute'))throw new Error('Replay request is rejected');
  return mock.request(req);
 }}};
 const context=vm.createContext({window:host,URLSearchParams,console,setTimeout,clearTimeout});
 vm.runInContext(read('../assets/preview-template/mock-studio.js'),context);mock=host.PreviewStudio.create(data);
 vm.runInContext(read('../assets/dashboard-template/studio-runtime.js'),context);
 const snapshot=await host.StudioRuntime.load();const overview=await host.StudioRuntime.loadOverviewIndex();const index=host.StudioRuntime.favoriteDeviceIndex();
 if(mode==='missing'){assert.equal(overview.status,'partial');assert.equal(overview.indexedDeviceCount,0);assert.equal(index.settled,true);assert.equal(index.error,true);}
 else if(mode==='unavailable'){assert.equal(overview.status,'unavailable');assert.equal(index.settled,true);assert.equal(index.error,true);}
 else{assert.equal(overview.status,'complete');assert.equal(overview.temperature.value,23);assert.equal(overview.humidity.value,61);assert.ok(index.items.length);assert.equal(index.error,false);}
 if(mode==='replay'){assert.ok(calls.filter(r=>r.url.endsWith('/definitions')).length>=2);assert.ok(!snapshot.capabilityWarning);}
 assert.equal(calls.some(r=>r.url.includes('/metadata/')),false);
 return {host,calls};
}
for(const role of ['','male','female','senior','child'])for(const mode of ['normal','replay','missing','unavailable'])await fixture(role,mode);
console.log('PASS 20 role/loading fixtures: replay-read recovery, missing definitions remain partial, unavailable settles, valid ambient fallback, no metadata');

const writing=await fixture('male','normal');const device=writing.host.StudioRuntime.spaceControlIndex().devices.find(d=>d.control&&d.control.kind==='boolean');const before=writing.calls.length;await assert.rejects(writing.host.StudioRuntime.executeDevice(device.id,false,device.control.id),/Replay request/);assert.equal(writing.calls.length,before+1,'writes never retry');console.log('PASS replay rejection never retries a device write');
