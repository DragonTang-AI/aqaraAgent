#!/usr/bin/env node
// Optional browser gate. Playwright is a QA dependency, never a production asset.
import assert from 'node:assert/strict';
import { assertExternalQAOutput } from './qa-output.mjs';
import { statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const packageDir = resolve(args[0] || '.');
const option = (name) => args[args.indexOf(name) + 1];
const baseline = args.includes('--baseline');
const screenshotPath = args.includes('--screenshot') ? resolve(option('--screenshot')) : '';
const expandedScreenshotPath = args.includes('--expanded-screenshot') ? resolve(option('--expanded-screenshot')) : '';
assertExternalQAOutput(packageDir, screenshotPath);
assertExternalQAOutput(packageDir, expandedScreenshotPath);
const viewportWidth = args.includes('--width') ? Number(option('--width')) : 390;
const viewportHeight = args.includes('--height') ? Number(option('--height')) : 844;
const fixtureTheme = args.includes('--theme') && option('--theme') === 'dark' ? 'dark' : 'light';
const fixturePlatform = args.includes('--platform') ? option('--platform') : 'ios';
assert.ok(Number.isFinite(viewportWidth) && viewportWidth >= 320, '--width must be at least 320');
assert.ok(Number.isFinite(viewportHeight) && viewportHeight >= 320, '--height must be at least 320');
assert.ok(['ios', 'android'].includes(fixturePlatform), '--platform must be ios or android');
const modulePath = args.includes('--playwright-module') ? pathToFileURL(resolve(option('--playwright-module'))).href : 'playwright';
const playwrightModule = await import(modulePath); const { chromium } = playwrightModule.default || playwrightModule;
const browser = await chromium.launch({ headless: true, ...(args.includes('--browser') ? { executablePath: resolve(option('--browser')) } : {}) });
const page = await browser.newPage({
  viewport: { width: viewportWidth, height: viewportHeight },
  ...(fixturePlatform === 'android' ? {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  } : {}),
});
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.addInitScript(({ themeMode, platformMode }) => {
    window.__qaInitialScroll = []; window.addEventListener('scroll', () => window.__qaInitialScroll.push(scrollY), { passive: true });
    window.__qaRequests = []; window.__qaLongTasks = [];
    try { new PerformanceObserver((list) => window.__qaLongTasks.push(...list.getEntries().map((entry) => entry.duration))).observe({ type: 'longtask', buffered: true }); } catch { /* optional browser metric */ }
    window.__AQARA_NATIVE_CONTEXT__ = { platform: platformMode, capabilities: ['nativeHttpRequest', 'subscribeThemeMode', 'subscribeUserAIAgentStatus'] };
    const devices = Array.from({ length: 100 }, (_, index) => ({ deviceId: `fixture-${index}`, deviceName: index === 0 ? '康养区-超长名称全光谱智能吸顶灯' : index === 2 ? '客厅顶灯' : index === 3 ? '客厅吊灯' : index === 4 ? '离线全光谱吸顶灯' : index === 6 ? 'Smart Camera G350' : index === 7 ? 'Aqara 网关 M2' : index === 11 ? '智能窗帘电机 C100' : `设备 ${index}`, deviceTypesList: [index === 10 || index === 18 ? 'Sensor' : index === 6 ? 'Camera' : index === 7 ? 'Gateway' : index === 11 ? 'WindowCovering' : 'Light'], state: index !== 4 && index !== 6 && (index === 10 || index % 11 !== 10), space: { spaceId: `space-${index % 5}`, name: `空间 ${index % 5}` } }));
    const values = new Map();
    window.webkit = { messageHandlers: { nativeBridge: { postMessage({ action, data }) {
      if (action === 'subscribeThemeMode') { queueMicrotask(() => window.H5Invoke(data.onSuccess, { code: 0, data: { themeMode } })); return; }
      if (action === 'subscribeUserAIAgentStatus') { queueMicrotask(() => window.H5Invoke(data.onSuccess, { code: 0, data: { status: true } })); return; }
      if (action === 'openNavigationDrawer') {
        (window.__qaDrawerRequests ||= []).push({action,data});
        if(window.__qaDrawerHold)return;
        setTimeout(()=>window.H5Invoke(window.__qaDrawerFailure?data.onFailed:data.onSuccess,window.__qaDrawerFailure?{code:-2,message:'drawer rejected'}:{code:0,data:{accepted:true}}),40);
        return;
      }
      if (action === 'openAIAssistant') {
        (window.__qaAIRequests ||= []).push({action,data});
        if(window.__qaAIHold)return;
        setTimeout(()=>window.H5Invoke(window.__qaAIFailure?data.onFailed:data.onSuccess,window.__qaAIFailure?{code:-2,message:'AI rejected'}:{code:0,data:{accepted:true}}),40);
        return;
      }
      window.__qaRequests.push({ url: data.url, at: performance.now() });
      let response;
      if (data.url.endsWith('/devices')) { const { pageNum, pageSize } = data.params; response = { data: devices.slice((pageNum - 1) * pageSize, pageNum * pageSize), totalCount: devices.length }; }
      else if (data.url.endsWith('/spaces')) response = [{spaceId:'studio-root',name:'真实家庭名称',children:[{ spaceId: 'space-0', name: '同名空间', children: [{spaceId:'space-1',name:'同名空间'}] }, {spaceId:'empty-space',name:'空空间'}]}];
      else if (data.url.endsWith('/scenes')) response = [];
      else if (data.url.endsWith('/definitions')) response = data.params.deviceIds.split(',').map((id) => {
        const index = Number(id.split('-').at(-1)); const sensor = index === 10 || index === 18; const camera = index === 6; const hub = index === 7; const curtain = index === 11; const compactSensor = index === 10; const richLight = !sensor && !camera && !hub && !curtain && index % 4 === 0; const singleRangeLight = !sensor && !camera && !hub && !curtain && index % 4 === 1;
        const traits = sensor ? [
          { traitCode: 'CurrentTemperature', pointName: '温度', parameter: { type: 'Float', readable: true, writable: false, unit: '°C' }, value: 25.2 },
          ...(compactSensor ? [] : [
            { traitCode: 'CurrentHumidity', pointName: '湿度', parameter: { type: 'Float', readable: true, writable: false, unit: '%' }, value: 61 },
            { traitCode: 'OccupancySensed', pointName: '空间有人', parameter: { type: 'Bool', readable: true, writable: false }, value: true },
          ]),
          { traitCode: 'MacAddress', pointName: 'Mac地址', parameter: { type: 'String', readable: true, writable: false }, value: '00:00:00:00:00:00' },
        ] : camera ? [
          { traitCode: 'OnOff', pointName: '电源', parameter: { type: 'Bool', readable: true, writable: true }, value: true },
          { traitCode: 'WebRTCSignalingEvent', pointName: 'WebRTC 信令', parameter: { type: 'Struct', readable: true, writable: false }, value: null },
          { traitCode: 'CloudPosition', pointName: '云台归位', parameter: { type: 'Object', readable: true, writable: false }, value: { mode: 0, positions: [0, 1] } },
          { traitCode: 'PresetPositions', pointName: '当前云台位置', parameter: { type: 'Array', readable: true, writable: false }, value: [{ x: -152, y: 24 }] },
          { traitCode: 'BatteryLevel', pointName: '电量', parameter: { type: 'Integer', readable: true, writable: false, unit: '%' }, value: 86 },
          { traitCode: 'CurrentTemperature', pointName: '机身温度', parameter: { type: 'Float', readable: true, writable: false, unit: '°C' }, value: 31.6 },
        ] : curtain ? [
          { traitCode: 'TargetPositionPercentage', pointName: '目标开合度', parameter: { type: 'Integer', readable: true, writable: true, min: 0, max: 100, step: 1, unit: '%' }, value: 71 },
          { traitCode: 'CurrentPositionPercentage', pointName: '当前开合度', parameter: { type: 'Integer', readable: true, writable: false, unit: '%' }, value: 71 },
          { traitCode: 'MotorState', pointName: '电机运行状态', parameter: { type: 'String', readable: true, writable: false }, value: 'Stopped' },
        ] : [
          { traitCode: 'OnOff', pointName: '电源', parameter: { type: 'Bool', readable: true, writable: true }, value: values.get(id) ?? (hub ? false : index % 4 !== 2) },
          { traitCode: 'DeviceID', pointName: '设备ID', parameter: { type: 'String', readable: true, writable: false }, value: id },
          { traitCode: 'ConnectionStatus', pointName: '连接状态', parameter: { type: 'Bool', readable: true, writable: false }, value: true },
          ...(hub ? [
            { traitCode: 'ProductName', pointName: '根节点 - 产品名称', parameter: { type: 'String', readable: true, writable: false }, value: 'M300' },
            { traitCode: 'SupportedMatterRoles', pointName: '根节点 - 支持的 Matter 角色', parameter: { type: 'Integer', readable: true, writable: false }, value: 7 },
            { traitCode: 'BatteryLevel', pointName: '后备电池', parameter: { type: 'Integer', readable: true, writable: false, unit: '%' }, value: 92 },
          ] : []),
          ...(richLight || singleRangeLight ? [
            { traitCode: 'CurrentLevel', pointName: '亮度', parameter: { type: 'Integer', readable: true, writable: true, min: 1, max: 100, step: 1, unit: '%' }, value: 50 },
          ] : []),
          ...(richLight ? [
            { traitCode: 'ColorTemperature', pointName: '色温', parameter: { type: 'Integer', readable: true, writable: true, min: 153, max: 500, step: 1, unit: 'mired' }, value: 370 },
            { traitCode: 'EffectMode', pointName: '灯效', parameter: { type: 'Enum', readable: true, writable: true, supportedValues: [{ key: '常亮', value: '0' }, { key: '呼吸', value: '1' }] }, value: '0' },
            ...Array.from({ length: 8 }, (_, n) => ({ traitCode: `Reading${n}`, pointName: `读数 ${n}`, parameter: { type: 'Float', readable: true, writable: false }, value: n })),
          ] : []),
        ];
        const commands = camera ? [
          { commandCode: 'WebRTCProvideOffer', fields: ['InitiatorData', 'SessionId', 'SDP', 'StreamUsage', 'ICEServers', 'ICETransportPolicy'].map((fieldCode, fieldIndex) => ({ fieldCode, index: fieldIndex })) },
          { commandCode: 'WebRTCEndSession', fields: ['SessionId', 'Reason'].map((fieldCode, fieldIndex) => ({ fieldCode, index: fieldIndex })) },
        ] : [];
        return { deviceId: id, endpoints: [{ endpointId: 1, deviceType: sensor ? 'Sensor' : camera ? 'Camera' : hub ? 'Gateway' : curtain ? 'WindowCovering' : 'Light', functions: [{ functionCode: sensor ? 'Environment' : camera ? 'Camera' : hub ? 'Gateway' : curtain ? 'WindowCovering' : 'Light', traits, commands }] }] };
      });
      else if (data.url.endsWith('/trait/execute')) { const item = data.data.data[0]; if (window.__qaFailNextWrite) { window.__qaFailNextWrite = false; setTimeout(() => window.H5Invoke(data.onFailed, { code: 500, message: 'fixture write failed' }), 5); return; } values.set(item.deviceId, item.value); response = []; }
      else if (data.url.endsWith('/trait/read')) { const item = data.data.data[0]; response = [{ ...item, traitCode: item.traitCodes[0], value: values.get(item.deviceId) }]; }
      else throw new Error(`Unexpected fixture request: ${data.url}`);
      const delay = window.__qaRefreshDelay || (data.url.endsWith('/devices') && Number(data.params?.pageSize) > 12 ? 40 : 5);
      setTimeout(() => window.H5Invoke(data.onSuccess, { code: 0, data: response }), delay);
    } } } };
    if (platformMode === 'android') {
      const dispatchPrompt = window.webkit.messageHandlers.nativeBridge.postMessage;
      window.prompt = (method, paramsJson) => {
        dispatchPrompt({ action: String(method), data: JSON.parse(paramsJson || '{}') });
        return '';
      };
      delete window.webkit;
    }
  }, { themeMode: fixtureTheme, platformMode: fixturePlatform });
  await page.goto(pathToFileURL(join(packageDir, 'index.html')).href);
  await page.waitForFunction(() => document.querySelectorAll('.device-card').length === 12 && !window.StudioHomeRefresh.busy());
  const firstPaint = await page.evaluate(() => ({ requests: window.__qaRequests.length, cards: document.querySelectorAll('.device-card').length, coverage: document.querySelector('#overview-coverage').textContent }));
  await page.waitForFunction(() => /全部\s*100|All\s*100/.test(document.querySelector('#overview-coverage')?.textContent || ''));
  if (!baseline) assert.deepEqual(await page.evaluate(() => ({ y: scrollY, moved: window.__qaInitialScroll.some(y => y > 1) })), { y: 0, moved: false }, 'initial device/scene/overview loading must retain the page origin');
  if (!baseline) {
    assert.equal(await page.locator('#mine-button').getAttribute('aria-label'),'打开我的');
    await page.locator('#mine-button').click();assert.match(await page.locator('#toast').innerText(),/不支持我的抽屉/);
    await page.evaluate(()=>{window.__AQARA_NATIVE_CONTEXT__.capabilities.push('openNavigationDrawer');window.__qaDrawerHold=true;window.__qaBeforeDrawerHTTP=window.__qaRequests.length;document.querySelector('#mine-button').click();document.querySelector('#mine-button').click();});
    assert.equal(await page.evaluate(()=>window.__qaDrawerRequests.length),1,'rapid repeats must invoke the host only once');
    assert.equal(await page.locator('#mine-button').getAttribute('aria-busy'),'true');
    await page.evaluate(()=>{const request=window.__qaDrawerRequests[0];window.H5Invoke(request.data.onSuccess,{code:0,data:{accepted:true}});window.__qaDrawerHold=false;});
    await page.waitForFunction(()=>!document.querySelector('#mine-button').disabled);
    await page.evaluate(()=>{window.__qaDrawerFailure=true;});await page.locator('#mine-button').click();
    await page.waitForFunction(()=>!document.querySelector('#mine-button').disabled);
    assert.match(await page.locator('#toast').innerText(),/打开我的失败/);
    assert.equal(await page.evaluate(()=>window.__qaRequests.length),await page.evaluate(()=>window.__qaBeforeDrawerHTTP),'drawer actions must issue zero Studio HTTP requests');
    assert.equal(await page.evaluate(()=>scrollY),0);
    await page.evaluate(()=>{window.__qaDrawerFailure=false;document.querySelector('#toast').hidden=true;});
  }
  if (!baseline) {
    const ai = page.locator('#ai-assistant-button');
    await ai.waitFor({state:'visible'});
    assert.equal(await ai.isVisible(), true);
    await page.evaluate(() => window.H5Invoke('UserAIAgentStatusUpdate', {code:0,data:{status:false}}));
    assert.equal(await ai.isVisible(), false, 'native disable push hides the AI entry');
    await page.evaluate(() => window.H5Invoke('UserAIAgentStatusUpdate', {code:0,data:{status:true}}));
    await ai.waitFor({state:'visible'});
    const placement = await page.evaluate(() => ({ ai:document.querySelector('#ai-assistant-section').getBoundingClientRect().top, overview:document.querySelector('#dashboard-content').getBoundingClientRect().bottom }));
    assert.ok(placement.ai >= placement.overview && placement.ai - placement.overview <= 20, 'AI entry sits directly below overview');
    await ai.click(); assert.match(await page.locator('#toast').innerText(), /不支持 AI 助手/);
    await page.evaluate(() => {window.__AQARA_NATIVE_CONTEXT__.capabilities.push('openAIAssistant');window.__qaAIHold=true;window.__qaBeforeAIHTTP=window.__qaRequests.length;document.querySelector('#ai-assistant-button').click();document.querySelector('#ai-assistant-button').click();});
    assert.equal(await page.evaluate(()=>window.__qaAIRequests.length),1);
    assert.equal(await ai.getAttribute('aria-busy'),'true');
    await page.evaluate(()=>{const request=window.__qaAIRequests[0];window.H5Invoke(request.data.onSuccess,{code:0,data:{accepted:true}});window.__qaAIHold=false;});
    await page.waitForFunction(()=>!document.querySelector('#ai-assistant-button').disabled);
    await page.evaluate(()=>{window.__qaAIFailure=true;}); await ai.click();
    await page.waitForFunction(()=>!document.querySelector('#ai-assistant-button').disabled);
    assert.match(await page.locator('#toast').innerText(),/打开 AI 助手失败/);
    assert.equal(await page.evaluate(()=>window.__qaRequests.length),await page.evaluate(()=>window.__qaBeforeAIHTTP),'AI navigation must issue zero HTTP requests');
    assert.equal(await page.evaluate(()=>scrollY),0);
    await page.evaluate(()=>{window.__qaAIFailure=false;document.querySelector('#toast').hidden=true;});
  }
  const initial = await page.evaluate(() => {
    const off = document.querySelector('.device-card.is-off:not(.is-offline)'); const online = document.querySelector('.device-card.is-on:not(.is-offline)'); const offline = document.querySelector('.device-card.is-offline'); const offlineChild = offline?.firstElementChild;
    const ceiling = [...document.querySelectorAll('.device-card')].find((card) => card.querySelector('.device-meta strong')?.textContent === '客厅顶灯');
    const pendant = [...document.querySelectorAll('.device-card')].find((card) => card.querySelector('.device-meta strong')?.textContent === '客厅吊灯');
    const camera = [...document.querySelectorAll('.device-card')].find((card) => card.querySelector('.device-meta strong')?.textContent === 'Smart Camera G350');
    const hub = [...document.querySelectorAll('.device-card')].find((card) => card.querySelector('.device-meta strong')?.textContent === 'Aqara 网关 M2');
    const compactSensor = [...document.querySelectorAll('.device-card')].find((card) => card.querySelector('.device-meta strong')?.textContent === '设备 10');
    const curtain = [...document.querySelectorAll('.device-card')].find((card) => card.querySelector('.device-meta strong')?.textContent === '智能窗帘电机 C100');
    const ceilingTarget = ceiling?.querySelector('.device-toggle'); const ceilingRect = ceiling?.getBoundingClientRect(); const targetRect = ceilingTarget?.getBoundingClientRect();
    const curtainRect = curtain?.getBoundingClientRect(); const curtainRangeRect = curtain?.querySelector('.device-direct-controls input[type="range"]')?.getBoundingClientRect();
    const title = document.querySelector('#dashboard-title'); const titleStyle = getComputedStyle(title);
    const compactRanges = [...document.querySelectorAll('.aqara-size-xl.category-light .range-control')].map(wrap => { const input=wrap.querySelector('input'),card=wrap.closest('.device-card'),r=input.getBoundingClientRect(),c=card.getBoundingClientRect(),style=getComputedStyle(input); return {horizontal:style.writingMode==='horizontal-tb',visible:style.opacity==='1',height:r.height,fits:r.left>=c.left&&r.right<=c.right,heroHidden:getComputedStyle(card.querySelector('.aqara-light-hero')).display==='none'}; });
    const cameraButton = camera?.querySelector('.camera-stream-button'); const cameraStatus = camera?.querySelector('.camera-stream-status');
    return { cyberpunk: document.documentElement.dataset.cyberpunk === 'true', overview: { temperature: document.querySelector('#temperature-value').textContent, humidity: document.querySelector('#humidity-value').textContent, presence: document.querySelector('#presence-value').textContent, coverage: document.querySelector('#overview-coverage').textContent }, transport: { platform: window.__AQARA_NATIVE_CONTEXT__?.platform, prompt: typeof window.prompt === 'function', webkit: Boolean(window.webkit?.messageHandlers?.nativeBridge) }, nodes: document.querySelectorAll('*').length, controls: document.querySelectorAll('[data-control-id]').length, directControls: document.querySelectorAll('.device-direct-controls [data-control-id]').length, xlLightHeroes: document.querySelectorAll('.aqara-size-xl.category-light .aqara-light-hero').length, xlVerticalRanges: document.querySelectorAll('.aqara-size-xl.category-light .device-direct-controls input[type="range"]').length, compactRanges, visibleCapabilityFooters: document.querySelectorAll('.capability-summary').length, header: { fontSize: titleStyle.fontSize, whiteSpace: titleStyle.whiteSpace, lines: Math.round(title.getBoundingClientRect().height / parseFloat(titleStyle.lineHeight)) }, ceilingCard: ceiling ? { size: ceiling.dataset.cardSize, source: ceiling.dataset.designSource, targetCoversCard: Math.abs(ceilingRect.width - targetRect.width) <= 1 && Math.abs(ceilingRect.height - targetRect.height) <= 1, powerIconDisplay: getComputedStyle(ceilingTarget.querySelector('svg')).display, detailAction: ceiling.dataset.detailAction || '' } : null, pendantCard: pendant ? { size: pendant.dataset.cardSize, source: pendant.dataset.designSource } : null, cameraCard: camera ? { size: camera.dataset.cardSize, offline: camera.classList.contains('is-offline'), visibleJson: /\{\s*"|\[\s*\{/.test(camera.textContent), metrics: camera.querySelectorAll('.device-metrics dd').length, detailAction: camera.dataset.detailAction, streamButton: Boolean(cameraButton), streamDisabled: cameraButton?.disabled, streamAvailability: camera.querySelector('.camera-stream')?.dataset.streamAvailability, streamButtonText: cameraButton?.textContent, streamStatus: cameraStatus?.textContent, streamButtonBackground: getComputedStyle(cameraButton).backgroundColor } : null, compactSensorCard: compactSensor ? { size: compactSensor.dataset.cardSize, metrics: compactSensor.querySelectorAll('.device-metrics dd').length, detail: compactSensor.querySelector('.device-meta > span')?.textContent || '', detailAction: compactSensor.dataset.detailAction || '' } : null, hubCard: hub ? { category: hub.classList.contains('category-hub') ? 'hub' : null, state: hub.classList.contains('is-off') ? 'off' : null, surface: getComputedStyle(hub).backgroundColor, contentOpacity: getComputedStyle(hub.firstElementChild).opacity, visibleMetadata: /产品名称|Matter\s*角色|M300/.test(hub.textContent), metrics: hub.querySelectorAll('.device-metrics dd').length } : null, curtainCard: curtain ? { size: curtain.dataset.cardSize, headerRanges: curtain.querySelectorAll('.device-row input[type="range"]').length, directRanges: curtain.querySelectorAll('.device-direct-controls input[type="range"]').length, rangeFits: curtainRangeRect.left >= curtainRect.left && curtainRangeRect.right <= curtainRect.right } : null, colorSurfaces: { canvas: getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(), online: online ? getComputedStyle(online).backgroundColor : null, off: off ? getComputedStyle(off).backgroundColor : null, offline: offline ? getComputedStyle(offline).backgroundColor : null }, offCards: document.querySelectorAll('.device-card.is-off:not(.is-offline)').length, offlineCards: document.querySelectorAll('.device-card.is-offline').length, offCardOpacity: off ? getComputedStyle(off).opacity : null, offlineCardOpacity: offline ? getComputedStyle(offline).opacity : null, offlineContentOpacity: offlineChild ? getComputedStyle(offlineChild).opacity : null, hiddenChildren: document.querySelector('.capability-body').childElementCount, sizes: [...document.querySelectorAll('.device-card')].map((card) => card.dataset.cardSize), readyMs: performance.now(), requests: window.__qaRequests.length, cacheCharacters: Object.keys(sessionStorage).reduce((n, key) => n + sessionStorage.getItem(key).length, 0) };
  });
  if (!baseline) {
    const cameraLayout = await page.evaluate(() => {
      const card = document.querySelector('.category-camera'); const viewport = card.querySelector('.camera-stream-viewport');
      const media = card.querySelector('video'); const controls = card.querySelector('.camera-stream-controls');
      const box = viewport.getBoundingClientRect(); const cardBox = card.getBoundingClientRect(); const controlsBox = controls.getBoundingClientRect();
      const overlap = [...document.querySelectorAll('.device-card')].some((other) => { if (other === card) return false; const rect = other.getBoundingClientRect(); return rect.left < cardBox.right - 1 && rect.right > cardBox.left + 1 && rect.top < cardBox.bottom - 1 && rect.bottom > cardBox.top + 1; });
      return { ratio: box.width / box.height, fit: getComputedStyle(media).objectFit, centered: getComputedStyle(media).objectPosition, controlsContained: controlsBox.bottom <= cardBox.bottom && controlsBox.top >= box.bottom, overlap };
    });
    assert.ok(Math.abs(cameraLayout.ratio - 16 / 9) < 0.001, 'camera viewport must remain responsive 16:9');
    assert.equal(cameraLayout.fit, 'contain'); assert.equal(cameraLayout.centered, '50% 50%');
    assert.ok(cameraLayout.controlsContained && !cameraLayout.overlap, `camera layout must contain controls without overlapping other cards: ${JSON.stringify(cameraLayout)}`);
  }
  if (!baseline) {
    const spaceFilters = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('.filter-chip')]; const before = window.__qaRequests.length;
      const whole = chips.find(button => button.dataset.spaceId === '*');
      const duplicate = chips.filter(button => ['space-0', 'space-1'].includes(button.dataset.spaceId));
      const spaces = [...document.querySelectorAll('.device-card')].map(card => card.dataset.deviceId);
      document.querySelector('[data-space-id="empty-space"]').click();
      const partialEmpty = document.querySelector('#device-grid').textContent;
      document.querySelector('[data-space-id="space-0"]').click();
      const selectedIds = [...document.querySelectorAll('.device-card')].map(card => card.dataset.deviceId);
      const selectedChip = document.querySelector('[data-space-id="space-0"]');
      window.LifeI18n.setLocale('en');
      const english = { whole: document.querySelector('[data-space-id="*"]').textContent, smart: document.querySelector('#tab-automation span')?.textContent, title: document.querySelector('#dashboard-title').textContent, selected: document.querySelector('[data-space-id="space-0"]').getAttribute('aria-pressed'), sameName: document.querySelector('[data-space-id="space-0"]').textContent };
      window.LifeI18n.setLocale('zh-TW'); const traditional = document.querySelector('#tab-automation span')?.textContent;
      window.LifeI18n.setLocale('zh-CN'); document.querySelector('[data-space-id="*"]').click();
      return { whole: whole.textContent, duplicate: duplicate.map(button=>button.textContent), partialEmpty, selectedIds, english, traditional, requests: window.__qaRequests.length - before, retainedFilter: selectedChip === document.querySelector('[data-space-id="space-0"]'), restoredIds: [...document.querySelectorAll('.device-card')].map(card=>card.dataset.deviceId), spaces };
    });
    assert.equal(spaceFilters.whole, '真实家庭名称');
    assert.equal(await page.locator('.filter-chip[data-space-id="studio-root"]').count(), 0, 'root space must appear once as the all-spaces entry'); assert.deepEqual(spaceFilters.duplicate, ['同名空间','同名空间']);
    assert.match(spaceFilters.partialEmpty, /加载更多/);
    assert.deepEqual(spaceFilters.selectedIds, ['fixture-0','fixture-5','fixture-10']);
    const hasSmartTab=await page.evaluate(()=>window.__LIFE_STUDIO_DASHBOARD_CONFIG__.tabs.includes('automation'));
    assert.deepEqual(spaceFilters.english, {whole:'真实家庭名称',smart:hasSmartTab?'Smart':undefined,title:'Current Studio',selected:'true',sameName:'同名空间'});
    assert.equal(spaceFilters.traditional,hasSmartTab?'智能':undefined); assert.equal(spaceFilters.requests,0); assert.ok(spaceFilters.retainedFilter);
    assert.deepEqual(spaceFilters.restoredIds,spaceFilters.spaces);
  }
  const themeSkin = await page.evaluate(() => window.__LIFE_STUDIO_DASHBOARD_CONFIG__.style);
  const visualContract = await page.evaluate(() => { const root = getComputedStyle(document.documentElement); const grid = getComputedStyle(document.querySelector('.device-grid')); const card = (size) => document.querySelector(`.aqara-size-${size}`); const measured = (size) => { const element = card(size); const style = element && getComputedStyle(element); return element ? { width: element.offsetWidth, radius: style.borderRadius, padding: style.padding } : null; }; return { gridColumns: grid.gridTemplateColumns.split(' ').length, gridGap: grid.gap, cards: { s: measured('s'), m: measured('m'), l: measured('l'), xl: measured('xl') }, icon: document.querySelector('.aqara-size-m .device-icon')?.offsetWidth, action: root.getPropertyValue('--aqara-action').trim(), cardPrimary: root.getPropertyValue('--aqara-card-primary').trim(), cardAbnormal: root.getPropertyValue('--aqara-card-abnormal').trim() }; });
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  assert.deepEqual(initial.transport, fixturePlatform === 'android' ? { platform: 'android', prompt: true, webkit: false } : { platform: 'ios', prompt: true, webkit: true }, 'browser fixture must exercise the selected native transport');
  if (!baseline) assert.equal(initial.hiddenChildren, 0, 'closed capability panels must not create controls/readings');
  if (!baseline) assert.ok(firstPaint.cards === 12 && firstPaint.requests <= 5, `first paint must expose one visible page before the background overview finishes: ${JSON.stringify(firstPaint)}`);
  if (!baseline) { assert.deepEqual({ temperature: initial.overview.temperature, humidity: initial.overview.humidity, presence: initial.overview.presence }, { temperature: '25.2°C', humidity: '61%', presence: '1' }, 'overview must use strict real environment readings and exclude the camera body temperature'); assert.match(initial.overview.coverage, /100/, 'overview coverage must disclose the complete 100-device index'); }
  if (!baseline) assert.ok(initial.directControls >= 1, 'curtain controls remain directly available');
  if (!baseline) assert.ok(initial.sizes.includes('XL') && initial.sizes.includes('L') && initial.sizes.includes('M') && initial.sizes.includes('S'), 'production-shaped devices must exercise S/M/L/XL occupancy');
  if (!baseline) assert.ok(initial.xlLightHeroes === 0 && initial.xlVerticalRanges === 0, 'Home lights must not retain inline XL controls');
  if (!baseline) assert.equal(initial.compactRanges.length, 0, 'light ranges mount only after explicit adjustment');
  if (!baseline) assert.deepEqual(initial.ceilingCard, { size: 'M', source: 'aqara-confirmed-light', targetCoversCard: false, powerIconDisplay: 'block', detailAction: '' }, 'power-only ceiling/top light must remain an S whole-card switch and must not become a details trigger');
  if (!baseline) assert.deepEqual(initial.pendantCard, { size: 'M', source: 'aqara-confirmed-light' }, 'power-only pendant/chandelier light must use an M card');
  if (!baseline) assert.deepEqual(initial.header, { fontSize: '32px', whiteSpace: 'nowrap', lines: 1 }, 'Aqara App header must keep a shared32px single-line title');
  if (!baseline) assert.deepEqual(initial.cameraCard, { size: 'XL', offline: true, visibleJson: false, metrics: 0, detailAction: 'true', streamButton: true, streamDisabled: true, streamAvailability: 'offline', streamButtonText: '离线', streamStatus: '离线', streamButtonBackground: 'rgba(0, 0, 0, 0)' }, 'an offline definition-confirmed camera keeps stable XL geometry and uses a neutral disabled offline action instead of a misleading live-start action');
  if (!baseline) assert.equal(initial.visibleCapabilityFooters, 0, 'cards must not render the obsolete visible capability footer');
  if (!baseline) assert.equal(initial.compactSensorCard.size, 'S');
  if (!baseline) assert.equal(initial.compactSensorCard.metrics, 0, 'compact non-light S cards must not render a separate metric block');
  if (!baseline) assert.match(initial.compactSensorCard.detail, /25\.2/, 'a read-only S card should keep its useful scalar value in the combined status line');
  if (!baseline) assert.equal(initial.compactSensorCard.detailAction, '', 'a scalar already summarized in an S-card status line must not create an empty details action');
  if (!baseline) assert.deepEqual(initial.curtainCard, { size: 'L', headerRanges: 0, directRanges: 1, rangeFits: true }, 'curtain L cards must place one full-width range in the functional slot');
  if (!baseline) assert.ok(initial.offCards > 0 && initial.offlineCards > 0, 'fixture must exercise distinct off and offline card states');
  if (!baseline) assert.deepEqual({ off: initial.offCardOpacity, offlineCard: initial.offlineCardOpacity, offlineContent: initial.offlineContentOpacity }, { off: '1', offlineCard: '1', offlineContent: '0.4' }, 'off remains fully legible while only offline content uses 40% opacity');
  if (!baseline && !initial.cyberpunk && themeSkin === 'aqara') assert.deepEqual(initial.colorSurfaces, fixtureTheme === 'dark' ? { canvas: '#15161a', online: 'rgb(70, 68, 92)', off: 'rgb(44, 43, 56)', offline: 'rgb(44, 43, 56)' } : { canvas: '#f3f4f8', online: 'rgb(255, 255, 255)', off: 'rgba(255, 255, 255, 0.698)', offline: 'rgba(255, 255, 255, 0.698)' }, 'canvas, online, off and offline surfaces must preserve the reviewed light/dark semantic hierarchy');
  if (!baseline && (initial.cyberpunk || themeSkin !== 'aqara')) { assert.equal(initial.colorSurfaces.off, initial.colorSurfaces.offline, 'custom-theme offline and off surfaces must share the reviewed inactive semantic surface'); assert.notEqual(initial.colorSurfaces.online, initial.colorSurfaces.off, 'custom-theme online and inactive surfaces must remain visibly distinct'); }
  if (!baseline) assert.deepEqual(initial.hubCard, { category: 'hub', state: 'off', surface: initial.colorSurfaces.off, contentOpacity: '1', visibleMetadata: false, metrics: 1 }, 'a Boolean-off gateway must use the cross-category inactive surface, keep one useful reading, and hide root-node product/Matter metadata');
  if (!baseline && !initial.cyberpunk && themeSkin === 'aqara' && viewportWidth === 390) assert.deepEqual(visualContract, { gridColumns: 4, gridGap: '10px', cards: { s: { width: 174, radius: '24px', padding: '14px' }, m: { width: 174, radius: '24px', padding: '14px' }, l: { width: 358, radius: '24px', padding: '14px' }, xl: { width: 358, radius: '24px', padding: '14px' } }, icon: 40, action: fixtureTheme === 'dark' ? '#4570ff' : '#2e51ff', cardPrimary: fixtureTheme === 'dark' ? '#46445c' : '#fff', cardAbnormal: fixtureTheme === 'dark' ? '#fff' : '#ffffffb2' }, '390px profile geometry and confirmed semantic tokens must include the full-width responsive H5 XL adaptation');
  if (!baseline && (initial.cyberpunk || themeSkin !== 'aqara') && viewportWidth === 390) assert.deepEqual({ gridColumns: visualContract.gridColumns, gridGap: visualContract.gridGap, cards: visualContract.cards, icon: visualContract.icon }, { gridColumns: 4, gridGap: '10px', cards: { s: { width: 174, radius: '24px', padding: '14px' }, m: { width: 174, radius: '24px', padding: '14px' }, l: { width: 358, radius: '24px', padding: '14px' }, xl: { width: 358, radius: '24px', padding: '14px' } }, icon: 40 }, 'custom themes may change semantic colors while preserving the full-width XL geometry');
  await page.evaluate(() => { window.__firstCard = document.querySelector('.device-card'); window.__beforeAppendRequests = window.__qaRequests.length; document.querySelector('#load-more-button').click(); });
  await page.waitForFunction(() => document.querySelectorAll('.device-card').length === 24);
  const appended = await page.evaluate(() => ({ retained: window.__firstCard === document.querySelector('.device-card'), nodes: document.querySelectorAll('*').length, requests: window.__qaRequests.length, requestDelta: window.__qaRequests.length - window.__beforeAppendRequests, routes: window.__qaRequests.slice(window.__beforeAppendRequests).map((request) => request.url) }));
  if (!baseline) assert.equal(appended.retained, true, 'pagination must retain existing card nodes');
  assert.equal(appended.requestDelta, 0, 'one explicit load-more click must reuse the completed overview index');
  assert.deepEqual(appended.routes, []);
  const deviceDetailsLayout = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll('.device-card')];
    const card = cards.find((item) => item.querySelector('.device-meta strong')?.textContent === 'Smart Camera G350');
    const beforeRect = card.getBoundingClientRect(); const beforeRequests = window.__qaRequests.length; const beforeScroll = scrollY;
    const neighbor = cards.find((item) => item !== card && Math.abs(item.getBoundingClientRect().top - beforeRect.top) <= 1);
    const neighborRect = neighbor?.getBoundingClientRect();
    card.click(); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const openRect = card.getBoundingClientRect(); const panel = document.querySelector('.capability-sheet-panel'); const body = document.querySelector('.capability-sheet-content .capability-body');
    let bubbled = false; const listener = () => { bubbled = true; }; document.addEventListener('touchmove', listener, { once: true });
    const content = document.querySelector('.capability-sheet-content'); content.dispatchEvent(new Event('touchmove', { bubbles: true, cancelable: true })); content.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 }));
    const open = { open: document.querySelector('.capability-sheet-layer').classList.contains('is-open'), dialog: panel.getAttribute('role'), modal: panel.getAttribute('aria-modal'), bodyInSheet: Boolean(body), cardStable: Math.abs(openRect.width - beforeRect.width) <= 1 && Math.abs(openRect.height - beforeRect.height) <= 1, neighborStable: !neighborRect || (Math.abs(neighbor.getBoundingClientRect().width - neighborRect.width) <= 1 && Math.abs(neighbor.getBoundingClientRect().height - neighborRect.height) <= 1), scrollLocked: document.body.style.position === 'fixed', gestureContainment: { bubbled, pageTransform: document.querySelector('#app').style.transform } };
    document.querySelector('.capability-sheet-backdrop').click(); await new Promise((resolve) => setTimeout(resolve, 300));
    const closedRect = card.getBoundingClientRect();
    return { ...open, closed: document.querySelector('.capability-sheet-layer').hidden, cardStableAfterClose: Math.abs(closedRect.width - beforeRect.width) <= 1 && Math.abs(closedRect.height - beforeRect.height) <= 1, scrollRestored: Math.abs(scrollY - beforeScroll) <= 1, requests: window.__qaRequests.length - beforeRequests };
  });
  if (!baseline) assert.deepEqual(deviceDetailsLayout, { open: true, dialog: 'dialog', modal: 'true', bodyInSheet: true, cardStable: true, neighborStable: true, scrollLocked: true, gestureContainment: { bubbled: false, pageTransform: '' }, closed: true, cardStableAfterClose: true, scrollRestored: true, requests: 0 }, 'device details must use a zero-request modal sheet without changing card or neighbor geometry');
  const gestureContainment = deviceDetailsLayout.gestureContainment;
  const controlIsolation = await page.evaluate(() => {
    const input = document.querySelector('.device-direct-controls input[type="range"]'); const before = window.__qaRequests.length;
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return { sheetOpen: Boolean(document.querySelector('.capability-sheet-layer.is-open')), requests: window.__qaRequests.length - before };
  });
  if (!baseline) assert.deepEqual(controlIsolation, { sheetOpen: false, requests: 0 }, 'a direct card control must not open device details or issue an extra request');
  if (expandedScreenshotPath) {
    await page.evaluate(() => [...document.querySelectorAll('.device-card')].find((item) => item.querySelector('.device-meta strong')?.textContent === 'Smart Camera G350')?.click());
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
    await page.screenshot({ path: expandedScreenshotPath, fullPage: true });
    await page.locator('.capability-sheet-close').click();
  }
  await page.locator('.device-card.has-device-detail-action').first().click({ position: { x: 8, y: 8 } });
  assert.ok(await page.locator('.capability-control-row').first().count(), 'first open must reveal the real control');
  await page.evaluate(() => { window.__panelControl = document.querySelector('.capability-sheet-content .capability-control-row [data-control-id]'); document.querySelector('.capability-sheet-close').click(); });
  await page.locator('.device-card.has-device-detail-action').first().click({ position: { x: 8, y: 8 } });
  assert.equal(await page.evaluate(() => window.__panelControl === document.querySelector('.capability-control-row [data-control-id]')), true, 'reopening must reuse controls');
  await page.locator('.capability-sheet-close').click();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  const collapsedGrid = await page.evaluate(() => { const grid = document.querySelector('#device-grid'); const rect = grid.getBoundingClientRect(); const children = [...grid.children]; const contentHeight = Math.max(0, ...children.map((child) => child.getBoundingClientRect().bottom - rect.top)); return { blank: Math.round(rect.height - contentHeight), minHeight: getComputedStyle(grid).minHeight }; });
  if (!baseline) assert.deepEqual(collapsedGrid, { blank: 0, minHeight: '0px' }, 'closing device details must leave the grid at actual card content height');
  const cycles = []; const categoryLayouts = []; const interactionRequestCount = await page.evaluate(() => window.__qaRequests.length);
  for (let n = 0; n < 8; n += 1) {
    await page.locator('.filter-chip[data-space-id="space-0"]').scrollIntoViewIfNeeded();
    for (const category of ['space-0', '*']) {
      const anchorDelta = await page.evaluate(async (category) => {
        const filters = document.querySelector('#device-filters'); const top = filters.getBoundingClientRect().top; const y = scrollY;
        document.querySelector(`.filter-chip[data-space-id="${category}"]`).click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const grid = document.querySelector('#device-grid'); const gridRect = grid.getBoundingClientRect(); const children = [...grid.children]; const lastBottom = Math.max(gridRect.top, ...children.map((child) => child.getBoundingClientRect().bottom)); const contentHeight = lastBottom - gridRect.top; const loadMore = document.querySelector('#load-more-button'); const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
        return { category, top: Math.abs(filters.getBoundingClientRect().top - top), scroll: Math.abs(scrollY - y), clamped: Math.abs(scrollY - maxScroll) <= 1, blank: Math.round(gridRect.height - contentHeight), minHeight: getComputedStyle(grid).minHeight, loadMoreGap: loadMore.hidden ? null : Math.round(loadMore.getBoundingClientRect().top - lastBottom) };
      }, category);
      categoryLayouts.push(anchorDelta);
      assert.ok((anchorDelta.top <= 1 && anchorDelta.scroll <= 1) || anchorDelta.clamped, `category anchor must remain stable unless the shorter document naturally clamps at its end: ${JSON.stringify(anchorDelta)}`);
      if (!baseline) assert.ok(anchorDelta.blank >= 0 && anchorDelta.blank <= 10, `category grid may retain at most one ordinary Aqara row gap, never a historical spacer: ${JSON.stringify(anchorDelta)}`);
      if (!baseline) assert.equal(anchorDelta.minHeight, '0px', `temporary category min-height must be released: ${JSON.stringify(anchorDelta)}`);
      if (!baseline && anchorDelta.loadMoreGap !== null) assert.ok(anchorDelta.loadMoreGap >= 0 && anchorDelta.loadMoreGap <= 24, `load-more must follow the actual last card within its margin plus at most one ordinary row gap: ${JSON.stringify(anchorDelta)}`);
    }
    cycles.push(await page.evaluate(() => ({ nodes: document.querySelectorAll('*').length, count: document.querySelectorAll('.device-card').length })));
  }
  if (!baseline) assert.equal(new Set(cycles.map((item) => item.nodes)).size, 1, 'repeated device-detail/category cycles must not grow mounted DOM');
  assert.equal(await page.evaluate(() => window.__qaRequests.length), interactionRequestCount, 'device-detail/category actions must not issue requests');
  await page.locator('.device-direct-controls input[type="range"]').first().scrollIntoViewIfNeeded();
  const dragPreview = await page.evaluate(async () => {
    const input = document.querySelector('.device-direct-controls input[type="range"]'); const before = window.__qaRequests.length;
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); input.value = '60'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve)); return { before, after: window.__qaRequests.length };
  });
  assert.equal(dragPreview.after, dragPreview.before, 'direct range preview and early change must issue zero requests');
  await page.evaluate(() => document.querySelector('.device-direct-controls input[type="range"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  await page.waitForFunction((before) => window.__qaRequests.slice(before).some((r) => r.url.endsWith('/trait/read')), dragPreview.before);
  assert.deepEqual(await page.evaluate((before) => window.__qaRequests.slice(before).map((r) => r.url), dragPreview.before), ['/open/api/v1/devices/trait/execute', '/open/api/v1/devices/trait/read']);
  await page.locator('.device-toggle').first().scrollIntoViewIfNeeded();
  await page.evaluate(() => { window.__beforeActionY = scrollY; window.__actionCard = document.querySelector('.device-card'); window.__beforeActionRequests = window.__qaRequests.length; });
  await page.evaluate(() => document.querySelector('.device-toggle').click());
  await page.waitForFunction(() => window.__qaRequests.slice(window.__beforeActionRequests).some((r) => r.url.endsWith('/trait/read')));
  await page.waitForFunction(() => !document.querySelector('.device-toggle').disabled);
  const action = await page.evaluate(() => ({ retained: window.__actionCard === document.querySelector('.device-card'), scrollDelta: Math.abs(scrollY - window.__beforeActionY), routes: window.__qaRequests.slice(window.__beforeActionRequests).map((r) => r.url) }));
  assert.deepEqual(action.routes, ['/open/api/v1/devices/trait/execute', '/open/api/v1/devices/trait/read']);
  assert.equal(action.retained, true); assert.ok(action.scrollDelta <= 1, `device action must not move the viewport: ${JSON.stringify(action)}`);
  await page.evaluate(() => {
    window.__ceilingActionCard = [...document.querySelectorAll('.device-card')].find((card) => card.querySelector('.device-meta strong')?.textContent === '客厅顶灯');
    window.__beforeCeilingActionY = scrollY; window.__beforeCeilingActionRequests = window.__qaRequests.length;
    window.__ceilingActionCard.querySelector('.device-toggle').click();
  });
  await page.waitForFunction(() => window.__qaRequests.slice(window.__beforeCeilingActionRequests).some((r) => r.url.endsWith('/trait/read')));
  await page.waitForFunction(() => !window.__ceilingActionCard.querySelector('.device-toggle').disabled);
  const ceilingAction = await page.evaluate(() => ({ retained: window.__ceilingActionCard === [...document.querySelectorAll('.device-card')].find((card) => card.querySelector('.device-meta strong')?.textContent === '客厅顶灯'), size: window.__ceilingActionCard.dataset.cardSize, scrollDelta: Math.abs(scrollY - window.__beforeCeilingActionY), routes: window.__qaRequests.slice(window.__beforeCeilingActionRequests).map((r) => r.url) }));
  assert.deepEqual(ceilingAction.routes, ['/open/api/v1/devices/trait/execute', '/open/api/v1/devices/trait/read']);
  assert.equal(ceilingAction.retained, true); assert.equal(ceilingAction.size, 'M'); assert.ok(ceilingAction.scrollDelta <= 1, `whole-card ceiling-light action must retain its S card and viewport anchor: ${JSON.stringify(ceilingAction)}`);
  await page.evaluate(() => { const toggle = document.querySelector('.device-toggle'); window.__beforeFailedValue = toggle.getAttribute('aria-checked'); window.__beforeFailedRequests = window.__qaRequests.length; window.__failedCard = toggle.closest('.device-card'); window.__qaFailNextWrite = true; toggle.click(); });
  await page.waitForFunction(() => window.__qaRequests.slice(window.__beforeFailedRequests).some((request) => request.url.endsWith('/trait/read')) && !document.querySelector('.device-toggle').disabled && document.querySelector('.device-action-status')?.textContent);
  const failedAction = await page.evaluate(() => ({ retained: window.__failedCard === document.querySelector('.device-card'), value: document.querySelector('.device-toggle').getAttribute('aria-checked'), expected: window.__beforeFailedValue, size: window.__failedCard.dataset.cardSize, status: window.__failedCard.querySelector('.device-action-status').textContent, routes: window.__qaRequests.slice(window.__beforeFailedRequests).map((request) => request.url) }));
  assert.deepEqual(failedAction.routes, ['/open/api/v1/devices/trait/execute', '/open/api/v1/devices/trait/read']);
  assert.equal(failedAction.retained, true); assert.equal(failedAction.value, failedAction.expected, 'failed write must reconcile the exact control to the targeted readback'); assert.ok(failedAction.status, 'failed write must expose a local accessible card status');
  if (!baseline) {
    await page.evaluate(() => { window.__qaRefreshDelay = 180; scrollTo(0, 0); window.StudioHomeRefresh.refresh(); scrollTo(0, 250); window.__qaRefreshFilterTop = document.querySelector('#device-filters').getBoundingClientRect().top; });
    await page.waitForFunction(() => !window.StudioHomeRefresh.busy());
    await page.waitForTimeout(80);
    const refreshPosition = await page.evaluate(() => ({ y: scrollY, filterDelta: Math.abs(document.querySelector('#device-filters').getBoundingClientRect().top - window.__qaRefreshFilterTop) }));
    assert.ok(refreshPosition.y > 1 && refreshPosition.filterDelta <= 1, 'refresh must retain the current visible filter after scrolling during the request: ' + JSON.stringify(refreshPosition));
    await page.evaluate(() => { window.__qaRefreshDelay = 0; scrollTo(0, 0); });
    await page.reload();
    await page.waitForFunction(() => /全部\s*100|All\s*100/.test(document.querySelector('#overview-coverage')?.textContent || ''));
    assert.deepEqual(await page.evaluate(() => ({ y: scrollY, moved: window.__qaInitialScroll.some(y => y > 1) })), { y: 0, moved: false }, 'cached startup and refresh must retain the page origin');
  }
  const diagnostics = await page.evaluate(() => ({ longTasks: window.__qaLongTasks, overflow: document.documentElement.scrollWidth - innerWidth, heap: performance.memory?.usedJSHeapSize ?? null }));
  assert.equal(diagnostics.overflow, 0); assert.deepEqual(errors, []);
  const staticBytes = ['index.html', 'config.js', 'life-bridge.js', 'studio-runtime.js', 'dashboard.js', 'i18n.js', 'styles.css'].reduce((n, file) => n + statSync(join(packageDir, file)).size, 0);
  console.log(JSON.stringify({ mode: baseline ? 'baseline' : 'gate', platform: fixturePlatform, themeSkin, theme: fixtureTheme, viewport: { width: viewportWidth, height: viewportHeight }, staticBytes, firstPaint, visualContract, initial, appended, deviceDetailsLayout, gestureContainment, controlIsolation, collapsedGrid, categoryLayouts, cycles, action, ceilingAction, failedAction, diagnostics }, null, 2));
  // No fake timing/heap SLA: these values are browser/device dependent. The gate
  // enforces allocation/request/identity invariants and reports real timings.
} finally { await browser.close(); }
