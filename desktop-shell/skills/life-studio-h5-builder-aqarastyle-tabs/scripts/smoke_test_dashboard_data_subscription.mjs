#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(process.argv[2]);
const calls = [];
let accept = true;
const events = new EventTarget();
const window = {
  navigator: { userAgent: 'iOS' },
  location: { search: '' },
  document: { hidden: false, addEventListener() {}, removeEventListener() {} },
  __AQARA_NATIVE_CONTEXT__: { platform: 'ios', capabilities: [] },
  addEventListener: events.addEventListener.bind(events),
  removeEventListener: events.removeEventListener.bind(events),
  webkit: { messageHandlers: { nativeBridge: { postMessage(request) {
    calls.push({ action: request.action, data: request.data });
    queueMicrotask(() => window.H5Invoke(request.data.onSuccess, { code: 0, data: { accepted: accept } }));
  } } } },
};
vm.runInContext(readFileSync(join(root, 'life-bridge.js'), 'utf8'), vm.createContext({ window, URLSearchParams, setTimeout, clearTimeout, queueMicrotask, console }));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const received = [];
const firstWatch = { deviceId: 'device-1', endpointId: 1, functionCode: 'Output', traitCode: 'OnOff' };
const secondWatch = { deviceId: 'device-2', endpointId: 1, functionCode: 'Output', traitCode: 'OnOff' };
const dispose = window.LifeBridge.subscribeDataChanges(value => received.push(JSON.parse(JSON.stringify(value))), { studioDid: 'studio-A', watchedTraits: [firstWatch] });
assert.deepEqual(calls, [], 'missing capability must not call native');
window.__AQARA_NATIVE_CONTEXT__.capabilities = ['subscribeDataChanges', 'unsubscribeDataChanges'];
events.dispatchEvent(new Event('aqara:native-context-ready'));
await tick();
assert.deepEqual(calls.map(call => call.action), ['subscribeDataChanges']);
assert.equal(calls[0].data.studioDid, 'studio-A');
assert.deepEqual(JSON.parse(JSON.stringify(calls[0].data.watchedTraits)), [firstWatch]);
dispose.updateWatchedTraits([secondWatch]);
await tick();
assert.deepEqual(calls.map(call => call.action), ['subscribeDataChanges', 'subscribeDataChanges'], 'watch changes replace the same native subscription');
assert.deepEqual(JSON.parse(JSON.stringify(calls[1].data.watchedTraits)), [secondWatch]);
dispose.updateWatchedTraits([secondWatch]);
await tick();
assert.equal(calls.length, 2, 'unchanged watches must not register twice');
const trait = { deviceId: 'device-1', endpointId: 1, functionCode: 'Output', traitCode: 'OnOff', value: 'false', time: 200 };
window.H5Invoke('DataChanged', { code: 0, data: { studioDid: 'studio-A', kind: 'device', items: [trait] } });
assert.deepEqual(received, [{ studioDid: 'studio-A', kind: 'device', items: [trait] }]);
dispose();
window.H5Invoke('DataChanged', { code: 0, data: { studioDid: 'studio-A', kind: 'collections' } });
await tick();
assert.equal(received.length, 1, 'disposed listener must ignore later pushes');
assert.deepEqual(calls.map(call => call.action), ['subscribeDataChanges', 'subscribeDataChanges', 'unsubscribeDataChanges']);
accept = false;
const disposeRejected = window.LifeBridge.subscribeDataChanges(() => {}, { studioDid: 'studio-A', watchedTraits: [firstWatch] });
await tick();
accept = true;
events.dispatchEvent(new Event('aqara:native-context-ready'));
await tick();
assert.equal(calls.filter(call => call.action === 'subscribeDataChanges').length, 4, 'rejected native subscription may retry after context changes');
disposeRejected();
await tick();
const beforeLegacy = calls.length;
const disposeLegacy = window.LifeBridge.subscribeDataChanges(() => {});
events.dispatchEvent(new Event('aqara:native-context-ready'));
await tick();
assert.equal(calls.length, beforeLegacy, 'a no-filter legacy call must not activate an all-device feed');
disposeLegacy();
