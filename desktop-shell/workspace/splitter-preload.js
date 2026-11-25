const { contextBridge, ipcRenderer } = require('electron');

// 分隔条桥：拖拽时通知主进程开始/结束「按光标位置实时调整两栏宽度」
contextBridge.exposeInMainWorld('aqaraSplit', {
  start: () => ipcRenderer.send('aqara:split-start'),
  end: () => ipcRenderer.send('aqara:split-end'),
  // 分隔条配色跟随主题
  onTheme: (cb) => { ipcRenderer.on('aqara:theme', (_e, t) => { try { cb(t); } catch (_) {} }); },
});
