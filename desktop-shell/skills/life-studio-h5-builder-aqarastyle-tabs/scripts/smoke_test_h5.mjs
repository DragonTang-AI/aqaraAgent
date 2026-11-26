#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !existsSync(packageDir)) { console.error('usage: node smoke_test_h5.mjs <package-directory>'); process.exit(1); }

const requests = []; const storage = new Map(); const lightState = { OnOff: true, CurrentLevel: 45, ColorTemperature: 370 }; const climateState = { OnOff: true, HeaterCoolerMode: '0', CoolingTemperature: 23, HeatingTemperature: 26, FanMode: '2' }; let curtainState = 62; let failNextTraitWrite = false;
let holdIndependentReads = true; const heldReads = []; let definitionsInFlight = 0; let peakDefinitionsInFlight = 0;
const deviceTypes = ['Light', 'Plug', 'Thermostat', 'Curtain', 'DoorLock', 'Camera', 'MotionSensor', 'SmokeAlarm', 'RobotVacuum', 'Speaker', 'Gateway', 'GenericDevice'];
const devices = Array.from({ length: 100 }, (_, index) => ({
  deviceId: `device-runtime-${index + 1}`, deviceName: index === 3 ? '客厅窗帘开关' : `设备 ${index + 1}`, deviceTypesList: [index === 3 ? 'Switch' : deviceTypes[index % deviceTypes.length]], state: index % 17 !== 0, space: { spaceId: `space-${index % 5}`, name: `空间 ${index % 5}` },
}));

await verifyNativeEntryBridgeContracts();
await verifyAiAgentStatusBridge();
if (process.argv.includes('--native-entry-only')) { console.log('NATIVE ENTRY BRIDGE PASS: iOS/Android transports, optional AI content, old-host gating, acknowledgements, failures, timeout and callback cleanup'); process.exit(0); }
await verifyAndroidPromptTransport();
await verifyCameraSessionProviderContract();
await verifyCameraWebRTCReadinessContract();
await verifyCameraWebRTCRuntimeContract();

const windowObject = {
  location: { search: '?did=device-runtime-1&themeMode=dark&language=zh-TW' }, setTimeout, clearTimeout, URLSearchParams,
  navigator: { language: 'en-US' },
  sessionStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
};
windowObject.window = windowObject; windowObject.__AQARA_NATIVE_CONTEXT__ = { capabilities: ['nativeHttpRequest', 'getStudioAuthInfo', 'subscribeThemeMode'] };
windowObject.webkit = { messageHandlers: { nativeBridge: { postMessage(invocation) {
  const invocationData = invocation.data || {};
  if (invocation.action === 'subscribeThemeMode') { queueMicrotask(() => windowObject.H5Invoke(invocationData.onSuccess, JSON.stringify({ code: 0, data: { themeMode: 'light' } }))); return; }
  if (invocation.action !== 'nativeHttpRequest') throw new Error(`unexpected action ${invocation.action}`);
  const request = { url: invocationData.url, method: invocationData.method, params: structuredClone(invocationData.params || {}), data: structuredClone(invocationData.data), headers: structuredClone(invocationData.headers || {}) };
  requests.push(request); const responseData = fixtureResponse(request);
  const isDefinition = request.url.endsWith('/devices/definitions');
  if (isDefinition) { definitionsInFlight += 1; peakDefinitionsInFlight = Math.max(peakDefinitionsInFlight, definitionsInFlight); }
  const complete = () => { if (isDefinition) definitionsInFlight -= 1; windowObject.H5Invoke(invocationData.onSuccess, JSON.stringify({ code: 0, message: 'success', data: responseData })); };
  if (holdIndependentReads && (request.url.endsWith('/spaces') || request.url.endsWith('/scenes'))) heldReads.push(complete);
  else queueMicrotask(complete);
} } } };

const documentObject = { documentElement: { lang: '' } };
const context = vm.createContext({ window: windowObject, document: documentObject, console, setTimeout, clearTimeout, queueMicrotask, URLSearchParams, structuredClone });
for (const file of ['config.js', 'life-bridge.js', 'i18n.js']) vm.runInContext(readFileSync(join(packageDir, file), 'utf8'), context, { filename: file });
// This is the shared runtime contract fixture, not a rewrite of the delivered config.
// Product-specific configuration is validated separately; favorites also run their own gate.
const productHomeMode = windowObject.__LIFE_STUDIO_DASHBOARD_CONFIG__.homeDeviceMode;
if (productHomeMode === 'favorites') {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./smoke_test_favorite_devices.mjs', import.meta.url)), packageDir], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  console.log(result.stdout.trim());
}
windowObject.__LIFE_STUDIO_DASHBOARD_CONFIG__ = Object.freeze({ ...windowObject.__LIFE_STUDIO_DASHBOARD_CONFIG__,
  role: '', scope: 'studio', homeDeviceMode: 'space', homeModules: ['overview','aiAssistant','favoriteScenes','devices','spaceControl'],
  homeSpaceRequired: false, homeSpaceId: '', homeSpaceSelection: 'manual', overviewEnvironmentSpaceId: '',
  enableOverviewIndex: true, overviewMetrics: ['online','spaces','scenes','temperature','humidity','presence'],
  devicePageSize: 12, backendPageSize: 12, definitionBatchSize: 40, definitionConcurrency: 2,
  overviewCatalogPageSize: 200, overviewDefinitionBatchSize: 40, overviewMaxDevices: 200,
  enableDeviceWrites: true, apiPath: '/open/api/v1', requestMode: 'sdkMode', allowDirectFetch: false,
  studioHost: '', studioBaseUrl: '', safeCommandCodes: ['Pause'], controlReadbackDelayMs: 500 });
vm.runInContext(readFileSync(join(packageDir, 'studio-runtime.js'), 'utf8'), context, { filename: 'studio-runtime.js' });

assert.deepEqual(JSON.parse(JSON.stringify(windowObject.LifeBridge.launchContext())), { deviceId: 'device-runtime-1', themeMode: 'dark', language: 'zh-TW' });
assert.equal(windowObject.LifeI18n.getLocale(), 'zh-TW'); assert.equal(windowObject.LifeI18n.t('deviceTitle'), '裝置');
windowObject.LifeI18n.setLocale('en-US'); assert.equal(windowObject.LifeI18n.t('deviceTitle'), 'Devices'); windowObject.LifeI18n.setLocale('zh-CN'); assert.equal(windowObject.LifeI18n.t('deviceTitle'), '设备');

