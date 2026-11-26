#!/usr/bin/env node
import assert from 'node:assert/strict';import vm from 'node:vm';import{readFileSync}from'node:fs';
const host={};vm.runInNewContext(readFileSync(new URL('../assets/dashboard-template/favorite-devices.js',import.meta.url),'utf8'),{window:host,document:{}});const api=host.FavoriteDevices;
const room=(id,name,parentId='')=>({id,name,parentId}),base=[room('home','家'),room('living','客厅','home'),room('bath','卫生间','home')];
let plan=api.roleRooms([...base,room('bed','卧室','home')],'senior','');assert.equal(plan.rest,'bed');assert.equal(plan.rank.get('living'),1);assert.equal(plan.rank.get('bath'),2);
plan=api.roleRooms([...base,room('b1','主卧'),room('b2','次卧')],'child','');assert.equal(plan.needsChoice,true);assert.equal(plan.rest,'');assert.equal(plan.rank.has('bath'),false);
assert.equal(api.roleRooms([...base,room('b1','主卧'),room('b2','次卧')],'child','b2').rest,'b2');
assert.equal(api.roleRooms([...base,room('kid','儿童房'),room('b','卧室')],'child','').rest,'kid');
assert.equal(api.roleRooms(base,'senior','missing').rest,'');
const item=(id,type,spaceId,trait)=>({deviceId:id,endpointId:1,deviceType:type,spaceId,capabilityTraits:[{traitCode:trait}],controls:[],readings:[]});
plan=api.roleRooms([...base,room('bed','卧室')],'senior','');const items=[item('wrong','Light','bed','Unknown'),item('outside','Light','garage','OnOff'),...Array.from({length:8},(_,i)=>item('light'+i,'Light',i<2?'bed':'living','OnOff'))];
const rec=api.recommendedDevices(items,plan);assert.equal(rec.length,3);assert.equal(rec[0].deviceId,'light0');assert.ok(rec.every(x=>!['wrong','outside'].includes(x.deviceId)));assert.equal(api.recommendedDevices([],plan).length,0);
assert.equal(api.roleRooms([room('bath','老人卫生间'),room('kid','儿童卧室')],'senior','').rest,'');
const start=performance.now();for(let i=0;i<50;i++)api.recommendedDevices(Array.from({length:5000},(_,i)=>item('d'+i,'Light','living','OnOff')),plan);assert.ok(performance.now()-start<3000,'bounded 5000-device local ranking');
console.log('ROLE RECOMMENDATIONS PASS: dedicated/single/ambiguous/missing rooms, explicit mapping, candidate capabilities, stable three limit, 5000-device local workload');

assert.equal(api.recommendedDevices(items,api.roleRooms([...base,room('bed','卧室')],'female','')).length,3);

const sceneHost={};vm.runInNewContext(readFileSync(new URL('../assets/dashboard-template/favorite-scenes.js',import.meta.url),'utf8'),{window:sceneHost,document:{}});
const auto=sceneHost.FavoriteScenes.automaticScenes;
for(const role of ['senior','child']){
 for(const count of [0,1,5,6,7,1000]){const catalog=Array.from({length:count},(_,i)=>({sceneId:'s'+i,name:role==='senior'?'阅读'+i:'学习'+i,enabled:true}));assert.equal(auto(catalog,role).length,Math.min(count,6));assert.equal(auto(catalog.concat(catalog),role).length,Math.min(count,6));}
 const catalog=[{sceneId:'unsafe',name:'晚安自动开锁',enabled:true},{sceneId:'disabled',name:'阅读',enabled:false},{sceneId:'neutral',name:'普通场景',enabled:true},{sceneId:'good',name:role==='senior'?'起夜照明':'亲子玩耍',enabled:true}];assert.deepEqual(Array.from(auto(catalog,role),s=>s.sceneId),['good']);
 assert.equal(auto([{automationId:'a',triggerNodeId:'t',name:'阅读',enabled:true}],role).length,1);
}
console.log('AUTOMATIC ROLE SCENES PASS: 0/1/5/6/7/1000, stable max-six, duplicate/disabled/irrelevant exclusions and legacy execution identity');
