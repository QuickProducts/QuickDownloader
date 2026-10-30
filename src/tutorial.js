// Interactive First-Time Tutorial System
class Tutorial {
  constructor() {
    this.currentStep = 0;
    this.steps = [
      {
        title: 'Добро пожаловать в QuickDownloader! 🎉',
        text: 'Сейчас покажем, как легко скачивать видео и музыку из интернета',
        icon: 'welcome',
        spotlight: null,
        arrow: null
      },
      {
        title: 'Вставьте ссылку на видео',
        text: 'Скопируйте ссылку на видео с YouTube, TikTok или любого другого сайта и вставьте её <span class="tutorial-highlight">в это поле</span>',
        icon: 'link',
        spotlight: '#url',
        arrow: { x: 'calc(50% - 100px)', y: '45%' }
      },
      {
        title: 'Выберите качество',
        text: 'Здесь можно выбрать качество видео — от 480p до <span class="tutorial-highlight">лучшего доступного</span>',
        icon: 'quality',
        spotlight: '#quality',
        arrow: { x: 'calc(50% + 150px)', y: '52%' }
      },
      {
        title: 'Скачивайте!',
        text: 'Нажмите эту большую зелёную кнопку, и начнётся загрузка. Вы увидите прогресс в реальном времени!',
        icon: 'download',
        spotlight: '#downloadBtn',
        arrow: { x: 'calc(50% + 200px)', y: '58%' }
      },
      {
        title: 'Готово! Вы великолепны! ✨',
        text: 'Теперь вы знаете всё необходимое. История загрузок сохраняется автоматически. Приятного использования!',
        icon: 'success',
        spotlight: null,
        arrow: null
      }
    ];
    this.overlay = null;
    this.spotlight = null;
    this.arrow = null;
  }

  async show() {
    // Check if tutorial was already shown
    if (window.qd) {
      const settings = await window.qd.getSettings();
      if (settings.tutorialCompleted) return false;
    }

    // Hide intro section during tutorial
    const intro = document.querySelector('.intro');
    if (intro) {
      intro.style.display = 'none';
      this._hiddenIntro = intro;
    }

    this.createOverlay();
    this.showStep(0);
    sound.success();
    return true;
  }