const progressEvents = [];
windowObject.StudioRuntime.setCollectionScope('studio-runtime-test', 'user-runtime-test');
const firstLoad = windowObject.StudioRuntime.load({ onProgress: (event) => progressEvents.push(event.type) });
// Drain the first device page/definition while unrelated collections stay pending.
await new Promise((resolve) => setTimeout(resolve, 0));
const definitionStartedBeforeCollections = count('GET', '/open/api/v1/devices/definitions') > 0;
assert.equal(count('GET', '/open/api/v1/devices'), 1, 'cold start must request only the first backend device page');
assert.equal(count('GET', '/open/api/v1/devices/definitions'), 1, 'cold start must request definitions only for the first backend page');
assert.equal(progressEvents.includes('devices'), true, 'first-page devices must be published before independent collections settle');
holdIndependentReads = false; heldReads.splice(0).forEach((complete) => complete());
let snapshot = await firstLoad;
assert.equal(definitionStartedBeforeCollections, true, 'definitions must start while independent spaces/scenes are still pending');
assert.ok(peakDefinitionsInFlight <= 1, 'one on-demand page must not fan out definition requests beyond its required batch');
assert.equal(snapshot.devices.length, 12, 'initial load must expose only the first on-demand page');
assert.equal(snapshot.deviceTotalCount, 100); assert.equal(snapshot.hasMoreDevices, true);
const beforeOverview = requests.length; const overviewEvents = [];
const overviewPromise = windowObject.StudioRuntime.loadOverviewIndex({ onProgress: (event) => overviewEvents.push(event.value) });
const appendPromise = windowObject.StudioRuntime.loadNextPage();
const [overview, firstAppend] = await Promise.all([overviewPromise, appendPromise]); snapshot = firstAppend.snapshot;
assert.equal(overview.status, 'complete'); assert.equal(overview.indexedDeviceCount, 100); assert.equal(overview.deviceTotalCount, 100);
assert.equal(overview.temperature.value, 24); assert.ok(Number.isFinite(overview.humidity.value)); assert.ok(overview.presence.monitoredSpaceCount > 0);
assert.equal(overviewEvents[0].status, 'loading'); assert.equal(overviewEvents.at(-1).status, 'complete');
assert.equal(pathsSince(beforeOverview).filter((item) => item === 'GET /open/api/v1/devices').length, 1, 'overview must fetch one lightweight catalog page for a 100-device Studio');
assert.equal(pathsSince(beforeOverview).filter((item) => item === 'GET /open/api/v1/devices/definitions').length, 3, 'the 88 uncached devices must use three sequential batches of at most 40');
assert.ok(peakDefinitionsInFlight <= 1, 'background overview capability batches must stay at concurrency one');
assert.equal(snapshot.devices.length, 24, 'one explicit next-page action must append exactly one backend page');
assert.equal(firstAppend.reusedOverviewIndex, true); assert.equal(pathsSince(beforeOverview).length, 4, 'a page click during indexing must join the catalog/capability work without duplicate requests');
while (snapshot.hasMoreDevices) snapshot = (await windowObject.StudioRuntime.loadNextPage()).snapshot;
assert.equal(snapshot.devices.length, 100, 'explicit next-page actions must eventually expose the complete fixture set');
assert.equal(count('GET', '/open/api/v1/devices'), 2, '100 devices require only the initial visible page plus one background catalog request');
assert.equal(count('GET', '/open/api/v1/devices/definitions'), 4, 'definitions require one initial batch plus three sequential background batches');
assert.equal(requests.filter((item) => item.url === '/open/api/v1/devices/definitions').every((item) => typeof item.params.deviceIds === 'string' && !item.params.deviceIds.includes('[')), true, 'definition IDs must use the documented comma-separated query form');
assert.equal(count('GET', '/open/api/v1/spaces'), 1);
assert.equal(count('GET', '/open/api/v1/scenes'), 1);
assert.equal(requests.some((item) => item.url.includes('/definitions/full') || item.url === '/open/api/v1'), false, 'internal and legacy root operations are forbidden');
assert.equal(snapshot.devices[0].control.kind, 'boolean');
assert.deepEqual(JSON.parse(JSON.stringify(snapshot.devices[0].controls.map((item) => item.traitCode))), ['OnOff', 'CurrentLevel', 'ColorTemperature'], 'a light must retain every safe model-derived operational control');
assert.equal(snapshot.devices[0].controls.some((item) => item.traitCode === 'OnTransitionTime'), false, 'configuration-only ranges must not become dashboard controls');
assert.equal(snapshot.devices[0].presentationReadings.some((item) => item.traitCode === 'FirmwareVersion'), false, 'static metadata must not displace operational telemetry');
assert.equal(snapshot.devices[0].presentationReadings.some((item) => ['DeviceID', 'ConnectionStatus'].includes(item.traitCode)), false, 'identity and duplicate connection metadata must not enter presentation readings');
assert.equal(snapshot.devices[0].telemetry[0].label, '实时功率');
assert.equal(snapshot.devices[1].category, 'climate');
assert.equal(snapshot.devices[1].control.traitCode, 'OnOff', 'air-condition power remains the primary header control');
assert.equal(snapshot.devices[1].controls.find((item) => item.traitCode === 'CoolingTemperature').kind, 'range');
assert.equal(snapshot.devices[1].controls.find((item) => item.traitCode === 'HeatingTemperature').kind, 'range');
assert.equal(snapshot.devices[1].controls.find((item) => item.traitCode === 'HeaterCoolerMode').kind, 'enum');
assert.equal(snapshot.devices[1].controls.find((item) => item.traitCode === 'FanMode').kind, 'enum');
assert.equal(snapshot.devices[1].readings.find((item) => item.traitCode === 'CurrentTemperature').displayValue, '22.5°C');
assert.equal(snapshot.devices[2].control.kind, 'enum');
assert.equal(snapshot.devices[3].category, 'curtain', 'curtain semantics must outrank the word switch');
assert.equal(snapshot.devices[3].control.kind, 'range', 'curtains with a writable position must render a slider');
assert.equal(snapshot.devices[3].control.traitCode, 'TargetPositionPercentage', 'curtain position must outrank an available Boolean switch');
assert.equal(snapshot.devices[3].control.value, 62, 'a missing target value may initialize from the matching current-position trait');
assert.equal(snapshot.devices[4].control, null, 'unknown zero-field commands must remain read-only');
assert.equal(snapshot.devices[5].control.kind, 'command');
assert.equal(snapshot.devices[5].cameraStream.protocol, 'aqara-spec-webrtc-v1', 'camera live view requires exact returned Offer and SignalingEvent points');
assert.equal(snapshot.devices[5].cameraStream.localIce.commandCode, 'WebRTCProvideICECandidates', 'camera Trickle ICE requires the exact returned 40338 command');
assert.equal(snapshot.devices[4].cameraStream, null, 'camera capability must not be guessed from device category or name');
assert.deepEqual(JSON.parse(JSON.stringify(snapshot.devices[10].presentationReadings.map((item) => item.traitCode))), ['Battery'], 'gateway identity/network metadata must not inflate visible capabilities');
assert.equal(snapshot.devices[13].category, 'climate');
assert.equal(snapshot.devices[13].control.traitCode, 'FanSwitch', 'a returned FanSwitch remains a real control but is not invented as whole-device OnOff');
assert.equal(snapshot.devices[13].readings.find((item) => item.traitCode === 'RoomTemperature').displayValue, '25.5°C');
assert.equal(new Set(snapshot.devices.map((item) => item.category)).size, 12, 'device category mapping must stay diverse');
assert.equal(snapshot.spaces.length, 5); assert.equal(snapshot.scenes[0].name, '回家');

