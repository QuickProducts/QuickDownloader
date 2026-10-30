const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let state = {
  theme: 'dark',
  quality: '2160',
  keep: true,
  subs: false,
  metadata: true,
  history: [],
  downloadPath: '',
  startWithWindows: false,
  minimizeToTray: true,
  showNotifications: true,
  checkYtDlpUpdates: true,
  enableSounds: true,
  soundVolume: 30,
  buttonSounds: true
};

let type = 'video';
let currentDownloadId = null;
let historyCache = [];
let currentPage = 'download';
let setupRunning = false;
let cancelledDownloadId = null;
const scrollLocks = new Set();
function lockScroll(reason, locked) {
  locked ? scrollLocks.add(reason) : scrollLocks.delete(reason);
  document.body.style.overflow = scrollLocks.size ? 'hidden' : '';
  document.documentElement.style.overflowY = scrollLocks.size ? 'hidden' : '';
}
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

// Toast with animation
function toast(t, isError = false) {
  const el = $('#toast');
  el.textContent = t;
  el.className = '';
  el.style.display = 'block';

  if (isError) {
  }

  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.classList.add('hiding');
    setTimeout(() => { el.style.display = 'none'; }, 250);
  }, 2800);
}

function theme(t) {
  const previous = state.theme;
  if (previous !== t && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelector('.theme-wipe')?.remove();
    const wipe = document.createElement('div');
    wipe.className = 'theme-wipe';
    document.body.append(wipe);
    wipe.addEventListener('animationend', () => wipe.remove(), { once: true });
  }
  if (!['dark', 'light', 'forest'].includes(t)) t = 'dark';
  state.theme = t;
  document.documentElement.style.colorScheme = t === 'light' ? 'light' : 'dark';
  document.body.dataset.theme = t;
  $$('button[data-theme]').forEach(b => b.classList.toggle('chosen', b.dataset.theme === t));
  if (window.qd) window.qd.setSetting('theme', t);
}

function page(id) {
  // Exit animation for current page
  const currentPageEl = $$('.page').find(e => !e.hidden);
  if (currentPageEl) {
    currentPageEl.classList.add('exiting');
  }

  setTimeout(() => {
    $$('.page').forEach(e => {
      e.classList.remove('exiting');
      e.hidden = e.id !== id;
    });
    $$('nav button').forEach(e => e.classList.toggle('active', e.dataset.page === id));
    $('#breadcrumb').textContent = { download: 'Загрузить', history: 'История', settings: 'Настройки' }[id];
    window.scrollTo(0, 0);
    currentPage = id;
  }, currentPageEl ? 250 : 0);
}

function showModal(title, text, actionsHtml = '') {
  $('#modalTitle').textContent = title;
  $('#modalText').textContent = text;
  $('#modalActions').innerHTML = actionsHtml;
  $('#modal').showModal();
}

function closeModal() {
  const modal = $('#modal');
  modal.classList.add('closing');
  setTimeout(() => {
    modal.close();
    modal.classList.remove('closing');
  }, 250);
}

