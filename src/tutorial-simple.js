class SimpleTutorial {
  constructor() { this.isActive = false; }
  async show() {
    if (this.isActive) return;
    this.isActive = true;
    try {
      if (window.qd && (await window.qd.getSettings()).tutorialCompleted) {
        this.isActive = false;
        return;
      }
      const previousFocus = document.activeElement;
      const modal = document.createElement('dialog');
      modal.setAttribute('aria-labelledby', 'tutorialTitle');
      modal.innerHTML = `<img class="tutorial-logo" src="../assets/logo.png" alt="">
        <div class="eyebrow">БЫСТРЫЙ СТАРТ</div>
        <h2 id="tutorialTitle">Ваши медиа — всегда рядом.</h2>
        <p>Три шага до первой загрузки.</p>
        <ol class="tutorial-steps"><li>Вставьте ссылку на видео или плейлист.</li><li>Выберите видео или аудио, качество и формат.</li><li>Нажмите «Скачать». Файл появится в вашей папке загрузок.</li></ol>
        <p>Папку и тему можно изменить в настройках. Скачанные файлы доступны в истории.</p>
        <div class="tutorial-actions"><button class="primary" autofocus>Начать работу</button></div>`;
      document.body.appendChild(modal);
      lockScroll('tutorial', true);
      const finish = () => {
        if (!this.isActive) return;
        modal.close();
        modal.remove();
        this.isActive = false;
        lockScroll('tutorial', false);
        previousFocus?.focus();
        window.qd?.setSetting('tutorialCompleted', true).catch(() => toast('Не удалось сохранить настройку обучения', true));
      };
      modal.addEventListener('close', finish, { once: true });
      modal.addEventListener('cancel', event => { event.preventDefault(); finish(); });
      modal.querySelector('button').onclick = finish;
      modal.showModal();
    } catch (err) {
      this.isActive = false;
      lockScroll('tutorial', false);
      toast(err.message, true);
    }
  }
}
window.tutorialSystem = new SimpleTutorial();