let start = requests.length;
const boolWrite = await windowObject.StudioRuntime.executeDevice('device-runtime-1', false);
const readback = await windowObject.StudioRuntime.readBackDevice('device-runtime-1', boolWrite.expected);
assert.equal(readback.confirmed, true); assert.equal(readback.actual, false);
assert.deepEqual(pathsSince(start), ['POST /open/api/v1/devices/trait/execute', 'POST /open/api/v1/devices/trait/read'], 'one trait action may only write once and read the exact trait once');
const traitBody = requests[start].data.data[0]; assert.equal(traitBody.value, false); assert.equal(typeof traitBody.value, 'boolean');
assert.deepEqual(requests[start + 1].data.data[0], { deviceId: 'device-runtime-1', endpointId: 2, functionCode: 'Output', traitCodes: ['OnOff'] });

start = requests.length;
const levelControl = snapshot.devices[0].controls.find((item) => item.traitCode === 'CurrentLevel');
const levelWrite = await windowObject.StudioRuntime.executeDevice('device-runtime-1', 60, levelControl.id);
await windowObject.StudioRuntime.readBackDevice('device-runtime-1', levelWrite.expected, levelControl.id);
assert.deepEqual(pathsSince(start), ['POST /open/api/v1/devices/trait/execute', 'POST /open/api/v1/devices/trait/read'], 'a secondary model-derived control must keep the same one-write/one-read budget');
assert.equal(requests[start].data.data[0].traitCode, 'CurrentLevel');

start = requests.length;
const coolingControl = snapshot.devices[1].controls.find((item) => item.traitCode === 'CoolingTemperature');
const coolingWrite = await windowObject.StudioRuntime.executeDevice('device-runtime-2', 24.5, coolingControl.id);
const coolingReadback = await windowObject.StudioRuntime.readBackDevice('device-runtime-2', coolingWrite.expected, coolingControl.id);
assert.equal(coolingReadback.confirmed, true);
assert.deepEqual(pathsSince(start), ['POST /open/api/v1/devices/trait/execute', 'POST /open/api/v1/devices/trait/read'], 'one air-condition setpoint action may only write once and read once');
assert.equal(requests[start].data.data[0].value, 24.5); assert.equal(typeof requests[start].data.data[0].value, 'number');
assert.equal(requests[start].data.data[0].traitCode, 'CoolingTemperature');

start = requests.length;
const modeControl = snapshot.devices[1].controls.find((item) => item.traitCode === 'HeaterCoolerMode');
const modeWrite = await windowObject.StudioRuntime.executeDevice('device-runtime-2', '1', modeControl.id);
await windowObject.StudioRuntime.readBackDevice('device-runtime-2', modeWrite.expected, modeControl.id);
assert.deepEqual(pathsSince(start), ['POST /open/api/v1/devices/trait/execute', 'POST /open/api/v1/devices/trait/read'], 'one air-condition mode action may only write once and read once');
assert.equal(requests[start].data.data[0].traitCode, 'HeaterCoolerMode');

start = requests.length;
const curtainWrite = await windowObject.StudioRuntime.executeDevice('device-runtime-4', 75);
const curtainReadback = await windowObject.StudioRuntime.readBackDevice('device-runtime-4', curtainWrite.expected);
assert.equal(curtainReadback.confirmed, true); assert.equal(curtainReadback.actual, 75);
assert.deepEqual(pathsSince(start), ['POST /open/api/v1/devices/trait/execute', 'POST /open/api/v1/devices/trait/read'], 'one curtain drag commit may only write once and read once');
assert.deepEqual(requests[start].data.data[0], { deviceId: 'device-runtime-4', endpointId: 2, functionCode: 'WindowCovering', traitCode: 'TargetPositionPercentage', value: 75 });
assert.deepEqual(requests[start + 1].data.data[0], { deviceId: 'device-runtime-4', endpointId: 2, functionCode: 'WindowCovering', traitCodes: ['TargetPositionPercentage'] });

start = requests.length; failNextTraitWrite = true;
await assert.rejects(() => windowObject.StudioRuntime.executeDevice('device-runtime-1', true), /device offline/);
assert.deepEqual(pathsSince(start), ['POST /open/api/v1/devices/trait/execute'], 'top-level success with a failure item must not trigger readback');

start = requests.length; await windowObject.StudioRuntime.executeDevice('device-runtime-6', null);
assert.deepEqual(pathsSince(start), ['POST /open/api/v1/devices/command/execute'], 'command must be one write with no follow-up');

start = requests.length; await windowObject.StudioRuntime.executeScene(snapshot.scenes[0]);
assert.deepEqual(pathsSince(start), ['POST /open/api/v1/automations/manual-triggers/execute'], 'scene must be one write with no follow-up');
assert.deepEqual(requests[start].data, { automationId: 'automation-runtime-1', triggerNodeId: 'trigger-runtime-1' });

const cached = windowObject.StudioRuntime.loadCached(); assert.equal(cached.devices.length, 100); assert.equal(cached.isCached, true); assert.equal(cached.overview.status, 'complete');
start = requests.length;
windowObject.LifePhoneNetwork = { isOffline: () => true, errorText: () => '网络异常，请重试' };
await assert.rejects(() => windowObject.StudioRuntime.executeScene(snapshot.scenes[0]), /网络异常，请重试/);
assert.equal(requests.length, start, 'confirmed phone offline must not send a scene write');
delete windowObject.LifePhoneNetwork;
await assert.rejects(() => windowObject.StudioRuntime.executeDevice('device-runtime-1', true), /安全快捷控制/);
windowObject.StudioRuntime.setCollectionScope('another-studio', 'another-user');
assert.equal(windowObject.StudioRuntime.loadCached(), null, 'a different Studio/account must never read the previous snapshot');
assert.equal(requests.every((request) => request.headers.source === 'studio'), true, 'every Studio native HTTP request must declare headers.source=studio');
console.log(`SMOKE PASS (${requests.length} native requests; progressive first-page load, sequential 100-device overview index, cache-reused UI pagination, public REST routes, model-derived controls, typed writes, failure semantics, silent one-read reconciliation and action budgets verified)`);

function count(method, url) { return requests.filter((item) => item.method === method && item.url === url).length; }
function pathsSince(index) { return requests.slice(index).map((item) => `${item.method} ${item.url}`); }

