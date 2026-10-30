// Sound effects system using Web Audio API
class SoundSystem {
  constructor() {
    this.context = null;
    this.enabled = true;
    this.volume = 0.3;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio API not supported');
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  // Create oscillator-based sound
  playTone(frequency, duration, type = 'sine', volumeMultiplier = 1) {
    if (!this.enabled || !this.context) return;

    this.init();

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.connect(gain);
    gain.connect(this.context.destination);

    osc.frequency.value = frequency;
    osc.type = type;

    const vol = this.volume * volumeMultiplier;
    gain.gain.setValueAtTime(vol, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);

    osc.start(this.context.currentTime);
    osc.stop(this.context.currentTime + duration);
  }

  // Pre-defined sound effects
  startup() {
    if (!this.enabled) return;
    this.init();

    // Swoosh + chime
    setTimeout(() => this.playTone(400, 0.15, 'sine', 0.4), 0);
    setTimeout(() => this.playTone(600, 0.2, 'sine', 0.3), 100);
    setTimeout(() => this.playTone(800, 0.25, 'sine', 0.25), 180);
  }

  shutdown() {
    if (!this.enabled) return;
    this.init();

    // Reverse swoosh
    setTimeout(() => this.playTone(800, 0.12, 'sine', 0.3), 0);
    setTimeout(() => this.playTone(600, 0.15, 'sine', 0.25), 80);
    setTimeout(() => this.playTone(400, 0.18, 'sine', 0.2), 140);
  }

  click() {
    if (!this.enabled) return;
    this.init();

    // Very subtle pop
    this.playTone(1200, 0.05, 'sine', 0.15);
  }

  buttonClick() {
    if (!this.enabled) return;
    this.init();

    // Tiny click
    this.playTone(800, 0.04, 'triangle', 0.12);
  }

  downloadStart() {
    if (!this.enabled) return;
    this.init();

    // Quick ascending swoosh
    setTimeout(() => this.playTone(500, 0.1, 'sine', 0.35), 0);
    setTimeout(() => this.playTone(700, 0.12, 'sine', 0.3), 60);
  }

  downloadComplete() {
    if (!this.enabled) return;
    this.init();

    // Two-note ding
    setTimeout(() => this.playTone(880, 0.2, 'sine', 0.4), 0);
    setTimeout(() => this.playTone(1175, 0.3, 'sine', 0.35), 150);
  }

  error() {
    if (!this.enabled) return;
    this.init();

    // Low warning tone
    setTimeout(() => this.playTone(300, 0.15, 'triangle', 0.4), 0);
    setTimeout(() => this.playTone(250, 0.2, 'triangle', 0.35), 120);
  }

  navigate() {
    if (!this.enabled) return;
    this.init();

    // Soft transition
    this.playTone(600, 0.08, 'sine', 0.2);
  }

  success() {
    if (!this.enabled) return;
    this.init();

    // Gentle success chime
    setTimeout(() => this.playTone(660, 0.15, 'sine', 0.3), 0);
    setTimeout(() => this.playTone(880, 0.2, 'sine', 0.28), 100);
  }
}

// Create global instance
const sound = new SoundSystem();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = sound;
}
