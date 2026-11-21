// Most między oknem a procesem głównym. Wersja przeglądarkowa (scripts/build-web.js) podstawia własne window.api.
const { contextBridge, ipcRenderer } = require('electron');
const on = ch => fn => ipcRenderer.on(ch, (e, ...a) => fn(...a));
contextBridge.exposeInMainWorld('api', {
  web: false,
  platform: process.platform,
  openFile: p => ipcRenderer.invoke('file-open', p || null),
  saveFile: (p, text, suggested) => ipcRenderer.invoke('file-save', p || null, text, suggested),
  savePng: (buf, suggested) => ipcRenderer.invoke('png-save', buf, suggested),
  pickUnderlay: p => ipcRenderer.invoke('underlay-pick', p || null),
  odaStatus: () => ipcRenderer.invoke('oda-status'),
  odaPick: () => ipcRenderer.invoke('oda-pick'),
  showInFolder: p => ipcRenderer.invoke('show-in-folder', p),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  setDirty: v => ipcRenderer.send('dirty', v),
  closeNow: () => ipcRenderer.send('close-now'),
  newWindow: () => ipcRenderer.send('new-window'),
  setTheme: dark => ipcRenderer.send('theme', dark),
  onSaveThenClose: on('save-then-close'),
  onFullscreen: on('fullscreen'),
  updateGet: () => ipcRenderer.invoke('update-get'),
  updateCheck: () => ipcRenderer.invoke('update-check'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  onUpdate: on('update-status')
});