async function verifyAndroidPromptTransport() {
  const promptCalls = [];
  const androidWindow = {
    location: { search: '' },
    navigator: { language: 'en-US', userAgent: 'Mozilla/5.0 (Linux; Android 14)' },
    setTimeout,
    clearTimeout,
    URLSearchParams,
    __AQARA_NATIVE_CONTEXT__: {
      platform: 'android',
      capabilities: ['nativeHttpRequest', 'queryTransfer'],
    },
    prompt(method, paramsJson) {
      const params = JSON.parse(paramsJson);
      promptCalls.push({ method, params });
      queueMicrotask(() => androidWindow.H5Invoke(
        params.onSuccess,
        JSON.stringify({ code: 0, data: { method } }),
      ));
      return '';
    },
  };
  androidWindow.window = androidWindow;
  const androidContext = vm.createContext({
    window: androidWindow,
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    URLSearchParams,
  });
  vm.runInContext(
    readFileSync(join(packageDir, 'life-bridge.js'), 'utf8'),
    androidContext,
    { filename: 'life-bridge.android.js' },
  );

  assert.equal(androidWindow.LifeBridge.hasTransport(), true, 'Android prompt must be recognized as a native transport');
  await androidWindow.LifeBridge.nativeHttpRequest({
    url: '/open/api/v1/devices',
    method: 'GET',
    params: { pageNum: 1 },
    headers: { source: 'studio' },
    modeType: 'sdkMode',
  });
  await androidWindow.LifeBridge.invoke('queryTransfer', {
    queryUrl: '/open/api/v1/spaces',
    queryType: 'GET',
    queryParams: {},
  });

  assert.deepEqual(promptCalls.map((call) => call.method), ['nativeHttpRequest', 'queryTransfer'], 'Android prompt must preserve the requested bridge method');
  assert.equal(promptCalls[0].params.url, '/open/api/v1/devices');
  assert.equal(promptCalls[0].params.modeType, 'sdkMode');
  assert.deepEqual(promptCalls[0].params.headers, { source: 'studio' });
  assert.equal(promptCalls[1].params.queryUrl, '/open/api/v1/spaces');
  assert.match(promptCalls[0].params.onSuccess, /^lifeH5_/);
  assert.match(promptCalls[0].params.onFailed, /^lifeH5_/);
}

async function verifyCameraSessionProviderContract() {
  const nativeCalls = [];
  const cameraWindow = {
    location: { search: '' },
    navigator: { language: 'en-US', userAgent: 'Mozilla/5.0 (iPhone)' },
    setTimeout,
    clearTimeout,
    URLSearchParams,
    __AQARA_NATIVE_CONTEXT__: {
      platform: 'ios',
      capabilities: ['cameraWebRTCPrepareLive', 'cameraWebRTCCreateSession', 'cameraWebRTCAddIceCandidate', 'cameraWebRTCCloseSession'],
    },
  };
  cameraWindow.window = cameraWindow;
  cameraWindow.webkit = { messageHandlers: { nativeBridge: { postMessage(invocation) {
    nativeCalls.push(structuredClone(invocation));
    const data = invocation.data || {};
    const response = invocation.action === 'cameraWebRTCPrepareLive'
      ? { ticket: 'ticket-1', iceServers: [], iceTransportPolicy: 'all' }
      : invocation.action === 'cameraWebRTCCreateSession'
        ? { answerSdp: 'v=0\r\n', sessionId: 19 }
        : {};
    queueMicrotask(() => cameraWindow.H5Invoke(data.onSuccess, JSON.stringify({ code: 0, data: response })));
  } } } };
  const cameraContext = vm.createContext({
    window: cameraWindow,
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    URLSearchParams,
    structuredClone,
  });
  for (const file of ['life-bridge.js', 'camera-session-provider.js']) {
    vm.runInContext(readFileSync(join(packageDir, file), 'utf8'), cameraContext, { filename: file });
  }

  assert.equal(cameraWindow.CameraSessionProvider.isAvailable(), true, 'iOS camera transport must require all declared native methods');
  const provider = cameraWindow.CameraSessionProvider.create('camera-1');
  const prepared = await provider.prepare();
  assert.equal(prepared.ticket, 'ticket-1');
  const session = await provider.createSession({ requestId: 'abcd', offerSdp: 'v=0\r\n', iceServers: [] }, prepared.ticket);
  assert.deepEqual(JSON.parse(JSON.stringify(session)), { answerSdp: 'v=0\r\n', sessionId: '19' });
  await provider.addLocalIceCandidate(session.sessionId, { candidate: 'candidate:local-path', sdpMid: '0', sdpMLineIndex: 0 });
  const candidates = []; const endings = [];
  const stopIce = provider.watchRemoteIceCandidates(session.sessionId, (candidate) => candidates.push(candidate));
  const stopEnd = provider.watchSessionEnd(session.sessionId, (reason) => endings.push(reason));
  cameraWindow.H5Invoke('onCameraWebRTCSignal', JSON.stringify({ deviceId: 'camera-1', sessionId: 19, type: 'ice', candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 }));
  cameraWindow.H5Invoke('onCameraWebRTCSignal', JSON.stringify({ deviceId: 'camera-1', sessionId: 19, type: 'end', reason: 'remote' }));
  assert.equal(candidates.length, 1); assert.equal(candidates[0].candidate, 'candidate:1');
  assert.deepEqual(endings, ['remote']);
  await provider.closeSession(session.sessionId);
  stopIce(); stopEnd(); provider.dispose();
  assert.deepEqual(nativeCalls.map((call) => call.action), ['cameraWebRTCPrepareLive', 'cameraWebRTCCreateSession', 'cameraWebRTCAddIceCandidate', 'cameraWebRTCCloseSession']);
  assert.equal(nativeCalls[1].data.deviceId, 'camera-1');
  assert.equal(nativeCalls[1].data.ticket, 'ticket-1');
  assert.equal(nativeCalls[1].data.requestId, 'abcd');
  assert.deepEqual(nativeCalls[2].data.candidate, { candidate: 'candidate:local-path', sdpMid: '0', sdpMLineIndex: 0 });

  cameraWindow.__AQARA_NATIVE_CONTEXT__.capabilities = ['nativeHttpRequest'];
  assert.equal(cameraWindow.CameraSessionProvider.isAvailable(), false, 'camera transport must fail closed when native capability is absent');
}

