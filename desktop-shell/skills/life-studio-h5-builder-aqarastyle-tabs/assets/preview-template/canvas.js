(function () {
  'use strict';
  const frame = document.querySelector('iframe'), status = document.querySelector('#status');
  if (!['http:','https:'].includes(location.protocol)) { status.textContent = '请通过 HTTP 服务打开 / Serve over HTTP'; return; }
  const instanceId = 'preview-' + Date.now();
  const url = new URL('index.html', location.href); url.searchParams.set('parentOrigin', location.origin); url.searchParams.set('instanceId', instanceId); frame.src = url.href;
  function update() { frame.contentWindow.postMessage({ protocol: 'life-preview', version: '1.0', instanceId, type: 'configure', payload: { scenario: document.querySelector('#scenario').value, theme: document.querySelector('#theme').value, language: document.querySelector('#language').value } }, location.origin); }
  ['scenario','theme','language'].forEach(id => document.getElementById(id).addEventListener('change', update));
  document.querySelector('#network').addEventListener('change', event => { frame.contentWindow.postMessage({ protocol:'life-preview',version:'1.0',instanceId,type:'phone-network',payload:{status:event.target.value} },location.origin); });
  document.querySelector('#reset').addEventListener('click', update);
  document.querySelector('#width').addEventListener('change', event => { frame.style.width = event.target.value + 'px'; });
  addEventListener('message', event => { const message = event.data; if (event.source !== frame.contentWindow || event.origin !== location.origin || !message || message.protocol !== 'life-preview' || message.version !== '1.0' || message.instanceId !== instanceId) return; const value=message.payload||{}; if(message.type==='ready'){status.textContent='预览已就绪 / Ready';const network=document.querySelector('#network').value;if(network==='offline')frame.contentWindow.postMessage({protocol:'life-preview',version:'1.0',instanceId,type:'phone-network',payload:{status:network}},location.origin);} else if(message.type==='error')status.textContent='预览错误: '+value.message; else if(message.type==='operation')status.textContent=value.kind==='device-plugin'?'模拟打开设备: '+value.deviceName:value.kind==='navigation-drawer'?'模拟打开我的 / Me':value.kind==='ai-assistant'?'模拟打开 AI 助手 / AI assistant':'模拟操作已完成'; });
})();
