const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qd', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  // Components
  checkComponents: () => ipcRenderer.invoke('check-components'),
  downloadYtDlp: () => ipcRenderer.invoke('download-ytdlp'),
  downloadFFmpeg: () => ipcRenderer.invoke('download-ffmpeg'),
  setFirstRunDone: () => ipcRenderer.invoke('set-first-run-done'),
  onComponentProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('component-progress', handler);
    return () => ipcRenderer.removeListener('component-progress', handler);
  },

  // Downloads
  startDownload: (options) => ipcRenderer.invoke('start-download', options),
  cancelDownload: (id) => ipcRenderer.invoke('cancel-download', id),
  onDownloadProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },

  // Folder / files
  selectDownloadFolder: () => ipcRenderer.invoke('select-download-folder'),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  openFile: (p) => ipcRenderer.invoke('open-file', p),

  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  addHistory: (item) => ipcRenderer.invoke('add-history', item),

  // Navigation from tray
  onNavigate: (cb) => {
    const handler = (_e, page) => cb(page);
    ipcRenderer.on('navigate', handler);
    return () => ipcRenderer.removeListener('navigate', handler);
  },

  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // Misc
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getBinDir: () => ipcRenderer.invoke('get-bin-dir'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  platform: process.platform
});