async function verifyCameraWebRTCReadinessContract() {
  function target(properties = {}) {
    const listeners = new Map();
    return Object.assign(properties, {
      addEventListener(name, listener) { const set = listeners.get(name) || new Set(); set.add(listener); listeners.set(name, set); },
      removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
      emit(name) { listeners.get(name)?.forEach((listener) => listener()); },
    });
  }
  const timers = [];
  const readinessWindow = {}; readinessWindow.window = readinessWindow;
  const readinessContext = vm.createContext({
    window: readinessWindow, DOMException, HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; }, clearTimeout() {},
  });
  vm.runInContext(readFileSync(join(packageDir, 'camera-webrtc-readiness.js'), 'utf8'), readinessContext, { filename: 'camera-webrtc-readiness.js' });
  assert.equal(readinessWindow.CameraWebRTCReadiness.mediaConnectionTimeoutMs, 30000, 'camera media deadline must default to 30 seconds');

  const stream = {}; const controller = new AbortController();
  const peer = target({ connectionState: 'connecting', iceConnectionState: 'checking', async getStats() { return new Map(); } });
  const video = target({ srcObject: stream, readyState: 0 });
  const waiting = readinessWindow.CameraWebRTCReadiness.waitForMediaReady({ peer, video, stream, signal: controller.signal });
  const deadline = timers.find((timer) => timer.delay === 30000);
  assert.ok(deadline, 'checking ICE must retain the full 30-second deadline');
  deadline.callback();
  await assert.rejects(waiting, /WebRTC ICE connection timeout/, 'checking ICE must report a connectivity timeout');

  const failedPeer = target({ connectionState: 'connecting', iceConnectionState: 'failed', async getStats() { return new Map(); } });
  const failedVideo = target({ srcObject: stream, readyState: 0 });
  await assert.rejects(
    readinessWindow.CameraWebRTCReadiness.waitForMediaReady({ peer: failedPeer, video: failedVideo, stream, signal: new AbortController().signal }),
    /WebRTC ICE failed/,
    'terminal ICE state must fail immediately instead of consuming the deadline',
  );
}

async function verifyCameraWebRTCRuntimeContract() {
  const events = []; const addedCandidates = []; const localCandidates = []; const closedSessions = []; const peerConfigurations = []; const sessionRequests = []; let gatheringWaits = 0;
  class FakePeerConnection {
    constructor(configuration) { this.localDescription = null; this.listeners = new Map(); peerConfigurations.push(structuredClone(configuration)); }
    addTransceiver() {}
    addEventListener(name, listener) { const set = this.listeners.get(name) || new Set(); set.add(listener); this.listeners.set(name, set); }
    removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
    emit(name, value) { this.listeners.get(name)?.forEach((listener) => listener(value)); }
    async createOffer() { return { type: 'offer', sdp: ['v=0', 'a=ice-options:trickle', 'm=video 9 UDP/TLS/RTP/SAVPF 96', 'a=candidate:ip 1 udp 1 192.0.2.10 20000 typ host', 'a=candidate:mdns 1 udp 1 camera.local 20001 typ host', ''].join('\r\n') }; }
    async setLocalDescription(offer) {
      this.localDescription = offer;
      this.emit('icecandidate', { candidate: { candidate: 'candidate:local-host 1 udp 1 192.0.2.10 20000 typ host', sdpMid: 'video', sdpMLineIndex: 0 } });
      this.emit('icecandidate', { candidate: { candidate: 'candidate:local-mdns 1 udp 1 camera.local 20001 typ host', sdpMid: 'video', sdpMLineIndex: 0 } });
      this.emit('icecandidate', { candidate: { candidate: 'candidate:local-relay 1 udp 1 198.51.100.10 30000 typ relay', sdpMid: 'audio', sdpMLineIndex: 1 } });
    }
    async setRemoteDescription(answer) {
      events.push({ type: 'remote', sdp: answer.sdp });
      if (answer.sdp.includes('a=candidate:')) throw new Error('Invalid SDP line.');
    }
    async addIceCandidate(candidate) {
      events.push({ type: 'candidate', candidate: structuredClone(candidate) }); addedCandidates.push(structuredClone(candidate));
      if (addedCandidates.length === 1) throw new Error('one incompatible candidate');
    }
    getSenders() { return []; }
    getReceivers() { return []; }
    close() {}
  }
  class FakeMediaStream { getTracks() { return []; } addTrack() {} }
  const answerSdp = [
    'v=0',
    'o=- 1 1 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'm=video 9 UDP/TLS/RTP/SAVPF 96',
    'a=candidate:video-path 1 udp 1 192.0.2.1 10000 typ host',
    'a=mid:video',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'a=mid:audio',
    'a=candidate:audio-path 1 udp 1 192.0.2.2 10001 typ host',
  ].join('\n');
  const preparedIceServers = [{ urls: ['turn:relay.invalid:3478?transport=udp'], username: 'fixture-user', credential: 'fixture-credential' }];
  let useTrickle = true;
  const provider = {
    async prepare() { return { ticket: 'ticket', iceServers: preparedIceServers, iceTransportPolicy: 'all', localIceMode: useTrickle ? 'trickle' : 'complete-offer' }; },
    async createSession(request) { sessionRequests.push(structuredClone(request)); return { answerSdp, sessionId: '70' }; },
    supportsLocalIce() { return true; },
    async addLocalIceCandidate(sessionId, candidate) { localCandidates.push({ sessionId, candidate: structuredClone(candidate) }); },
    watchRemoteIceCandidates() { return () => {}; },
    watchSessionEnd() { return () => {}; },
    async closeSession(sessionId) { closedSessions.push(sessionId); },
    dispose() {},
  };
  const runtimeWindow = {
    CameraSessionProvider: { create: () => provider, isAvailable: () => true },
    CameraWebRTCReadiness: { waitForIceGathering: async () => { gatheringWaits += 1; }, waitForMediaReady: async () => {} },
    RTCPeerConnection: FakePeerConnection,
    addEventListener() {},
  };
  runtimeWindow.window = runtimeWindow;
  const runtimeDocument = { hidden: false, addEventListener() {} };
  const deterministicCrypto = { getRandomValues(bytes) { bytes.fill(7); return bytes; } };
  const runtimeContext = vm.createContext({
    window: runtimeWindow,
    document: runtimeDocument,
    console,
    crypto: deterministicCrypto,
    AbortController,
    DOMException,
    RTCPeerConnection: FakePeerConnection,
    MediaStream: FakeMediaStream,
    URL,
    structuredClone,
  });
  vm.runInContext(readFileSync(join(packageDir, 'camera-webrtc-runtime.js'), 'utf8'), runtimeContext, { filename: 'camera-webrtc-runtime.js' });
  const video = { srcObject: null, pause() {}, async play() {} };
  await runtimeWindow.CameraWebRTCRuntime.start('camera-runtime', video, () => {});
  await new Promise(setImmediate);
  assert.deepEqual(peerConfigurations, [{ iceServers: preparedIceServers, iceTransportPolicy: 'all' }], 'native ICE configuration must create exactly one PeerConnection so host and relay candidates gather together');
  assert.equal(sessionRequests.length, 1, 'one live-view attempt must send exactly one Offer');
  assert.equal(gatheringWaits, 0, 'trickle mode must send Offer without waiting for ICE gathering to complete');
  assert.equal(sessionRequests[0].offerSdp.includes('camera.local'), false, 'camera signaling Offer must omit mDNS candidates');
  assert.equal(sessionRequests[0].offerSdp.includes('192.0.2.10'), true, 'camera signaling Offer must retain numeric IP candidates');
  assert.deepEqual(localCandidates, [
    { sessionId: '70', candidate: { candidate: 'candidate:local-host 1 udp 1 192.0.2.10 20000 typ host', sdpMid: 'video', sdpMLineIndex: 0 } },
    { sessionId: '70', candidate: { candidate: 'candidate:local-relay 1 udp 1 198.51.100.10 30000 typ relay', sdpMid: 'audio', sdpMLineIndex: 1 } },
  ], 'local ICE gathered before Answer must flush in order after the real sessionId is available');
  assert.deepEqual(sessionRequests[0].iceServers, preparedIceServers, 'the same native ICE configuration must be presented to the session bridge');
  assert.equal(sessionRequests[0].iceTransportPolicy, 'all');
  const remote = events.find((event) => event.type === 'remote');
  assert.ok(remote, 'camera runtime must apply one remote Answer');
  assert.equal(remote.sdp.includes('a=candidate:'), false, 'embedded ICE candidates must be removed before WKWebView setRemoteDescription');
  assert.equal(remote.sdp.endsWith('\r\n'), true, 'Answer SDP must use a trailing CRLF');
  assert.equal(remote.sdp.includes('\n') && !remote.sdp.includes('\r\n'), false, 'Answer SDP must normalize line endings to CRLF');
  assert.deepEqual(JSON.parse(JSON.stringify(addedCandidates)), [
    { candidate: 'candidate:video-path 1 udp 1 192.0.2.1 10000 typ host', sdpMid: 'video', sdpMLineIndex: 0 },
    { candidate: 'candidate:audio-path 1 udp 1 192.0.2.2 10001 typ host', sdpMid: 'audio', sdpMLineIndex: 1 },
  ], 'embedded candidates must retain exact text and media-section identity');
  assert.deepEqual(events.map((event) => event.type), ['remote', 'candidate', 'candidate'], 'remote SDP must be applied before candidates and one rejected candidate must not block the rest');
  await runtimeWindow.CameraWebRTCRuntime.stop('camera-runtime');
  assert.deepEqual(closedSessions, ['70'], 'runtime cleanup must close the real device session');
  useTrickle = false;
  await runtimeWindow.CameraWebRTCRuntime.start('camera-runtime-fallback', video, () => {});
  await new Promise(setImmediate);
  assert.equal(gatheringWaits, 1, 'complete-Offer compatibility mode must wait for ICE gathering');
  assert.equal(sessionRequests.length, 2, 'compatibility mode must still send exactly one additional Offer');
  assert.equal(sessionRequests[1].offerSdp.includes('a=ice-options:trickle'), false, 'complete Offer must not advertise Trickle ICE');
  assert.equal(localCandidates.length, 2, 'complete-Offer compatibility mode must not send separate local ICE commands');
  await runtimeWindow.CameraWebRTCRuntime.stop('camera-runtime-fallback');
  assert.deepEqual(closedSessions, ['70', '70']);
  let releasePrepare; let repeatedPrepareCalls = 0;
  provider.prepare = () => { repeatedPrepareCalls += 1; return new Promise((resolve) => { releasePrepare = resolve; }); };
  useTrickle = true;
  const repeatedA = runtimeWindow.CameraWebRTCRuntime.start('camera-runtime-coalesced', video, () => {});
  const repeatedB = runtimeWindow.CameraWebRTCRuntime.start('camera-runtime-coalesced', video, () => {});
  assert.equal(repeatedA, repeatedB, 'repeated start activation must reuse the in-flight attempt');
  await new Promise(setImmediate);
  assert.equal(repeatedPrepareCalls, 1, 'repeated start activation must issue exactly one native prepare');
  releasePrepare({ ticket: 'ticket', iceServers: preparedIceServers, iceTransportPolicy: 'all', localIceMode: 'trickle' });
  await repeatedA;
  await runtimeWindow.CameraWebRTCRuntime.stop('camera-runtime-coalesced');
  provider.prepare = () => new Promise(() => {});
  const cancelled = runtimeWindow.CameraWebRTCRuntime.start('camera-runtime-cancelled', video, () => {});
  const cancelledResult = assert.rejects(cancelled, /WebRTC connection aborted/, 'stopping during native prepare must settle the H5 attempt immediately');
  await new Promise(setImmediate);
  await runtimeWindow.CameraWebRTCRuntime.stop('camera-runtime-cancelled');
  await cancelledResult;
  assert.equal(closedSessions.at(-1), null, 'stopping before SessionId exists must still ask native to cancel the pending session');
}

