// dsh 侧的 preload：只暴露一个「打开右侧工作台标签」的桥，
// 供我们注入的左侧入口浮层调用（不触碰 dsh 的 React 逻辑）。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aqaraNav', {
  open: (tab) => ipcRenderer.send('aqara:open-panel-tab', String(tab || '')),
});
