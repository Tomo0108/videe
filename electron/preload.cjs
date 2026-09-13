const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('videe', {
  platform: process.platform,
  importFiles: files => ipcRenderer.invoke('import-paths', files.map(file => webUtils.getPathForFile(file)).filter(Boolean)),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  getSource: id => ipcRenderer.invoke('get-source', id),
  forgetVideo: id => ipcRenderer.invoke('forget-video', id),
  convertVideo: id => ipcRenderer.invoke('convert-video', id),
  cutVideo: (id, start, end, duration) => ipcRenderer.invoke('cut-video', id, start, end, duration),
  cancelConversion: () => ipcRenderer.invoke('cancel-conversion'),
  listSubtitles: id => ipcRenderer.invoke('list-subtitles', id),
  extractSubtitle: (id, index) => ipcRenderer.invoke('extract-subtitle', id, index),
  onConversionProgress: callback => { const handler = (_event, value) => callback(value); ipcRenderer.on('conversion-progress', handler); return () => ipcRenderer.removeListener('conversion-progress', handler); }
});