function fixtureResponse(request) {
  if (request.method === 'GET' && request.url === '/open/api/v1/devices') {
    const pageNum = Number(request.params.pageNum); const pageSize = Number(request.params.pageSize); const start = (pageNum - 1) * pageSize;
    return { pageNum, pageSize, totalCount: devices.length, data: devices.slice(start, start + pageSize) };
  }
  if (request.method === 'GET' && request.url === '/open/api/v1/spaces') return Array.from({ length: 5 }, (_, index) => ({ spaceId: `space-${index}`, name: `空间 ${index}` }));
  if (request.method === 'GET' && request.url === '/open/api/v1/scenes') return [{ automationId: 'automation-runtime-1', automationName: '回家自动化', triggerNodeId: 'trigger-runtime-1', triggerName: '回家', enabled: true, space: { spaceId: 'space-1', name: '客厅' } }];
  if (request.method === 'GET' && request.url === '/open/api/v1/devices/definitions') return String(request.params.deviceIds).split(',').filter(Boolean).map((deviceId) => definition(deviceId));
  if (request.method === 'POST' && request.url === '/open/api/v1/devices/trait/execute') {
    const item = request.data.data[0];
    if (failNextTraitWrite) { failNextTraitWrite = false; return [{ ...item, code: 1103, message: 'device offline' }]; }
    if (item.deviceId === 'device-runtime-1' && item.traitCode in lightState) lightState[item.traitCode] = item.value;
    if (item.deviceId === 'device-runtime-2' && item.traitCode in climateState) climateState[item.traitCode] = item.value;
    if (item.deviceId === 'device-runtime-4') curtainState = item.value;
    return [];
  }
  if (request.method === 'POST' && request.url === '/open/api/v1/devices/trait/read') {
    const item = request.data.data[0]; const traitCode = item.traitCodes[0]; const value = item.deviceId === 'device-runtime-1' ? lightState[traitCode] : item.deviceId === 'device-runtime-4' ? curtainState : climateState[traitCode];
    return [{ deviceId: item.deviceId, endpointId: item.endpointId, functionCode: item.functionCode, traitCode: item.traitCodes[0], value, time: Date.now() }];
  }
  if (request.method === 'POST' && request.url === '/open/api/v1/devices/command/execute') return [];
  if (request.method === 'POST' && request.url === '/open/api/v1/automations/manual-triggers/execute') return {};
  throw new Error(`unexpected Studio request ${request.method} ${request.url}`);
}

