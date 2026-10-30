const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const https = require('https');
const http = require('http');

const Store = require('electron-store');
const { Menu: ElectronMenu } = require('electron');

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

const store = new Store({
  name: 'settings',
  defaults: {
    downloadPath: app.getPath('downloads'),
    startWithWindows: false,
    minimizeToTray: true,
    showNotifications: true,
    checkYtDlpUpdates: true,
    checkAppUpdates: false,
    theme: 'dark',
    quality: '2160',
    keepHistory: true,
    embedSubs: false,
    embedMetadata: true,
    firstRunDone: false,
    history: []
  }
});

let mainWindow = null;
let tray = null;
let isQuitting = false;
let activeDownloads = new Map(); // id -> process

const BIN_DIR = path.join(app.getPath('userData'), 'bin');
const YTDLP_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const FFMPEG_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const FFPROBE_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');

function ensureBinDir() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }
}

function animateWindow(win, from, to, duration, done) {
  const started = Date.now();
  const tick = () => {
    if (!win || win.isDestroyed()) return;
    const progress = Math.min(1, (Date.now() - started) / duration);
    const eased = progress * progress * (3 - 2 * progress);
    win.setOpacity(from + (to - from) * eased);
    if (progress < 1) setTimeout(tick, 16);
    else done?.();
  };
  tick();
}

function revealWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setOpacity(0);
  mainWindow.show();
  mainWindow.focus();
  animateWindow(mainWindow, 0, 1, 420);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    title: 'QuickDownloader',
    icon: path.join(__dirname, 'assets', 'logo.png'),
    backgroundColor: '#10151f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  // Remove menu bar
  mainWindow.setMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.setOpacity(0);
    mainWindow.show();
    mainWindow.focus();
    animateWindow(mainWindow, 0, 1, 460);
  });

  let closing = false;
  mainWindow.on('close', (e) => {
    if (isQuitting || closing) return;
    e.preventDefault();
    if (store.get('minimizeToTray', true)) {
      animateWindow(mainWindow, mainWindow.getOpacity(), 0, 380, () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.hide();
        mainWindow.setOpacity(1);
      });
      if (Notification.isSupported()) {
        new Notification({ title: 'QuickDownloader работает в трее', body: 'Нажмите на иконку в трее, чтобы открыть приложение.', icon: path.join(__dirname, 'assets', 'logo.png') }).show();
      }
    } else {
      animateWindow(mainWindow, mainWindow.getOpacity(), 0, 380, () => {
        closing = true;
        mainWindow?.close();
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'logo.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('QuickDownloader');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Открыть QuickDownloader',
      click: () => {
        if (mainWindow) {
          revealWindow();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Показать загрузки',
      click: () => {
        if (mainWindow) {
          revealWindow();
          mainWindow.webContents.send('navigate', 'history');
        }
      }
    },
    {
      label: 'Настройки',
      click: () => {
        if (mainWindow) {
          revealWindow();
          mainWindow.webContents.send('navigate', 'settings');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        isQuitting = true;
        // Kill active downloads
        for (const [, proc] of activeDownloads) {
          stopDownload(proc)
        }
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        revealWindow();
      }
    } else {
      createWindow();
    }
  });
}

function stopDownload(proc) {
  proc.cancelled = true;
  if (process.platform === 'win32' && proc.pid) {
    execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => {});
  } else { try { proc.kill('SIGTERM'); } catch {} }
}

// ---------- Component download helpers ----------

function downloadFile(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error('Слишком много перенаправлений'));
    const protocol = url.startsWith('https:') ? https : http;
    const request = protocol.get(url, { headers: { 'User-Agent': 'QuickDownloader/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadFile(new URL(res.headers.location, url).href, dest, onProgress, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const file = fs.createWriteStream(dest);
      let received = 0;
      const total = Number(res.headers['content-length'] || 0);
      res.on('data', chunk => { received += chunk.length; if (total && onProgress) onProgress(Math.min(100, Math.round(received / total * 100)), received, total); });
      require('stream').pipeline(res, file, err => {
        if (err) { fs.rm(dest, { force: true }, () => reject(err)); }
        else resolve();
      });
    });
    request.on('error', reject);
    request.setTimeout(120000, () => request.destroy(new Error('Время ожидания загрузки истекло')));
  });
}

async function checkYtDlp() {
  if (!fs.existsSync(YTDLP_PATH)) return false;
  return new Promise((resolve) => {
    execFile(YTDLP_PATH, ['--version'], { timeout: 10000, windowsHide: true }, (err, stdout) => {
      resolve(!err && !!stdout.trim());
    });
  });
}

async function checkFFmpeg() {
  if (!fs.existsSync(FFMPEG_PATH) || !fs.existsSync(FFPROBE_PATH)) return false;
  return new Promise((resolve) => {
    execFile(FFMPEG_PATH, ['-version'], { timeout: 10000, windowsHide: true }, (err, stdout) => {
      resolve(!err && stdout && stdout.includes('ffmpeg'));
    });
  });
}

