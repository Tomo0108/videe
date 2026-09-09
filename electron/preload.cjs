const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('videe', {
  platform: process.platform,
  importFiles: files => ipcRenderer.invoke('import-paths', files.map(file => webUtils.getPathForFile(file)).filter(Boolean)),
  pickVideos: () => ipcRenderer.invoke('pick-videos'),
  getSource: id => ipcRenderer.invoke('get-source', id),
  forgetVideo: id => ipcRenderer.invoke('forget-video', id),
  convertVideo: id => ipcRenderer.invoke('convert-video', id),
  cancelConversion: () => ipcRenderer.invoke('cancel-conversion'),
  onConversionProgress: callback => { const handler = (_event, value) => callback(value); ipcRenderer.on('conversion-progress', handler); return () => ipcRenderer.removeListener('conversion-progress', handler); }
});
