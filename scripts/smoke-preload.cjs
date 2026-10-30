const { contextBridge } = require('electron');
let settings = { firstRunDone: true, tutorialCompleted: true, theme: 'dark', enableSounds: false };
let outcome = 'success';
let pending;
contextBridge.exposeInMainWorld('qd', {
 getSettings: async () => settings,
 setSetting: async (k,v) => { settings[k]=v; },
 getHistory: async () => [], getAppVersion: async () => '1.0.0',
 checkComponents: async () => ({ytdlp:true,ffmpeg:true}),
 downloadYtDlp: async () => ({ok:outcome !== 'setup-fail',error:'Test setup error'}),
 downloadFFmpeg: async () => ({ok:true}), setFirstRunDone: async () => {},
 onComponentProgress: () => () => {}, onDownloadProgress: () => () => {}, onNavigate: () => {},
 startDownload: async () => {
  if(outcome==='reject') throw new Error('Test IPC failure');
  if(outcome==='pending') return new Promise(r=>pending=r);
  return {ok:true,filePath:'C:\\Downloads\\Test.mp4'};
 },
 cancelDownload: async () => { if(pending) {pending({ok:false,cancelled:true});pending=null;return true;} return false; },
 addHistory: async item => [item], clearHistory: async () => {}, openFile: async () => {}, openExternal: async () => {},
 testOutcome: value => { outcome=value; }
});