async function getLatestYtDlpUrl() {
  // Official release asset for Windows
  return new Promise((resolve, reject) => {
    https.get('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
      headers: { 'User-Agent': 'QuickDownloader/1.0', 'Accept': 'application/vnd.github+json' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const asset = json.assets.find(a => a.name === 'yt-dlp.exe');
          if (asset) resolve(asset.browser_download_url);
          else reject(new Error('yt-dlp.exe not found in release'));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function downloadYtDlp(onProgress) {
  ensureBinDir();
  const url = await getLatestYtDlpUrl();
  const tmp = YTDLP_PATH + '.tmp';
  await downloadFile(url, tmp, onProgress);
  if (fs.existsSync(YTDLP_PATH)) fs.unlinkSync(YTDLP_PATH);
  fs.renameSync(tmp, YTDLP_PATH);
  // Make executable on non-Windows
  if (process.platform !== 'win32') {
    fs.chmodSync(YTDLP_PATH, 0o755);
  }
}

// FFmpeg: use BtbN or gyan builds (reliable Windows builds)
async function getFFmpegUrl() {
  // Use a known reliable source - gyan.dev essential build or BtbN
  // For simplicity and reliability we use the official BtbN release via GitHub
  return new Promise((resolve, reject) => {
    https.get('https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest', {
      headers: { 'User-Agent': 'QuickDownloader/1.0', 'Accept': 'application/vnd.github+json' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // Prefer win64 gpl shared or essentials
          const asset = json.assets.find(a =>
            a.name.includes('win64') && a.name.includes('gpl') && a.name.endsWith('.zip') &&
            !a.name.includes('shared') && !a.name.includes('lgpl')
          ) || json.assets.find(a => a.name.includes('win64') && a.name.endsWith('.zip'));
          if (asset) resolve(asset.browser_download_url);
          else reject(new Error('FFmpeg Windows build not found'));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function downloadAndExtractFFmpeg(onProgress) {
  ensureBinDir();
  const url = await getFFmpegUrl();
  const zipPath = path.join(BIN_DIR, 'ffmpeg.zip');
  await downloadFile(url, zipPath, onProgress);

  // Extract using Node (no external unzip required)
  // We only need ffmpeg.exe and ffprobe.exe
  const AdmZip = require('adm-zip'); // will add dependency
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  for (const entry of entries) {
    const name = entry.entryName.toLowerCase();
    if (name.endsWith('ffmpeg.exe') || name.endsWith('ffprobe.exe') ||
        (process.platform !== 'win32' && (name.endsWith('/ffmpeg') || name.endsWith('/ffprobe')))) {
      const base = path.basename(entry.entryName);
      const target = path.join(BIN_DIR, base);
      zip.extractEntryTo(entry, BIN_DIR, false, true);
      // Move if nested
      const extracted = path.join(BIN_DIR, entry.entryName);
      if (fs.existsSync(extracted) && extracted !== target) {
        fs.renameSync(extracted, target);
      }
      if (process.platform !== 'win32') fs.chmodSync(target, 0o755);
    }
  }
  // Cleanup
  try { fs.unlinkSync(zipPath); } catch {}
  // Clean any leftover dirs
  try {
    const dirs = fs.readdirSync(BIN_DIR).filter(f => {
      const p = path.join(BIN_DIR, f);
      return fs.statSync(p).isDirectory();
    });
    for (const d of dirs) {
      fs.rmSync(path.join(BIN_DIR, d), { recursive: true, force: true });
    }
  } catch {}
}

// ---------- IPC handlers ----------

ipcMain.handle('get-settings', () => store.store);

ipcMain.handle('set-setting', (e, key, value) => {
  store.set(key, value);
  if (key === 'startWithWindows') {
    app.setLoginItemSettings({
      openAtLogin: !!value,
      path: process.execPath
    });
  }
  return true;
});

ipcMain.handle('check-components', async () => {
  const ytdlp = await checkYtDlp();
  const ffmpeg = await checkFFmpeg();
  return { ytdlp, ffmpeg, binDir: BIN_DIR };
});

ipcMain.handle('download-ytdlp', async (event) => {
  try {
    await downloadYtDlp((pct, received, total) => {
      event.sender.send('component-progress', { component: 'ytdlp', percent: pct, received, total });
    });
    const ok = await checkYtDlp();
    return { ok };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('download-ffmpeg', async (event) => {
  try {
    await downloadAndExtractFFmpeg((pct, received, total) => {
      event.sender.send('component-progress', { component: 'ffmpeg', percent: pct, received, total });
    });
    const ok = await checkFFmpeg();
    return { ok };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('set-first-run-done', () => {
  store.set('firstRunDone', true);
  return true;
});

ipcMain.handle('select-download-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Выберите папку для загрузок'
  });
  if (!result.canceled && result.filePaths[0]) {
    store.set('downloadPath', result.filePaths[0]);
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('open-folder', async (e, folderPath) => {
  if (folderPath && fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
  } else {
    shell.openPath(store.get('downloadPath'));
  }
});

ipcMain.handle('open-file', async (e, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
  }
});

ipcMain.handle('get-history', () => store.get('history', []));

ipcMain.handle('clear-history', () => {
  store.set('history', []);
  return true;
});

ipcMain.handle('add-history', (e, item) => {
  let history = store.get('history', []);
  history.unshift(item);
  history = history.slice(0, 100);
  store.set('history', history);
  return history;
});

// Download media via yt-dlp
ipcMain.handle('start-download', async (event, options) => {
  const { url, type, format, quality, playlist, subs, metadata, id } = options;

  // Basic URL validation
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) {
      return { ok: false, error: 'Некорректный URL' };
    }
  } catch {
    return { ok: false, error: 'Некорректный URL' };
  }

  if (!(await checkYtDlp())) {
    return { ok: false, error: 'yt-dlp не найден. Перезапустите приложение для установки.' };
  }

  const downloadPath = store.get('downloadPath', app.getPath('downloads'));
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }

  const outputTemplate = path.join(downloadPath, '%(title).200B [%(id)s].%(ext)s');

  const args = [];
  if (type === 'audio') {
    args.push('-x', '--audio-format', format.toLowerCase(), '--audio-quality', '0');
  } else {
    args.push('-f', `bv*[height<=${quality}]+ba/b[height<=${quality}]/b`, '--merge-output-format', format.toLowerCase());
  }
  if (playlist) args.push('--yes-playlist');
  else args.push('--no-playlist');

  if (subs) args.push('--write-subs', '--embed-subs');
  if (metadata) args.push('--embed-metadata', '--embed-thumbnail');

  args.push(
    '--no-mtime',
    '--newline',
    '--progress',
    '--print', 'after_move:QD_FILE:%(filepath)s',
    '-o', outputTemplate,
    '--ffmpeg-location', BIN_DIR,
    '--no-warnings',
    url
  );

  return new Promise((resolve) => {
    const proc = spawn(YTDLP_PATH, args, {
      cwd: downloadPath,
      windowsHide: true,
      env: { ...process.env, PATH: BIN_DIR + path.delimiter + (process.env.PATH || '') }
    });

    activeDownloads.set(id, proc);

    let lastPercent = 0;
    let filePath = null;
    let stderr = '';

    let pending = '';
    function parseLine(line) {
      if (line.startsWith('QD_FILE:')) filePath = line.slice(8).trim();
      const pct = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (pct) lastPercent = Math.min(100, Number(pct[1]));
      const speed = line.match(/at\s+([\d.]+\w+\/s)/);
      const eta = line.match(/ETA\s+([\d:]+)/);
      if (!event.sender.isDestroyed() && (pct || speed || eta)) event.sender.send('download-progress', {
        id, percent: lastPercent, speed: speed?.[1], eta: eta?.[1]
      });
    }
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', text => {
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      lines.forEach(parseLine);
    });

    proc.stderr.on('data', (data) => {
      stderr = (stderr + data.toString()).slice(-4000);
    });

    proc.on('close', (code) => {
      activeDownloads.delete(id);
      if (proc.cancelled) { resolve({ ok: false, cancelled: true }); return; }
      if (code === 0) {
        if (pending) parseLine(pending);
        resolve({ ok: true, filePath, percent: 100 });
        if (store.get('showNotifications', true) && Notification.isSupported()) {
          new Notification({
            title: 'Загрузка завершена',
            body: path.basename(filePath || 'Файл'),
            icon: path.join(__dirname, 'assets', 'logo.png')
          }).show();
        }
      } else {
        resolve({ ok: false, error: stderr.slice(-500) || `Код выхода ${code}` });
      }
    });

    proc.on('error', (err) => {
      activeDownloads.delete(id);
      resolve({ ok: false, error: err.message });
    });
  });
});

ipcMain.handle('cancel-download', (e, id) => {
  const proc = activeDownloads.get(id);
  if (proc) {
    stopDownload(proc)
    activeDownloads.delete(id);
    return true;
  }
  return false;
});

ipcMain.handle('window-minimize', () => mainWindow?.minimize());
ipcMain.handle('window-maximize', () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize(); });
ipcMain.handle('window-close', () => mainWindow?.close());
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() || false);

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-bin-dir', () => BIN_DIR);

ipcMain.handle('open-external', async (e, url) => {
  try {
    if (!['https:', 'http:'].includes(new URL(url).protocol)) return false;
    await shell.openExternal(url);
    return true;
  } catch (err) {
    return false;
  }
});

// ---------- App lifecycle ----------

app.whenReady().then(() => {
  app.setAppUserModelId('com.quickdownloader.app');
  ensureBinDir();
  createWindow();
  createTray();

  // Apply start with Windows
  if (store.get('startWithWindows')) {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  // Keep running in tray on Windows/Linux
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  for (const proc of activeDownloads.values()) stopDownload(proc);
});
