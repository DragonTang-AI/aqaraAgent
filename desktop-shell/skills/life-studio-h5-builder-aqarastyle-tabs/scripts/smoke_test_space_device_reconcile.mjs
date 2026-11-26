#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import vm from 'node:vm';

const source=readFileSync(join(resolve(process.argv[2]),'dashboard.js'),'utf8');
const start=source.indexOf('  function renderDevices('),end=source.indexOf('  function renderAIAssistant(',start);
assert.ok(start>=0 && end>start);
class Node {
  constructor(className,id=''){this.className=className;this.id=id;this.parent=null;this.isConnected=false;}
  querySelector(selector){return selector==='.camera-stream' && this.camera ? {}:null;}
  remove(){if(!this.parent)return;const children=this.parent.children;children.splice(children.indexOf(this),1);this.parent=null;this.isConnected=false;}
}
class Grid {
  constructor(){this.children=[];}
  append(node){this.insertBefore(node,null);}
  insertBefore(node,before){node.remove();const position=before?this.children.indexOf(before):this.children.length;this.children.splice(position,0,node);node.parent=this;node.isConnected=true;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector){const classes=selector.split(',').map(item=>item.trim().slice(1));return this.children.filter(node=>classes.includes(node.className));}
}
const grid=new Grid(),mountedDeviceCards=new Map(),mountedDeviceSignatures=new Map();
const elements={deviceGrid:grid,loadMore:{hidden:false,disabled:false,textContent:''}};
let visible=[],closed=0,stopped=0;
const context={
  elements,mountedDeviceCards,mountedDeviceSignatures,Math,JSON,Set,String,Map,
  favoriteDeviceMode:false,moduleEnabled:()=>true,captureLayoutAnchor:()=>null,
  deviceGridContentHeight:()=>0,transitionGridHeight:0,layoutRevision:0,childRoomPlan:()=>null,
  filteredDevices:()=>visible,initializeConfirmedValues:()=>{},capabilitySheet:null,
  closeCapabilitySheet:()=>{closed++;},global:{CameraWebRTCRuntime:{stop:()=>{stopped++;}},StudioRuntime:{getHomeSpace:()=>'',spaceControlIndex:()=>({complete:false})}},
  currentSnapshot:{devices:[],deviceTotalCount:3,spaces:[]},activeSpace:'*',config:{},
  hasMoreDevices:()=>true,busy:false,loadMoreBusy:false,isCachedSnapshot:()=>false,
  clearChildren:target=>{for(const node of [...target.children])node.remove();},
  emptyCard:()=>new Node('empty-card'),t:value=>value,
  makeDeviceCard:device=>{const card=new Node('device-card',device.id);card.camera=Boolean(device.camera);return card;},
  lockDeviceGridHeight:()=>'',restoreLayoutAnchor:()=>{},releaseDeviceGridHeight:()=>{},
};
const render=vm.runInNewContext(`${source.slice(start,end)}\nrenderDevices`,context);
const ids=()=>grid.children.map(node=>node.id||node.className);
for(let i=0;i<4;i++)grid.append(new Node('loading-card'));
visible=[{id:'a'},{id:'b'}];render();
assert.deepEqual(ids(),['a','b'],'first real page removes every loading skeleton');
const first=mountedDeviceCards.get('a');render();
assert.equal(mountedDeviceCards.get('a'),first,'unchanged device card keeps its DOM identity');
visible=[{id:'a'},{id:'b'},{id:'c'}];render(null,true);
assert.deepEqual(ids(),['a','b','c'],'pagination appends only real devices');
visible=[{id:'b'}];render();
assert.deepEqual(ids(),['b'],'space filtering removes cards outside the room');
visible=[];render(null,true);
assert.deepEqual(ids(),['empty-card']);
assert.equal(mountedDeviceCards.size,0,'an empty result clears stale mounted-card indexes');
visible=[{id:'a'}];render();
assert.deepEqual(ids(),['a'],'returning to a room removes the empty-state card');
assert.equal(stopped,0,'non-camera reconciliation does not stop streams');
visible=[{id:'cam',camera:true}];render();const camera=mountedDeviceCards.get('cam');
render();assert.equal(mountedDeviceCards.get('cam'),camera);
assert.equal(stopped,0,'unchanged camera card keeps its stream');
visible=[{id:'cam',camera:true,name:'renamed'}];render();
assert.equal(stopped,1,'replacing a changed camera stops only its old stream');
visible=[];render();assert.equal(stopped,2,'removing a camera stops its stream');
assert.ok(closed>0);
console.log('SPACE DEVICE RECONCILE PASS');