function definition(deviceId) {
  const index = Number(deviceId.split('-').at(-1)) - 1; const base = { deviceId, endpoints: [{ endpointId: 2, functions: [{ functionCode: 'Output', traits: [], commands: [] }] }] }; const fn = base.endpoints[0].functions[0];
  if (index === 0) fn.traits.push(
    { traitCode: 'OnOff', parameter: { type: 'Bool', writable: true, readable: true }, value: lightState.OnOff },
    { traitCode: 'CurrentLevel', pointName: '亮度', parameter: { type: 'Float', writable: true, readable: true, min: 1, max: 100, step: 1, unit: '%' }, value: lightState.CurrentLevel },
    { traitCode: 'ColorTemperature', pointName: '色温', parameter: { type: 'Float', writable: true, readable: true, min: 153, max: 500, step: 1, unit: 'mired' }, value: lightState.ColorTemperature },
    { traitCode: 'OnTransitionTime', pointName: '开启过渡时间', parameter: { type: 'Integer', writable: true, readable: true, min: 0, max: 10000, step: 500, unit: 'ms' }, value: 3000 },
    { traitCode: 'ActivePower', pointName: '实时功率', parameter: { type: 'Float', writable: false, readable: true, unit: 'W' }, value: 8.4 },
    { traitCode: 'DeviceID', pointName: '根节点 - 设备ID', parameter: { type: 'String', writable: false, readable: true }, value: 'fixture-device-id' },
    { traitCode: 'ConnectionStatus', pointName: '根节点 - 连接状态', parameter: { type: 'Bool', writable: false, readable: true }, value: true },
    { traitCode: 'FirmwareVersion', pointName: '固件版本', parameter: { type: 'String', writable: false, readable: true }, value: '1.0.0' },
  );
  else if (index === 1) {
    base.endpoints[0].deviceType = 'AirCondition'; fn.functionCode = 'Thermostat';
    fn.traits.push(
      { traitCode: 'OnOff', parameter: { type: 'Bool', writable: true, readable: true }, value: climateState.OnOff },
      { traitCode: 'HeaterCoolerMode', parameter: { type: 'Enum', writable: true, readable: true, supportedValues: [{ key: '制冷', value: '0' }, { key: '制热', value: '1' }, { key: '送风', value: '3' }] }, value: climateState.HeaterCoolerMode },
      { traitCode: 'CoolingTemperature', parameter: { type: 'Float', writable: true, readable: true, min: 16, max: 30, step: 0.5, unit: '°C' }, value: climateState.CoolingTemperature },
      { traitCode: 'HeatingTemperature', parameter: { type: 'Float', writable: true, readable: true, min: 16, max: 30, step: 0.5, unit: '°C' }, value: climateState.HeatingTemperature },
      { traitCode: 'FanMode', parameter: { type: 'Enum', writable: true, readable: true, supportedValues: [{ key: '低', value: '1' }, { key: '中', value: '2' }, { key: '高', value: '3' }] }, value: climateState.FanMode },
      { traitCode: 'CurrentTemperature', parameter: { type: 'Float', writable: false, readable: true, unit: '°C' }, value: 22.5 },
    );
  }
  else if (index === 2) fn.traits.push({ traitCode: 'Mode', parameter: { type: 'Enum', writable: true, readable: true, supportedValues: [{ key: '自动', value: '0' }, { key: '制冷', value: '1' }] }, value: '0' });
  else if (index === 3) {
    base.endpoints[0].deviceType = 'WindowCovering'; fn.functionCode = 'WindowCovering';
    fn.traits.push(
      { traitCode: 'OnOff', parameter: { type: 'Bool', writable: true, readable: true }, value: true },
      { traitCode: 'CurrentPositionPercentage', parameter: { type: 'Integer', writable: false, readable: true, min: 0, max: 100, step: 1, unit: '%' }, value: curtainState },
      { traitCode: 'TargetPositionPercentage', parameter: { type: 'Integer', writable: true, readable: true, min: 0, max: 100, step: 1, unit: '%' }, value: null },
    );
  }
  else if (index === 4) fn.commands.push({ commandCode: 'FactoryReset', fields: [] });
  else if (index === 5) {
    fn.commands.push(
      { commandCode: 'Pause', fields: [] },
      { commandCode: 'WebRTCProvideOffer', fields: ['InitiatorData', 'SessionId', 'SDP', 'StreamUsage', 'ICEServers', 'ICETransportPolicy'].map((fieldCode, index) => ({ fieldCode, index })) },
      { commandCode: 'WebRTCProvideICECandidates', fields: ['SessionId', 'ICECandidates'].map((fieldCode, index) => ({ fieldCode, index })) },
      { commandCode: 'WebRTCEndSession', fields: ['SessionId', 'Reason'].map((fieldCode, index) => ({ fieldCode, index })) },
    );
    fn.traits.push({ traitCode: 'WebRTCSignalingEvent', parameter: { type: 'Struct', writable: false, readable: true }, value: null });
  }
  else if (index === 10) fn.traits.push(
    { traitCode: 'DeviceID', pointName: '根节点 - 设备ID', parameter: { type: 'String', writable: false, readable: true }, value: 'gateway-fixture' },
    { traitCode: 'MacAddress', pointName: '根节点 - Mac地址', parameter: { type: 'String', writable: false, readable: true }, value: '00:00:00:00:00:00' },
    { traitCode: 'ConnectionStatus', pointName: '根节点 - 连接状态', parameter: { type: 'Bool', writable: false, readable: true }, value: true },
    { traitCode: 'Battery', pointName: '后备电池', parameter: { type: 'Integer', writable: false, readable: true, unit: '%' }, value: 88 },
  );
  else if (index === 13) {
    base.endpoints[0].deviceType = 'AirCondition'; fn.functionCode = 'Thermostat';
    fn.traits.push(
      { traitCode: 'FanSwitch', pointName: '风机开关', parameter: { type: 'Bool', writable: true, readable: true }, value: true },
      { traitCode: 'RoomTemperature', pointName: '室温', parameter: { type: 'Float', writable: false, readable: true, unit: '°C' }, value: 25.5 },
    );
  }
  else if (index % 12 === 6) fn.traits.push(
    { traitCode: 'CurrentHumidity', pointName: '相对湿度', parameter: { type: 'Float', writable: false, readable: true, unit: '%' }, value: 50 + (index % 10) },
    { traitCode: 'OccupancySensed', pointName: '空间有人', parameter: { type: 'Bool', writable: false, readable: true }, value: index % 24 === 6 },
    { traitCode: 'MotionDetected', pointName: '检测到活动', parameter: { type: 'Bool', writable: false, readable: true }, value: false },
  );
  else fn.traits.push({ traitCode: 'Battery', parameter: { type: 'Integer', writable: false, readable: true, unit: '%' }, value: 88 });
  return base;
}