  createOverlay() {
    // Create main overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'tutorial-overlay';
    document.body.appendChild(this.overlay);

    // Create spotlight
    this.spotlight = document.createElement('div');
    this.spotlight.className = 'tutorial-spotlight';
    this.spotlight.style.display = 'none';
    document.body.appendChild(this.spotlight);

    // Create arrow
    this.arrow = document.createElement('div');
    this.arrow.className = 'tutorial-arrow';
    this.arrow.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M7 17L17 7M17 7H7M17 7V17"/>
      </svg>
    `;
    this.arrow.style.display = 'none';
    document.body.appendChild(this.arrow);
  }

  showStep(index) {
    this.currentStep = index;
    const step = this.steps[index];

    // Remove old card
    const oldCard = this.overlay.querySelector('.tutorial-card');
    if (oldCard) {
      oldCard.remove();
    }

    // Create card
    const card = document.createElement('div');
    card.className = 'tutorial-card';

    const iconHTML = this.getIconHTML(step.icon);

    card.innerHTML = `
      ${index === 0 ? '' : '<button class="tutorial-skip">Пропустить</button>'}
      <div class="tutorial-icon ${step.icon === 'welcome' ? 'rotate' : ''}">
        ${iconHTML}
      </div>
      <h2 class="tutorial-title">${step.title}</h2>
      <p class="tutorial-text">${step.text}</p>
      <div class="tutorial-steps">
        ${this.steps.map((_, i) => `<div class="tutorial-step ${i === index ? 'active' : ''}"></div>`).join('')}
      </div>
      <div class="tutorial-buttons">
        ${index > 0 ? '<button class="tutorial-button secondary" data-action="prev">Назад</button>' : ''}
        <button class="tutorial-button primary" data-action="next">
          ${index === this.steps.length - 1 ? 'Начать работу!' : 'Далее'}
        </button>
      </div>
    `;

    this.overlay.appendChild(card);

    // Add event listeners
    card.querySelectorAll('.tutorial-button').forEach(btn => {
      btn.addEventListener('click', () => {
        sound.buttonClick();
        const action = btn.dataset.action;
        if (action === 'next') {
          if (index === this.steps.length - 1) {
            this.complete();
          } else {
            this.showStep(index + 1);
          }
        } else if (action === 'prev') {
          this.showStep(index - 1);
        }
      });
    });

    const skipBtn = card.querySelector('.tutorial-skip');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        sound.buttonClick();
        this.complete();
      });
    }

    // Update spotlight and position card
    if (step.spotlight) {
      this.updateSpotlight(step.spotlight);
      this.positionCardNearSpotlight(card, step.spotlight);
    } else {
      this.spotlight.style.display = 'none';
      card.classList.remove('near-spotlight');
    }

    // Update arrow
    if (step.arrow) {
      this.arrow.style.display = 'block';
      this.arrow.style.left = step.arrow.x;
      this.arrow.style.top = step.arrow.y;
    } else {
      this.arrow.style.display = 'none';
    }

    // Play sound for each step
    if (index > 0) {
      sound.navigate();
    }
  }

  updateSpotlight(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      this.spotlight.style.display = 'none';
      return;
    }

    const rect = element.getBoundingClientRect();
    this.spotlight.style.display = 'block';
    this.spotlight.style.left = (rect.left - 10) + 'px';
    this.spotlight.style.top = (rect.top - 10) + 'px';
    this.spotlight.style.width = (rect.width + 20) + 'px';
    this.spotlight.style.height = (rect.height + 20) + 'px';
  }

  positionCardNearSpotlight(card, selector) {
    const element = document.querySelector(selector);
    if (!element) return;

    card.classList.add('near-spotlight');
    const rect = element.getBoundingClientRect();

    // Position card to the right of spotlight
    let cardLeft = rect.right + 30;
    let cardTop = rect.top;

    // If card goes off right edge, put it to the left
    if (cardLeft + 480 > window.innerWidth - 40) {
      cardLeft = rect.left - 480 - 30;
    }

    // If still off screen, put it below
    if (cardLeft < 40) {
      cardLeft = Math.max(40, rect.left);
      cardTop = rect.bottom + 30;
    }

    // If off bottom, put it above
    if (cardTop + 400 > window.innerHeight - 40) {
      cardTop = Math.max(40, rect.top - 400 - 30);
    }

    card.style.left = cardLeft + 'px';
    card.style.top = cardTop + 'px';
  }

  async complete() {
    // Show confetti
    this.showConfetti();

    // Mark tutorial as completed
    if (window.qd) {
      await window.qd.setSetting('tutorialCompleted', true);
    }

    sound.downloadComplete();

    // Restore intro section
    if (this._hiddenIntro) {
      this._hiddenIntro.style.display = '';
      this._hiddenIntro = null;
    }

    // Hide overlay
    setTimeout(() => {
      this.overlay.classList.add('hiding');
      setTimeout(() => {
        this.overlay.remove();
        this.spotlight.remove();
        this.arrow.remove();
      }, 400);
    }, 1000);
  }

  showConfetti() {
    const colors = ['var(--accent)', '#70cfff', '#ff6b6b', '#ffd93d', '#6bcf7f'];
    for (let i = 0; i < 50; i++) {
      setTimeout(() => {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.top = '-10px';
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 0.3 + 's';
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
        document.body.appendChild(confetti);
        setTimeout(() => confetti.remove(), 3000);
      }, i * 30);
    }
  }

  getIconHTML(icon) {
    const icons = {
      welcome: `<svg viewBox="0 0 200 200" fill="none">
        <defs>
          <linearGradient id="welcomeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:var(--accent);stop-opacity:0.8"/>
            <stop offset="100%" style="stop-color:var(--accent);stop-opacity:0.3"/>
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="80" fill="url(#welcomeGrad)" stroke="var(--accent)" stroke-width="3"/>
        <path d="M100 60 L100 110 M100 110 L120 90 M100 110 L80 90" stroke="var(--accent)" stroke-width="6" stroke-linecap="round"/>
        <circle cx="100" cy="130" r="8" fill="var(--accent)"/>
      </svg>`,

      link: `<svg viewBox="0 0 200 200" fill="none">
        <rect x="40" y="60" width="120" height="80" rx="12" fill="var(--field)" stroke="var(--accent)" stroke-width="3"/>
        <rect x="60" y="85" width="80" height="12" rx="6" fill="var(--accent)" opacity="0.3"/>
        <rect x="60" y="105" width="60" height="12" rx="6" fill="var(--accent)" opacity="0.5"/>
        <circle cx="140" cy="110" r="8" fill="var(--accent)"/>
      </svg>`,

      quality: `<svg viewBox="0 0 200 200" fill="none">
        <rect x="30" y="50" width="140" height="100" rx="8" fill="var(--field)" stroke="var(--accent)" stroke-width="3"/>
        <rect x="50" y="75" width="20" height="50" fill="var(--accent)" opacity="0.3"/>
        <rect x="80" y="60" width="20" height="65" fill="var(--accent)" opacity="0.5"/>
        <rect x="110" y="45" width="20" height="80" fill="var(--accent)" opacity="0.7"/>
        <rect x="140" y="30" width="20" height="95" fill="var(--accent)"/>
      </svg>`,

      download: `<svg viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="70" fill="var(--accent)" opacity="0.2"/>
        <circle cx="100" cy="100" r="50" fill="var(--accent)" opacity="0.4"/>
        <path d="M100 60 L100 120" stroke="var(--accent)" stroke-width="8" stroke-linecap="round"/>
        <path d="M80 100 L100 120 L120 100" stroke="var(--accent)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <rect x="70" y="130" width="60" height="10" rx="5" fill="var(--accent)"/>
      </svg>`,

      success: `<svg viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="70" fill="var(--accent)" opacity="0.2" stroke="var(--accent)" stroke-width="3"/>
        <path d="M60 100 L85 125 L140 70" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    };

    return icons[icon] || icons.welcome;
  }
}

// Create global tutorial instance
window.tutorialSystem = new Tutorial();

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Tutorial;
}