function renderHistory(filter = '') {
  const list = $('#historyList');
  const q = filter.toLowerCase();
  const items = historyCache.filter(h =>
    !q || (h.url && h.url.toLowerCase().includes(q)) ||
    (h.format && h.format.toLowerCase().includes(q)) ||
    (h.title && h.title.toLowerCase().includes(q))
  );
  $('#count').textContent = historyCache.length;

  if (!items.length) {
    list.innerHTML = `
      <div class="empty empty-hist empty-illustration" style="padding: 60px 30px; text-align: center;">
        <div style="max-width: 200px; margin: 0 auto 20px; opacity: 0.6;">${Icons?.emptyBox || ''}</div>
        <strong style="display: block; font-size: 16px; margin-bottom: 8px;">История пуста</strong>
        <p style="margin: 0; color: var(--muted); font-size: 12px;">Скачайте видео или аудио, и оно появится здесь</p>
      </div>
    `;
    return;
  }

  list.innerHTML = items.map(h => `
    <div class="hist-item" data-id="${escapeHtml(h.id)}">
      <div class="hist-main">
        <strong>${escapeHtml(h.title || h.url)}</strong>
        <small>${escapeHtml(h.format)} · ${escapeHtml(h.type)} · ${h.quality ? escapeHtml(h.quality) + 'p' : ''} · ${new Date(h.date).toLocaleString('ru')}</small>
      </div>
      <div class="hist-actions">
        ${h.filePath ? `<button class="ghost open-file" data-path="${escapeHtml(h.filePath)}">Открыть</button>` : ''}
        <button class="ghost redownload" data-url="${escapeHtml(h.url)}">Снова</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.open-file').forEach(b => {
    b.onclick = () => {
      window.qd.openFile(b.dataset.path);
    };
  });

  list.querySelectorAll('.redownload').forEach(b => {
    b.onclick = () => {
      $('#url').value = b.dataset.url;
      page('download');
      setTimeout(() => $('#url').focus(), 300);
    };
  });
}

async function loadSettings() {
  if (!window.qd) return;
  const s = await window.qd.getSettings();
  state = { ...state, ...s };

  theme(state.theme || 'dark');
  $('#quality').value = state.quality || '2160';
  $('#defaultQuality').value = state.quality || '2160';
  $('#keepHistory').checked = state.keepHistory !== false;
  $('#subs').checked = !!state.embedSubs || !!state.subs;
  $('#metadata').checked = state.embedMetadata !== false && state.metadata !== false;
  $('#startWithWindows').checked = !!state.startWithWindows;
  $('#minimizeToTray').checked = state.minimizeToTray !== false;
  $('#showNotifications').checked = state.showNotifications !== false;
  $('#checkYtDlpUpdates').checked = state.checkYtDlpUpdates !== false;
  $('#downloadPath').textContent = state.downloadPath || 'Загрузки';

  historyCache = await window.qd.getHistory() || [];
  renderHistory();

  const ver = await window.qd.getAppVersion();
  $('#appVersion').textContent = 'Версия ' + ver;
}

// ---------- Setup flow ----------
function setStep(id, status) {
  const el = document.getElementById(id);
  if (el) el.dataset.status = status;
}

async function runSetup() {
  if (setupRunning || currentDownloadId) return;
  setupRunning = true;
  $('#setupRetry').disabled = true;
  const overlay = $('#setupOverlay');
  overlay.hidden = false;
  $('#setupDone').hidden = true;
  $('#setupError').hidden = true;
  $$('.setup-step').forEach(s => s.dataset.status = 'pending');
  $('#prog-ytdlp').style.width = '0%';
  $('#prog-ffmpeg').style.width = '0%';
  $('#pct-ytdlp').textContent = '0%';
  $('#pct-ffmpeg').textContent = '0%';

  // Блокируем скролл во время установки
  lockScroll('setup', true);

  const unsub = window.qd.onComponentProgress(data => {
    if (data.component === 'ytdlp') {
      $('#prog-ytdlp').style.width = data.percent + '%';
      $('#pct-ytdlp').textContent = data.percent + '%';
    } else if (data.component === 'ffmpeg') {
      $('#prog-ffmpeg').style.width = data.percent + '%';
      $('#pct-ffmpeg').textContent = data.percent + '%';
    }
  });

  try {
    // Step 1: yt-dlp
    setStep('step-ytdlp', 'active');
    const yt = await window.qd.downloadYtDlp();
    if (!yt.ok) throw new Error(yt.error || 'Ошибка загрузки yt-dlp');
    setStep('step-ytdlp', 'done');
    $('#prog-ytdlp').style.width = '100%';
    $('#pct-ytdlp').textContent = '100%';

    // Step 2: FFmpeg
    setStep('step-ffmpeg', 'active');
    const ff = await window.qd.downloadFFmpeg();
    if (!ff.ok) throw new Error(ff.error || 'Ошибка загрузки FFmpeg');
    setStep('step-ffmpeg', 'done');
    $('#prog-ffmpeg').style.width = '100%';
    $('#pct-ffmpeg').textContent = '100%';

    // Step 3: verify
    setStep('step-verify', 'active');
    await new Promise(r => setTimeout(r, 600));
    const check = await window.qd.checkComponents();
    if (!check.ytdlp || !check.ffmpeg) throw new Error('Компоненты не прошли проверку');
    setStep('step-verify', 'done');

    // Done
    $$('.setup-steps').forEach(el => el.style.display = 'none');
    $('#setupDone').hidden = false;
    await window.qd.setFirstRunDone();
    await new Promise(r => setTimeout(r, 1600));
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove('fade-out');
      $$('.setup-steps').forEach(el => el.style.display = '');
      lockScroll('setup', false); // Разблокируем скролл

      // Show tutorial after setup completes
      setTimeout(() => {
        if (window.tutorialSystem) {
          window.tutorialSystem.show();
        }
      }, 800);
    }, 500);
  } catch (err) {
    $('#setupError').hidden = false;
    $('#setupErrorText').textContent = err.message || 'Не удалось загрузить компоненты. Проверьте интернет.';
    // Keep the background locked while the setup error is visible.
  } finally {
    setupRunning = false;
    $('#setupRetry').disabled = false;
    unsub();
  }
}

async function maybeSetup() {
  if (!window.qd) return false;
  const s = await window.qd.getSettings();
  if (s.firstRunDone) {
    const check = await window.qd.checkComponents();
    if (check.ytdlp && check.ffmpeg) return false;
  }
  // Need setup
  await runSetup();
  return true;
}

// ---------- Splash screen ----------
async function showSplashScreen() {
  const splash = $('#splashScreen');
  if (!splash) return;

  // ВСЕГДА показывать splash screen
  splash.style.display = 'flex';
  splash.classList.remove('hidden');

  // Play startup sound

  // Wait for animation (2 seconds)
  await new Promise(resolve => setTimeout(resolve, 450));

  // Hide splash with animation
  splash.classList.add('hidden');
  await new Promise(resolve => setTimeout(resolve, 500));

  // Don't remove, just hide for next time
  splash.style.display = 'none';
}

// ---------- Events ----------
document.addEventListener('DOMContentLoaded', async () => {
  $('#windowMinimize').onclick = () => window.qd?.minimizeWindow();
  $('#windowMaximize').onclick = () => window.qd?.maximizeWindow();
  $('#windowClose').onclick = () => window.qd?.closeWindow();
  // Show splash screen first
  await loadSettings();
  await showSplashScreen();

  // Navigation
  $$('[data-page]').forEach(b => {
    b.onclick = () => {
      page(b.dataset.page);
    };
  });

  $$('button[data-theme]').forEach(b => {
    b.onclick = () => {
      theme(b.dataset.theme);
    };
  });

  $('#themeToggle').onclick = () => {
    const newTheme = state.theme === 'dark' ? 'light' : state.theme === 'light' ? 'forest' : 'dark';
    theme(newTheme);
  };

  // Type switch
  $$('[data-type]').forEach(b => {
    b.onclick = () => {
      type = b.dataset.type;
      $$('[data-type]').forEach(x => x.classList.toggle('selected', x === b));
      const formats = type === 'video' ? ['MP4', 'WEBM', 'MKV'] : ['MP3', 'M4A', 'FLAC', 'WAV'];
      $('#format').replaceChildren(...formats.map(t => new Option(t, t)));
      $('#quality').disabled = type === 'audio';
    };
  });

  // Paste
  $('#paste').onclick = async () => {
    try {
      $('#url').value = await navigator.clipboard.readText();
      $('#url').focus();
    } catch {
      toast('Вставьте ссылку с помощью Ctrl+V');
      $('#url').focus();
    }
  };

  // About - открывает Telegram бота поддержки
  $('#about').onclick = () => {
    if (window.qd) {
      window.qd.openExternal('https://t.me/QuickDeveloper_bot');
    }
  };

  $('#close').onclick = () => closeModal();
  $('#modal').onclick = e => { if (e.target === $('#modal')) closeModal(); };

  // Form submit — real download
  $('#form').onsubmit = async e => {
    e.preventDefault();
    if (currentDownloadId || setupRunning) return;
    if (!window.qd) {
      toast('Electron API недоступен', true);
      return;
    }

    let url;
    try {
      url = new URL($('#url').value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      toast('Введите корректную ссылку http или https', true);
      return;
    }

    const requested = { type, format: $('#format').value, quality: $('#quality').value };
    const id = Date.now().toString();
    currentDownloadId = id;

    const activeDownload = $('#activeDownload');
    activeDownload.hidden = false;
    activeDownload.classList.remove('complete');
    $('#dlSpinnerIcon').hidden = false;
    $('#dlSuccessIcon').hidden = true;
    $('#dlTitle').textContent = 'Загрузка…';
    $('#dlProg').style.width = '0%';
    $('#dlProg').classList.remove('complete');
    $('#dlPct').textContent = '0%';
    $('#dlSpeed').textContent = '';
    $('#dlEta').textContent = '';
    $('#downloadBtn').disabled = true;

    // Блокируем скролл во время загрузки
    activeDownload.scrollIntoView({ block: 'nearest' });
    lockScroll('download', true);

    // Play download start sound

    const unsub = window.qd.onDownloadProgress(data => {
      if (data.id !== id) return;
      if (data.percent != null) {
        $('#dlProg').style.width = data.percent + '%';
        $('#dlPct').textContent = Math.round(data.percent) + '%';
      }
      if (data.speed) $('#dlSpeed').textContent = data.speed;
      if (data.eta) $('#dlEta').textContent = 'ETA ' + data.eta;
    });

    let result;
    try {
      result = await window.qd.startDownload({
      id,
      url: url.href,
      ...requested,
      playlist: $('#playlist').checked,
      subs: $('#subs').checked,
      metadata: $('#metadata').checked
    });
    } catch (err) {
      result = { ok: false, error: err.message };
    } finally {
      unsub();
      $('#downloadBtn').disabled = false;
      $('#cancelDl').disabled = false;
      currentDownloadId = null;
      lockScroll('download', false);
    }
    if (result.cancelled || cancelledDownloadId === id) {
      activeDownload.hidden = true;
      toast('Загрузка отменена');
      return;
    }

    if (result.ok) {
      $('#dlProg').style.width = '100%';
      $('#dlProg').classList.add('complete');
      $('#dlPct').textContent = '100%';
      $('#dlSpinnerIcon').hidden = true;
      $('#dlSuccessIcon').hidden = false;
      activeDownload.classList.add('complete');

      // Play success sound

      toast('Загрузка завершена');

      const item = {
        id: Date.now(),
        url: url.href,
        title: result.filePath ? result.filePath.split(/[/\\]/).pop() : url.href,
        format: requested.format.toUpperCase(),
        type: requested.type,
        quality: requested.quality,
        date: new Date().toISOString(),
        filePath: result.filePath || null
      };

      if (state.keepHistory !== false) {
        historyCache = await window.qd.addHistory(item) || historyCache;
        renderHistory();
      }

      showModal(
        'Готово!',
        result.filePath ? `Файл сохранён:\n${result.filePath}` : 'Загрузка успешно завершена.',
        result.filePath
          ? `<button class="primary" id="openResult">Открыть папку</button>`
          : ''
      );

      const openBtn = $('#openResult');
      if (openBtn) {
        openBtn.onclick = () => {
          window.qd.openFile(result.filePath);
          closeModal();
        };
      }

      $('#dlTitle').textContent = 'Загрузка завершена';
    } else {
      toast('Ошибка: ' + (result.error || 'неизвестно'), true);
      activeDownload.hidden = true;
    }
  };

  $('#cancelDl').onclick = async () => {
    if (currentDownloadId && window.qd) {
      $('#cancelDl').disabled = true;
      try {
        const cancelled = await window.qd.cancelDownload(currentDownloadId);
        if (cancelled) cancelledDownloadId = currentDownloadId;
      } catch (err) { toast(err.message, true); }
      finally { $('#cancelDl').disabled = false; }
    }
  };

  // Settings bindings
  $('#defaultQuality').onchange = e => {
    state.quality = e.target.value;
    $('#quality').value = state.quality;
    if (window.qd) window.qd.setSetting('quality', state.quality);
  };

  [['keepHistory', 'keepHistory'], ['subs', 'embedSubs'], ['metadata', 'embedMetadata'],
   ['startWithWindows', 'startWithWindows'], ['minimizeToTray', 'minimizeToTray'],
   ['showNotifications', 'showNotifications'], ['checkYtDlpUpdates', 'checkYtDlpUpdates']
  ].forEach(([id, key]) => {
    const el = $('#' + id);
    if (el) el.onchange = e => {
      state[key] = e.target.checked;
      if (window.qd) window.qd.setSetting(key, e.target.checked);
    };
  });

  $('#chooseFolder').onclick = async () => {
    if (!window.qd) return;
    const p = await window.qd.selectDownloadFolder();
    if (p) {
      state.downloadPath = p;
      $('#downloadPath').textContent = p;
    }
  };

  $('#clear').onclick = async () => {
    if (window.qd) {
      await window.qd.clearHistory();
      historyCache = [];
      renderHistory();
      toast('История очищена');
    }
  };


  $('#setupRetry').onclick = () => runSetup();

  // Restart tutorial button
  $('#restartTutorial')?.addEventListener('click', async () => {
    if (window.qd) {
      await window.qd.setSetting('tutorialCompleted', false);
    }
    if (window.tutorialSystem) {
      setTimeout(() => {
        window.tutorialSystem.show();
      }, 300);
    }
  });

  // Reset setup button
  $('#resetSetup')?.addEventListener('click', async () => {

    if (currentDownloadId) { toast('Дождитесь окончания загрузки'); return; }
    if (window.qd) await runSetup();
  });

  // Tray navigation
  if (window.qd) {
    window.qd.onNavigate(p => page(p));
  }

  // Handle window closing


  // Init
  const setupRan = await maybeSetup();

  // If setup didn't run (not first time), check if we should show tutorial
  if (!setupRan && window.tutorialSystem) {
    const settings = await window.qd.getSettings();
    if (!settings.tutorialCompleted && settings.firstRunDone) {
      // First run done but tutorial not shown - show it now
      setTimeout(() => {
        window.tutorialSystem.show();
      }, 1000);
    }
  }
});