async function verifyNativeEntryBridgeContracts() {
  const source=readFileSync(join(packageDir,'life-bridge.js'),'utf8');
  for(const method of ['openNavigationDrawer','openAIAssistant','openAddDevice']) for(const platform of ['ios','android']) {
    let seq=0; const timers=new Map(), calls=[];
    const window={__AQARA_NATIVE_CONTEXT__:{platform,capabilities:[method]},navigator:{userAgent:platform==='android'?'Android':''}};
    const post=invocation=>calls.push(invocation);
    if(platform==='ios')window.webkit={messageHandlers:{nativeBridge:{postMessage:post}}};
    else window.prompt=(action,json)=>post({action,data:JSON.parse(json)});
    vm.runInNewContext(source,{window,URLSearchParams,setTimeout:(fn,ms)=>{assert.equal(ms,8000);timers.set(++seq,fn);return seq;},clearTimeout:id=>timers.delete(id)});
    const promise=window.LifeBridge[method]();const first=calls.at(-1);
    assert.equal(first.action,method);assert.deepEqual(Object.keys(first.data).sort(),['onFailed','onSuccess']);
    window.H5Invoke(first.data.onSuccess,JSON.stringify({code:0,data:{accepted:true}}));assert.equal((await promise).accepted,true);assert.equal(timers.size,0);
    if(method==='openAIAssistant') {
      const before=calls.length;
      await assert.rejects(window.LifeBridge.openAIAssistant('Which rooms are occupied?'),/question navigation is unavailable/);
      assert.equal(calls.length,before,'old hosts must not silently discard a question');
      window.__AQARA_NATIVE_CONTEXT__.capabilities.push('aiAssistantInitialMessage');
      for(const [input,expected] of [['  哪个房间有人？ \n','哪个房间有人？'],[' <img src=x onerror=alert(1)> ','<img src=x onerror=alert(1)>'],[' \n ',null],[undefined,null]]) {
        const request=window.LifeBridge.openAIAssistant(input);const sent=calls.at(-1);
        assert.equal(sent.action,'openAIAssistant');assert.equal(sent.data.content,expected===null?undefined:expected);
        window.H5Invoke(sent.data.onSuccess,{code:0,data:{accepted:true}});await request;assert.equal(timers.size,0);
      }
      for(const input of [7,{},[]])await assert.rejects(window.LifeBridge.openAIAssistant(input),/must be a string/);
      const disabled=window.LifeBridge.openAIAssistant();
      const disabledCheck=assert.rejects(disabled,error=>error.reason==='disabled');
      window.H5Invoke(calls.at(-1).data.onSuccess,{code:0,data:{accepted:false,reason:'disabled',status:false}});
      await disabledCheck;
    }
    for(const payload of [{code:0,data:{accepted:false}},{code:0,data:{}},{code:500,message:'drawer failed'}]) {
      const pending=window.LifeBridge[method]();const rejection=assert.rejects(pending);
      window.H5Invoke(calls.at(-1).data.onSuccess,payload);await rejection;assert.equal(timers.size,0);
    }
    const failed=window.LifeBridge[method]();const failedCheck=assert.rejects(failed,/denied/);
    window.H5Invoke(calls.at(-1).data.onFailed,{code:-2,message:'denied'});await failedCheck;assert.equal(timers.size,0);
    const pending=window.LifeBridge[method]();const timeout=assert.rejects(pending,/timed out/);const late=calls.at(-1);
    const [timerId,fire]=[...timers.entries()][0];timers.delete(timerId);fire();await timeout;assert.equal(timers.size,0);
    window.H5Invoke(late.data.onSuccess,{code:0,data:{accepted:true}});
    for(const capabilities of [[],['nativeHttpRequest']]) {
      window.__AQARA_NATIVE_CONTEXT__.capabilities=capabilities;const count=calls.length;
      await assert.rejects(window.LifeBridge[method](),/unavailable/);assert.equal(calls.length,count);assert.equal(timers.size,0);
    }
  }
}

async function verifyAiAgentStatusBridge() {
  const source=readFileSync(join(packageDir,'life-bridge.js'),'utf8');
  for(const platform of ['ios','android']) {
    const calls=[],states=[],documentListeners=new Map();
    const window={__AQARA_NATIVE_CONTEXT__:{platform,capabilities:['subscribeUserAIAgentStatus']},navigator:{userAgent:platform==='android'?'Android':''},document:{hidden:false,addEventListener(name,listener){documentListeners.set(name,listener);},removeEventListener(name){documentListeners.delete(name);}},addEventListener(){},removeEventListener(){}};
    const post=invocation=>calls.push(invocation);
    if(platform==='ios')window.webkit={messageHandlers:{nativeBridge:{postMessage:post}}};
    else window.prompt=(action,json)=>post({action,data:JSON.parse(json)});
    vm.runInNewContext(source,{window,URLSearchParams,setTimeout,clearTimeout});
    const dispose=window.LifeBridge.subscribeUserAIAgentStatus(status=>states.push(status));
    assert.equal(calls.length,1);
    assert.equal(calls[0].action,'subscribeUserAIAgentStatus');
    window.H5Invoke('UserAIAgentStatusUpdate',{code:0,data:{status:false}});
    window.H5Invoke(calls[0].data.onSuccess,{code:0,data:{status:true}});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(states,[false],'a late snapshot must not overwrite a newer push');
    window.H5Invoke('UserAIAgentStatusUpdate',{code:0,data:{status:true}});
    assert.deepEqual(states,[false,true]);
    documentListeners.get('visibilitychange')();
    assert.equal(calls.length,2,'returning to the page refreshes the native snapshot');
    window.H5Invoke(calls[1].data.onSuccess,{code:0,data:{status:true}});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(states,[false,true,true]);
    dispose.refresh();
    assert.equal(calls.length,3,'native page return can explicitly refresh the snapshot');
    window.H5Invoke(calls[2].data.onSuccess,{code:0,data:{status:false}});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(states,[false,true,true,false]);
    window.H5Invoke('UserAIAgentStatusUpdate',{code:0,data:{status:'invalid'}});
    assert.deepEqual(states,[false,true,true,false,false],'malformed status must hide the entry');
    dispose();
    window.H5Invoke('UserAIAgentStatusUpdate',{code:0,data:{status:false}});
    assert.deepEqual(states,[false,true,true,false,false],'disposed H5 listener must ignore later events');
  }
}
