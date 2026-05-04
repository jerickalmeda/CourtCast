'use strict';

const STORAGE_KEYS = {
  runtime: 'cc_runtime_v1',
  positions: 'cc_positions',
  fontSizes: 'cc_font_sizes',
};

const urlParams = new URLSearchParams(window.location.search);
const isDisplayMode = urlParams.get('mode') === 'display';

const THEMES = {
  'classic-dark': {
    appBg: '#09090b',
    bgTop: '#18181b',
    bgBottom: '#050505',
    bgGlow: 'rgba(255, 255, 255, 0.06)',
    appFg: '#f5f5f5',
    surface: 'rgba(24, 24, 27, 0.92)',
    surfaceBorder: 'rgba(82, 82, 91, 0.72)',
    surfaceMuted: 'rgba(39, 39, 42, 0.92)',
    mutedText: '#9ca3af',
    panelGlow: 'rgba(15, 23, 42, 0.45)',
  },
  'arena-white': {
    appBg: '#f5f5f4',
    bgTop: '#ffffff',
    bgBottom: '#e7edf6',
    bgGlow: 'rgba(148, 163, 184, 0.18)',
    appFg: '#111827',
    surface: 'rgba(255, 255, 255, 0.94)',
    surfaceBorder: 'rgba(203, 213, 225, 0.95)',
    surfaceMuted: 'rgba(241, 245, 249, 0.95)',
    mutedText: '#475569',
    panelGlow: 'rgba(148, 163, 184, 0.22)',
  },
  'court-wood': {
    appBg: '#3a2410',
    bgTop: '#7c4a21',
    bgBottom: '#2f1807',
    bgGlow: 'rgba(251, 191, 36, 0.12)',
    appFg: '#fef3c7',
    surface: 'rgba(92, 51, 23, 0.88)',
    surfaceBorder: 'rgba(180, 128, 74, 0.82)',
    surfaceMuted: 'rgba(120, 69, 33, 0.88)',
    mutedText: '#fcd9a5',
    panelGlow: 'rgba(68, 35, 15, 0.4)',
  },
};

// ─── STATE ────────────────────────────────────────────────────────────────────

const state = {
  homeScore: 0,
  awayScore: 0,
  homeFouls: 0,
  awayFouls: 0,
  homeTimeouts: 5,
  awayTimeouts: 5,
  period: 1,
  running: false,
  editMode: false,
  modalOpen: false,
  muted: false,
  possession: 'off',
  awaitingAdvance: false,
  theme: 'classic-dark',
  customBackground: {
    start: '#1a1a1a',
    end: '#050505',
    mode: 'gradient',
    imageUrl: '',
    overlayOpacity: 0.28,
  },
  teamLogos: {
    home: '',
    away: '',
  },
  gameLog: [],
  config: {
    homeName: 'HOME',
    awayName: 'AWAY',
    homeColor: '#3b82f6',
    awayColor: '#ef4444',
    periods: 4,
    periodDuration: 10,
    shotClockFull: 24,
    shotClockOffensive: 14, // seconds
    teamTimeouts: 5,
  },
  hydrated: false,
};

if (isDisplayMode) {
  document.body.classList.add('display-only');
}

// ─── ACCURATE TIMER ───────────────────────────────────────────────────────────

class AccurateTimer {
  constructor({ onTick, onExpire }) {
    this.onTick = onTick;
    this.onExpire = onExpire;
    this.endTime = null;
    this.remaining = 0;
    this.running = false;
    this._rafId = null;
  }

  start(remainingMs) {
    if (remainingMs !== undefined) this.remaining = remainingMs;
    if (this.remaining <= 0) { this.onExpire(); return; }
    this.endTime = Date.now() + this.remaining;
    this.running = true;
    this._schedule();
  }

  pause() {
    if (!this.running) return;
    this.remaining = Math.max(0, this.endTime - Date.now());
    this.running = false;
    cancelAnimationFrame(this._rafId);
  }

  reset(ms) {
    this.pause();
    this.remaining = ms;
    this.onTick(ms);
  }

  getRemaining() {
    if (this.running) return Math.max(0, this.endTime - Date.now());
    return this.remaining;
  }

  _schedule() {
    this._rafId = requestAnimationFrame(() => this._tick());
  }

  _tick() {
    if (!this.running) return;
    const rem = this.endTime - Date.now();
    if (rem <= 0) {
      this.remaining = 0;
      this.running = false;
      this.onTick(0);
      this.onExpire();
      return;
    }
    this.onTick(rem);
    this._schedule();
  }
}

// ─── AUDIO BUZZER (Web Audio API — no file required) ─────────────────────────

function playBuzzer(type) {
  if (state.muted) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // A basketball-style horn sounds more like a dense electric buzz than a pure tone.
    // Layer saw/square waves with slight detune and subtle tremolo.
    const isShot = type === 'shot';
    const duration = isShot ? 0.42 : 1.35;
    const baseFreq = isShot ? 430 : 365;
    const stopAt = ctx.currentTime + duration;

    const master = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const compressor = ctx.createDynamicsCompressor();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3600, ctx.currentTime);
    filter.Q.setValueAtTime(0.7, ctx.currentTime);

    compressor.threshold.setValueAtTime(-18, ctx.currentTime);
    compressor.knee.setValueAtTime(10, ctx.currentTime);
    compressor.ratio.setValueAtTime(5, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.12, ctx.currentTime);

    master.gain.setValueAtTime(0.001, ctx.currentTime);
    master.gain.linearRampToValueAtTime(isShot ? 0.34 : 0.42, ctx.currentTime + 0.03);
    master.gain.setValueAtTime(isShot ? 0.34 : 0.42, stopAt - 0.08);
    master.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    master.connect(filter);
    filter.connect(compressor);
    compressor.connect(ctx.destination);

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const oscC = ctx.createOscillator();

    oscA.type = 'sawtooth';
    oscB.type = 'square';
    oscC.type = 'sawtooth';

    oscA.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    oscB.frequency.setValueAtTime(baseFreq * 1.01, ctx.currentTime);
    oscC.frequency.setValueAtTime(baseFreq * 0.5, ctx.currentTime);

    const gA = ctx.createGain();
    const gB = ctx.createGain();
    const gC = ctx.createGain();
    gA.gain.value = 0.6;
    gB.gain.value = 0.42;
    gC.gain.value = 0.25;

    oscA.connect(gA);
    oscB.connect(gB);
    oscC.connect(gC);
    gA.connect(master);
    gB.connect(master);
    gC.connect(master);

    // Subtle vibrato/tremolo for that gym-horn character.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(isShot ? 26 : 18, ctx.currentTime);
    lfoGain.gain.setValueAtTime(isShot ? 8 : 12, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(oscA.frequency);

    oscA.start();
    oscB.start();
    oscC.start();
    lfo.start();

    oscA.stop(stopAt);
    oscB.stop(stopAt);
    oscC.stop(stopAt);
    lfo.stop(stopAt);
  } catch (e) {
    // Browser may block AudioContext before user interaction — silently skip
    console.warn('Buzzer unavailable:', e);
  }
}

// ─── CLOCK INSTANCES ──────────────────────────────────────────────────────────

const gameTimer = new AccurateTimer({
  onTick: renderGameClock,
  onExpire() {
    playBuzzer('period');
    state.running = false;
    shotTimer.pause();
    addLog(`End of ${getPeriodLabel()} ${state.period}`);
    if (state.period < state.config.periods) {
      showAutoAdvanceOverlay();
    } else {
      updateStatus('Game Over - Press M for summary or print export');
    }
  },
});

const shotTimer = new AccurateTimer({
  onTick: renderShotClock,
  onExpire() {
    playBuzzer('shot');
    flashShotClock();
    gameTimer.pause();
    state.running = false;
    addLog('Shot clock violation');
    updateStatus('Shot Clock Violation — Press Z to reset, then Space to resume');
  },
});

// ─── RENDER ───────────────────────────────────────────────────────────────────

function renderGameClock(ms) {
  const el = document.getElementById('game-clock');
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;

  if (ms < 60000) {
    const tenths = Math.floor((ms % 1000) / 100);
    el.textContent = `${pad(mins)}:${pad(secs)}.${tenths}`;
  } else {
    el.textContent = `${pad(mins)}:${pad(secs)}`;
  }
}

function renderShotClock(ms) {
  const el = document.getElementById('shot-clock');
  const totalSec = Math.ceil(ms / 1000);

  if (ms <= 0) {
    el.textContent = '00';
  } else if (ms < 10000) {
    const tenths = Math.floor((ms % 1000) / 100);
    el.textContent = `${totalSec}.${tenths}`;
  } else {
    el.textContent = pad(totalSec);
  }

  // Visual urgency: amber → red under 5 s
  if (ms > 0 && ms <= 5000) {
    el.style.color = '#ef4444';
  } else {
    el.style.color = 'rgb(251 191 36)'; // amber-400
  }
}

function flashShotClock() {
  const el = document.getElementById('shot-clock');
  let count = 0;
  const iv = setInterval(() => {
    el.style.opacity = el.style.opacity === '0' ? '1' : '0';
    if (++count >= 8) { clearInterval(iv); el.style.opacity = '1'; }
  }, 120);
}

function renderScores() {
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('home-score', state.homeScore);
  setText('away-score', state.awayScore);
  setText('home-foul-count', state.homeFouls);
  setText('away-foul-count', state.awayFouls);
  setText('home-timeout-count', state.homeTimeouts);
  setText('away-timeout-count', state.awayTimeouts);
  setText('modal-home-score', state.homeScore);
  setText('modal-away-score', state.awayScore);
  setText('modal-home-fouls', state.homeFouls);
  setText('modal-away-fouls', state.awayFouls);
  setText('modal-home-timeouts', state.homeTimeouts);
  setText('modal-away-timeouts', state.awayTimeouts);
}

function renderTeams() {
  const { homeName, awayName, homeColor, awayColor, periods } = state.config;
  const root = document.documentElement;

  root.style.setProperty('--home-color', homeColor);
  root.style.setProperty('--away-color', awayColor);

  document.getElementById('home-name').textContent = homeName.toUpperCase();
  document.getElementById('away-name').textContent = awayName.toUpperCase();
  document.getElementById('modal-home-name').textContent = homeName.toUpperCase();
  document.getElementById('modal-away-name').textContent = awayName.toUpperCase();

  document.getElementById('home-color-hex').textContent = homeColor;
  document.getElementById('away-color-hex').textContent = awayColor;

  document.getElementById('period-label').textContent = getPeriodLabel();
  document.getElementById('period-number').textContent = state.period;

  if (state.period > periods) state.period = periods;
}

function renderLogos() {
  renderLogo('home');
  renderLogo('away');
}

function renderLogo(team) {
  const el = document.getElementById(`${team}-logo`);
  const preview = document.getElementById(`${team}-logo-preview`);
  const src = state.teamLogos[team];
  if (src) {
    el.src = src;
    el.classList.remove('hidden');
    if (preview) {
      preview.src = src;
      preview.classList.remove('hidden');
    }
  } else {
    el.removeAttribute('src');
    el.classList.add('hidden');
    if (preview) {
      preview.removeAttribute('src');
      preview.classList.add('hidden');
    }
  }
}

function renderPossession() {
  const arrow = document.getElementById('possession-arrow');
  if (!arrow) return;

  const side = state.possession === 'away' ? 'away' : 'home';
  arrow.classList.add('possession-arrow-active');
  arrow.classList.toggle('possession-arrow-left', side === 'home');
  arrow.setAttribute('aria-pressed', 'true');
  arrow.setAttribute('aria-label', side === 'home' ? 'Home possession. Click to switch to away.' : 'Away possession. Click to switch to home.');
}

function setPossession(side) {
  if (side !== 'home' && side !== 'away') return;
  state.possession = side;
  renderPossession();
  addLog(`Possession ${state.possession}`);
  persistRuntimeState();
}

function togglePossessionDirection() {
  state.possession = state.possession === 'home' ? 'away' : 'home';
  renderPossession();
  addLog(`Possession ${state.possession}`);
  persistRuntimeState();
}

function renderSoundState() {
  if (isDisplayMode) return;
  const el = document.getElementById('mute-toggle');
  if (!el) return;
  el.textContent = state.muted ? 'Sound Off (B)' : 'Sound On (B)';
  el.classList.toggle('pill-inactive', state.muted);
}

function applyTheme(themeName) {
  const theme = THEMES[themeName] || THEMES['classic-dark'];
  state.theme = themeName in THEMES ? themeName : 'classic-dark';
  state.customBackground.start = theme.bgTop;
  state.customBackground.end = theme.bgBottom;
  if (state.customBackground.mode !== 'image' && state.customBackground.mode !== 'transparent') {
    state.customBackground.mode = 'gradient';
  }

  const root = document.documentElement;
  root.style.setProperty('--app-bg', theme.appBg);
  root.style.setProperty('--bg-top', theme.bgTop);
  root.style.setProperty('--bg-bottom', theme.bgBottom);
  root.style.setProperty('--bg-glow', theme.bgGlow);
  root.style.setProperty('--app-fg', theme.appFg);
  root.style.setProperty('--surface', theme.surface);
  root.style.setProperty('--surface-border', theme.surfaceBorder);
  root.style.setProperty('--surface-muted', theme.surfaceMuted);
  root.style.setProperty('--muted-text', theme.mutedText);
  root.style.setProperty('--panel-glow', theme.panelGlow);

  document.getElementById('theme-classic').classList.toggle('theme-chip-active', state.theme === 'classic-dark');
  document.getElementById('theme-arena').classList.toggle('theme-chip-active', state.theme === 'arena-white');
  document.getElementById('theme-wood').classList.toggle('theme-chip-active', state.theme === 'court-wood');
  updateBackgroundInputs();
  renderBackgroundModeButtons();
  renderAppBackgroundVisual();
}

function renderAppBackgroundVisual() {
  const shell = document.getElementById('app-shell');
  if (!shell) return;
  document.documentElement.style.background = '';

  shell.classList.remove('background-image-mode', 'background-transparent-mode');
  shell.style.background = '';
  shell.style.backgroundImage = '';

  if (state.customBackground.mode === 'transparent') {
    document.documentElement.style.background = 'transparent';
    shell.classList.add('background-transparent-mode');
    return;
  }

  if (state.customBackground.mode === 'image' && state.customBackground.imageUrl) {
    const overlay = clamp(state.customBackground.overlayOpacity || 0.28, 0, 0.85);
    shell.classList.add('background-image-mode');
    shell.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,${overlay}), rgba(0,0,0,${overlay})), url("${state.customBackground.imageUrl}")`;
    return;
  }
}

function renderBackgroundModeButtons() {
  const gradientBtn = document.getElementById('bg-gradient-btn');
  const transparentBtn = document.getElementById('bg-transparent-btn');
  const imageBtn = document.getElementById('bg-image-btn');

  if (!gradientBtn || !transparentBtn || !imageBtn) return;

  gradientBtn.classList.toggle('theme-chip-active', state.customBackground.mode === 'gradient');
  transparentBtn.classList.toggle('theme-chip-active', state.customBackground.mode === 'transparent');
  imageBtn.classList.toggle('theme-chip-active', state.customBackground.mode === 'image');
}

function applyStateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;

  if (typeof snapshot.theme === 'string') state.theme = snapshot.theme;
  if (snapshot.customBackground?.start) state.customBackground.start = snapshot.customBackground.start;
  if (snapshot.customBackground?.end) state.customBackground.end = snapshot.customBackground.end;
  if (snapshot.customBackground?.mode) state.customBackground.mode = snapshot.customBackground.mode;
  if (snapshot.customBackground?.imageUrl !== undefined) state.customBackground.imageUrl = snapshot.customBackground.imageUrl;
  if (Number.isFinite(snapshot.customBackground?.overlayOpacity)) state.customBackground.overlayOpacity = snapshot.customBackground.overlayOpacity;
  if (snapshot.teamLogos?.home !== undefined) state.teamLogos.home = snapshot.teamLogos.home;
  if (snapshot.teamLogos?.away !== undefined) state.teamLogos.away = snapshot.teamLogos.away;

  if (snapshot.config && typeof snapshot.config === 'object') {
    Object.assign(state.config, snapshot.config);
  }

  state.homeScore = Number.isFinite(snapshot.homeScore) ? snapshot.homeScore : state.homeScore;
  state.awayScore = Number.isFinite(snapshot.awayScore) ? snapshot.awayScore : state.awayScore;
  state.homeFouls = Number.isFinite(snapshot.homeFouls) ? snapshot.homeFouls : state.homeFouls;
  state.awayFouls = Number.isFinite(snapshot.awayFouls) ? snapshot.awayFouls : state.awayFouls;
  state.homeTimeouts = Number.isFinite(snapshot.homeTimeouts) ? snapshot.homeTimeouts : state.homeTimeouts;
  state.awayTimeouts = Number.isFinite(snapshot.awayTimeouts) ? snapshot.awayTimeouts : state.awayTimeouts;
  state.period = Number.isFinite(snapshot.period) ? snapshot.period : state.period;
  state.muted = typeof snapshot.muted === 'boolean' ? snapshot.muted : state.muted;
  state.possession = typeof snapshot.possession === 'string' ? snapshot.possession : state.possession;
  state.gameLog = Array.isArray(snapshot.gameLog) ? snapshot.gameLog.slice(0, 100) : state.gameLog;

  applyTheme(state.theme in THEMES ? state.theme : 'classic-dark');
  if (state.theme === 'custom') {
    applyCustomBackground(true);
  }
  renderAppBackgroundVisual();
  renderBackgroundModeButtons();

  renderTeams();
  renderScores();
  renderPossession();
  renderSoundState();
  renderLogos();
  renderGameLog();
  updateShotClockLabels();

  const gameRemaining = Number.isFinite(snapshot.gameRemainingMs)
    ? snapshot.gameRemainingMs
    : state.config.periodDuration * 60 * 1000;
  const shotRemaining = Number.isFinite(snapshot.shotRemainingMs)
    ? snapshot.shotRemainingMs
    : state.config.shotClockFull * 1000;

  gameTimer.reset(Math.max(0, gameRemaining));
  shotTimer.reset(Math.max(0, shotRemaining));

  if (snapshot.running) {
    state.running = true;
    gameTimer.start();
    shotTimer.start();
    updateStatus('Clock running');
  } else {
    state.running = false;
    updateStatus(snapshot.statusText || 'Press Space to Start');
  }
}

function buildStateSnapshot() {
  return {
    theme: state.theme,
    customBackground: { ...state.customBackground },
    teamLogos: { ...state.teamLogos },
    config: { ...state.config },
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    homeFouls: state.homeFouls,
    awayFouls: state.awayFouls,
    homeTimeouts: state.homeTimeouts,
    awayTimeouts: state.awayTimeouts,
    period: state.period,
    muted: state.muted,
    possession: state.possession,
    gameLog: state.gameLog.slice(0, 100),
    running: state.running,
    gameRemainingMs: gameTimer.getRemaining(),
    shotRemainingMs: shotTimer.getRemaining(),
    statusText: document.getElementById('status-text').textContent,
    updatedAt: Date.now(),
  };
}

function persistRuntimeState() {
  if (!state.hydrated) return;
  try {
    localStorage.setItem(STORAGE_KEYS.runtime, JSON.stringify(buildStateSnapshot()));
  } catch (_) {
    // Ignore quota/write errors and continue running without persistence.
  }
}

function loadRuntimeState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.runtime) || 'null');
    if (!saved) return false;
    applyStateSnapshot(saved);
    return true;
  } catch (_) {
    return false;
  }
}

function subscribeCrossWindowSync() {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEYS.runtime && event.newValue) {
      try {
        const snapshot = JSON.parse(event.newValue);
        applyStateSnapshot(snapshot);
      } catch (_) {
        // Ignore malformed snapshots.
      }
      return;
    }

    if ((event.key === STORAGE_KEYS.positions || event.key === STORAGE_KEYS.fontSizes) && !state.editMode) {
      loadPositions();
    }
  });
}

function updateStatus(msg) {
  document.getElementById('status-text').textContent = msg;
}

function getPeriodLabel() {
  if (state.config.periods === 2) return 'Half';
  if (state.config.periods === 4) return 'Quarter';
  return 'Period';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// ─── MASTER PLAY / PAUSE ──────────────────────────────────────────────────────

function masterToggle() {
  if (state.awaitingAdvance) {
    confirmAutoAdvance();
    return;
  }
  if (state.running) {
    gameTimer.pause();
    shotTimer.pause();
    state.running = false;
    updateStatus('Paused - Press Space to resume');
    persistRuntimeState();
  } else {
    if (gameTimer.getRemaining() <= 0) return;
    gameTimer.start();
    shotTimer.start();
    state.running = true;
    updateStatus('Clock running');
    persistRuntimeState();
  }
}

// ─── SCORE & FOULS ────────────────────────────────────────────────────────────

function adjustScore(team, delta) {
  if (delta === 0) return;
  if (team === 'home') {
    state.homeScore = Math.max(0, state.homeScore + delta);
  } else {
    state.awayScore = Math.max(0, state.awayScore + delta);
  }
  renderScores();
  flashScore(team);
  addLog(`${teamLabel(team)} score ${delta > 0 ? '+' : ''}${delta} -> ${team === 'home' ? state.homeScore : state.awayScore}`);
}

function adjustFouls(team, delta) {
  if (delta === 0) return;
  if (team === 'home') {
    state.homeFouls = Math.max(0, state.homeFouls + delta);
  } else {
    state.awayFouls = Math.max(0, state.awayFouls + delta);
  }
  renderScores();
  addLog(`${teamLabel(team)} fouls ${delta > 0 ? '+' : ''}${delta} -> ${team === 'home' ? state.homeFouls : state.awayFouls}`);
}

function adjustTimeouts(team, delta) {
  if (team === 'home') {
    state.homeTimeouts = clamp(state.homeTimeouts + delta, 0, state.config.teamTimeouts);
  } else {
    state.awayTimeouts = clamp(state.awayTimeouts + delta, 0, state.config.teamTimeouts);
  }
  renderScores();
  addLog(`${teamLabel(team)} timeouts ${delta > 0 ? '+' : ''}${delta} -> ${team === 'home' ? state.homeTimeouts : state.awayTimeouts}`);
}

function resetShotClock(mode) {
  const shouldResumeShot = state.running;

  if (mode === 'offensive') {
    shotTimer.reset(state.config.shotClockOffensive * 1000);
    if (shouldResumeShot) shotTimer.start();
    addLog(`Shot clock reset to ${state.config.shotClockOffensive}s`);
    persistRuntimeState();
    return;
  }

  shotTimer.reset(state.config.shotClockFull * 1000);
  if (shouldResumeShot) shotTimer.start();
  addLog(`Shot clock reset to ${state.config.shotClockFull}s`);
  persistRuntimeState();
}

// ─── PERIOD MANAGEMENT ────────────────────────────────────────────────────────

function advancePeriod() {
  if (state.period >= state.config.periods) {
    updateStatus('Game Over');
    if (state.modalOpen) toggleModal();
    return;
  }
  gameTimer.pause();
  shotTimer.pause();
  state.running = false;
  state.period++;
  document.getElementById('period-number').textContent = state.period;
  gameTimer.reset(state.config.periodDuration * 60 * 1000);
  shotTimer.reset(state.config.shotClockFull * 1000);
  hideAutoAdvanceOverlay();
  addLog(`Start of ${getPeriodLabel()} ${state.period}`);
  updateStatus(`${getPeriodLabel()} ${state.period} — Press Space to start`);
  if (state.modalOpen) toggleModal();
}

function fullReset() {
  gameTimer.pause();
  shotTimer.pause();
  state.running = false;
  hideAutoAdvanceOverlay();
  state.homeScore = 0;
  state.awayScore = 0;
  state.homeFouls = 0;
  state.awayFouls = 0;
  state.homeTimeouts = state.config.teamTimeouts;
  state.awayTimeouts = state.config.teamTimeouts;
  state.period = 1;
  state.possession = 'off';
  state.gameLog = [];
  document.getElementById('period-number').textContent = 1;
  gameTimer.reset(state.config.periodDuration * 60 * 1000);
  shotTimer.reset(state.config.shotClockFull * 1000);
  renderScores();
  renderPossession();
  renderGameLog();
  updateStatus('Press Space to Start');
  addLog('Game reset');
  if (state.modalOpen) toggleModal();
}

// ─── SETTINGS MODAL ───────────────────────────────────────────────────────────

function toggleModal() {
  state.modalOpen = !state.modalOpen;
  document.getElementById('modal').classList.toggle('hidden', !state.modalOpen);

  if (state.modalOpen) {
    const c = state.config;
    document.getElementById('input-home-name').value = c.homeName;
    document.getElementById('input-away-name').value = c.awayName;
    document.getElementById('input-home-color').value = c.homeColor;
    document.getElementById('input-away-color').value = c.awayColor;
    document.getElementById('input-periods').value = c.periods;
    document.getElementById('input-period-duration').value = c.periodDuration;
    document.getElementById('input-shot-full').value = c.shotClockFull;
    document.getElementById('input-shot-offensive').value = c.shotClockOffensive;
    document.getElementById('input-team-timeouts').value = c.teamTimeouts;
    updateBackgroundInputs();
  }
}

function applySettings() {
  const c = state.config;
  c.homeName = document.getElementById('input-home-name').value.trim() || 'HOME';
  c.awayName = document.getElementById('input-away-name').value.trim() || 'AWAY';
  c.homeColor = document.getElementById('input-home-color').value;
  c.awayColor = document.getElementById('input-away-color').value;
  c.periods = Math.max(1, parseInt(document.getElementById('input-periods').value) || 4);
  c.periodDuration = Math.max(1, parseInt(document.getElementById('input-period-duration').value) || 10);
  c.shotClockFull = Math.max(1, parseInt(document.getElementById('input-shot-full').value) || 24);
  c.shotClockOffensive = Math.max(1, parseInt(document.getElementById('input-shot-offensive').value) || 14);
  c.teamTimeouts = Math.max(1, parseInt(document.getElementById('input-team-timeouts').value) || 5);

  renderTeams();
  state.homeTimeouts = Math.min(state.homeTimeouts, c.teamTimeouts);
  state.awayTimeouts = Math.min(state.awayTimeouts, c.teamTimeouts);
  renderScores();

  if (!state.running) {
    gameTimer.reset(c.periodDuration * 60 * 1000);
    resetShotClock('full');
  }

  updateShotClockLabels();
  addLog('Settings applied');
  persistRuntimeState();
  toggleModal();
}

function setTheme(themeName) {
  applyTheme(themeName);
  addLog(`Theme changed to ${themeName}`);
  persistRuntimeState();
}

function applyCustomBackground(fromSync = false) {
  const start = fromSync ? state.customBackground.start : document.getElementById('input-bg-start').value;
  const end = fromSync ? state.customBackground.end : document.getElementById('input-bg-end').value;

  state.customBackground.start = start;
  state.customBackground.end = end;
  state.customBackground.mode = 'gradient';
  state.theme = 'custom';

  const root = document.documentElement;
  root.style.setProperty('--bg-top', start);
  root.style.setProperty('--bg-bottom', end);
  root.style.setProperty('--bg-glow', 'rgba(255, 255, 255, 0.08)');

  document.getElementById('theme-classic').classList.remove('theme-chip-active');
  document.getElementById('theme-arena').classList.remove('theme-chip-active');
  document.getElementById('theme-wood').classList.remove('theme-chip-active');
  updateBackgroundInputs();
  renderBackgroundModeButtons();
  renderAppBackgroundVisual();
  if (!fromSync) {
    addLog('Custom background applied');
    persistRuntimeState();
  }
}

function setBackgroundMode(mode) {
  if (!['gradient', 'transparent', 'image'].includes(mode)) return;

  if (mode === 'image' && !state.customBackground.imageUrl) {
    addLog('Upload an image first to use image background mode');
    return;
  }

  state.customBackground.mode = mode;
  renderBackgroundModeButtons();
  renderAppBackgroundVisual();
  addLog(`Background mode: ${mode}`);
  persistRuntimeState();
}

function loadBackgroundImageFromInput(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    state.customBackground.imageUrl = reader.result;
    state.customBackground.mode = 'image';
    renderBackgroundModeButtons();
    renderAppBackgroundVisual();
    addLog('Background image updated');
    persistRuntimeState();
  };
  reader.readAsDataURL(file);
}

function removeBackgroundImage() {
  state.customBackground.imageUrl = '';
  state.customBackground.mode = 'gradient';
  const input = document.getElementById('input-bg-image');
  if (input) input.value = '';
  renderBackgroundModeButtons();
  renderAppBackgroundVisual();
  addLog('Background image removed');
  persistRuntimeState();
}

function toggleMute() {
  state.muted = !state.muted;
  renderSoundState();
  addLog(state.muted ? 'Buzzer muted' : 'Buzzer enabled');
  persistRuntimeState();
}

function togglePossession() {
  togglePossessionDirection();
}

// ─── VISIBILITY TOGGLES ───────────────────────────────────────────────────────

function toggleElementGroup(ids, btnId) {
  // Determine current state from first element
  const first = document.getElementById(ids[0]);
  if (!first) return;
  const nowVisible = !first.classList.contains('hidden');

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', nowVisible);
  });

  if (btnId) {
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.toggle('pill-inactive', nowVisible);
  }

  persistRuntimeState();
}

// ─── AUTO ADVANCE OVERLAY ─────────────────────────────────────────────────────

function showAutoAdvanceOverlay() {
  state.awaitingAdvance = true;
  const overlay = document.getElementById('auto-advance-overlay');
  overlay.classList.remove('hidden');
  overlay.classList.add('flex');
  document.getElementById('auto-advance-title').textContent = `End of ${getPeriodLabel()} ${state.period}`;
  document.getElementById('auto-advance-subtitle').textContent = `Press Space or Enter to start ${getPeriodLabel()} ${state.period + 1}.`;
  document.getElementById('auto-advance-summary').textContent = `${state.config.homeName.toUpperCase()} ${state.homeScore} - ${state.awayScore} ${state.config.awayName.toUpperCase()}`;
  updateStatus(`End of ${getPeriodLabel()} ${state.period}`);
  persistRuntimeState();
}

function hideAutoAdvanceOverlay() {
  state.awaitingAdvance = false;
  const overlay = document.getElementById('auto-advance-overlay');
  overlay.classList.add('hidden');
  overlay.classList.remove('flex');
  persistRuntimeState();
}

function confirmAutoAdvance() {
  if (!state.awaitingAdvance) return;
  advancePeriod();
}

// ─── DRAG & DROP (Edit Mode) ──────────────────────────────────────────────────

const dragState = { el: null, startX: 0, startY: 0, origLeft: 0, origTop: 0 };
const resizeState = { el: null, startX: 0, startY: 0, startWidth: 0, startHeight: 0 };
let editSessionDirty = false;
let editSessionHadCustomLayout = false;

function toggleEditMode() {
  if (isDisplayMode) return;
  const scoreboard = document.getElementById('scoreboard');

  state.editMode = !state.editMode;

  if (state.editMode) {
    editSessionDirty = false;
    editSessionHadCustomLayout = !scoreboard.classList.contains('grid');

    // Ensure children anchor to the scoreboard before any edit-mode absolute rules apply.
    scoreboard.style.position = 'relative';

    // Capture all visual bounds first, then apply absolute positioning.
    // This avoids reflow-induced stacking while iterating.
    const sbRect = scoreboard.getBoundingClientRect();
    const anchors = Array.from(scoreboard.querySelectorAll('.draggable')).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        el,
        left: (r.left - sbRect.left) + 'px',
        top: (r.top - sbRect.top) + 'px',
        width: r.width + 'px',
        height: r.height + 'px',
      };
    });

    anchors.forEach(({ el, left, top, width, height }) => {
      el.style.position = 'absolute';
      el.style.left = left;
      el.style.top = top;
      el.style.width = width;
      el.style.height = height;
      el.style.margin = '0';
      el.style.zIndex = '10';
      ensureResizeHandle(el);
      el.addEventListener('mousedown', onDragStart);
    });

    // Switch container to a free-form canvas
    scoreboard.classList.remove('grid', 'grid-cols-3', 'gap-4');
    document.body.classList.add('edit-mode');
    document.getElementById('edit-banner').classList.remove('hidden');
  } else {
    scoreboard.querySelectorAll('.draggable').forEach(el => {
      el.removeEventListener('mousedown', onDragStart);
    });

    if (editSessionDirty) {
      savePositions();
    } else if (!editSessionHadCustomLayout) {
      // If no custom layout existed and nothing changed, return to the default grid.
      scoreboard.querySelectorAll('.draggable').forEach((el) => {
        el.style.position = '';
        el.style.left = '';
        el.style.top = '';
        el.style.width = '';
        el.style.height = '';
        el.style.margin = '';
        el.style.zIndex = '';
      });
      scoreboard.style.position = '';
      scoreboard.classList.add('grid', 'grid-cols-3', 'gap-4');
    }

    document.body.classList.remove('edit-mode');
    document.getElementById('edit-banner').classList.add('hidden');
  }
}

function onDragStart(e) {
  if (!state.editMode) return;
  if (e.target.closest('.resize-handle') || e.target.closest('.score-clickable')) return;
  dragState.el = e.currentTarget;
  dragState.startX = e.clientX;
  dragState.startY = e.clientY;
  dragState.origLeft = parseInt(dragState.el.style.left) || 0;
  dragState.origTop = parseInt(dragState.el.style.top) || 0;
  dragState.el.classList.add('dragging');

  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);
  e.preventDefault();
}

function ensureResizeHandle(el) {
  if (el.querySelector('.resize-handle')) return;
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'resize-handle';
  handle.title = 'Resize element';
  handle.addEventListener('mousedown', onResizeStart);
  el.appendChild(handle);

  const hint = document.createElement('span');
  hint.className = 'resize-hint';
  hint.textContent = 'Resize';
  el.appendChild(hint);
}

function onResizeStart(e) {
  if (!state.editMode) return;
  e.preventDefault();
  e.stopPropagation();

  resizeState.el = e.currentTarget.parentElement;
  resizeState.startX = e.clientX;
  resizeState.startY = e.clientY;
  resizeState.startWidth = resizeState.el.offsetWidth;
  resizeState.startHeight = resizeState.el.offsetHeight;
  resizeState.el.classList.add('dragging');

  window.addEventListener('mousemove', onResizeMove);
  window.addEventListener('mouseup', onResizeEnd);
}

function onResizeMove(e) {
  if (!resizeState.el) return;
  const nextWidth = clamp(resizeState.startWidth + (e.clientX - resizeState.startX), 96, window.innerWidth);
  const nextHeight = clamp(resizeState.startHeight + (e.clientY - resizeState.startY), 72, window.innerHeight);
  resizeState.el.style.width = `${nextWidth}px`;
  resizeState.el.style.height = `${nextHeight}px`;
  editSessionDirty = true;
}

function onResizeEnd() {
  if (!resizeState.el) return;
  resizeState.el.classList.remove('dragging');
  resizeState.el = null;
  window.removeEventListener('mousemove', onResizeMove);
  window.removeEventListener('mouseup', onResizeEnd);
  persistRuntimeState();
}

function onDragMove(e) {
  if (!dragState.el) return;
  dragState.el.style.left = (dragState.origLeft + e.clientX - dragState.startX) + 'px';
  dragState.el.style.top  = (dragState.origTop  + e.clientY - dragState.startY) + 'px';
  editSessionDirty = true;
}

function onDragEnd() {
  if (!dragState.el) return;
  dragState.el.classList.remove('dragging');
  dragState.el = null;
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', onDragEnd);
  persistRuntimeState();
}

function savePositions() {
  const scoreboard = document.getElementById('scoreboard');
  const positions = {};
  scoreboard.querySelectorAll('.draggable[id]').forEach(el => {
    if (el.style.position === 'absolute') {
      positions[el.id] = {
        left: el.style.left,
        top: el.style.top,
        width: el.style.width,
        height: el.style.height,
      };
    }
  });
  const fontSizes = {};
  document.querySelectorAll('.size-adjustable[id]').forEach(el => {
    if (el.style.fontSize) fontSizes[el.id] = el.style.fontSize;
  });
  try { localStorage.setItem(STORAGE_KEYS.positions, JSON.stringify(positions)); } catch (_) {}
  try { localStorage.setItem(STORAGE_KEYS.fontSizes, JSON.stringify(fontSizes)); } catch (_) {}
  persistRuntimeState();
}

function getDraggableIds() {
  return Array.from(document.querySelectorAll('#scoreboard .draggable[id]')).map((el) => el.id);
}

function loadPositions() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.positions) || 'null');
    if (!saved || Object.keys(saved).length === 0) return false;

    const requiredIds = getDraggableIds();
    const isCompleteLayout = requiredIds.every((id) => saved[id] && saved[id].left && saved[id].top);
    if (!isCompleteLayout) {
      localStorage.removeItem(STORAGE_KEYS.positions);
      localStorage.removeItem(STORAGE_KEYS.fontSizes);
      return false;
    }

    const scoreboard = document.getElementById('scoreboard');
    scoreboard.style.position = 'relative';
    scoreboard.classList.remove('grid', 'grid-cols-3', 'gap-4');

    Object.entries(saved).forEach(([id, pos]) => {
      const el = document.getElementById(id);
      if (!el || !pos.left) return;
      el.style.position = 'absolute';
      el.style.left = pos.left;
      el.style.top = pos.top;
      if (pos.width) el.style.width = pos.width;
      if (pos.height) el.style.height = pos.height;
      el.style.margin = '0';
      el.style.zIndex = '10';
    });
  } catch (_) {
    return false;
  }

  try {
    const fontSizes = JSON.parse(localStorage.getItem(STORAGE_KEYS.fontSizes) || 'null');
    if (!fontSizes) return true;
    Object.entries(fontSizes).forEach(([id, size]) => {
      const el = document.getElementById(id);
      if (el) el.style.fontSize = size;
    });
  } catch (_) {
    return false;
  }

  return true;
}

function resetLayout() {
  try { localStorage.removeItem(STORAGE_KEYS.positions); } catch (_) {}
  try { localStorage.removeItem(STORAGE_KEYS.fontSizes); } catch (_) {}

  const scoreboard = document.getElementById('scoreboard');
  scoreboard.querySelectorAll('.draggable').forEach(el => {
    el.removeEventListener('mousedown', onDragStart);
    el.style.cssText = '';
    const handle = el.querySelector('.resize-handle');
    if (handle) handle.remove();
  });

  document.querySelectorAll('.size-adjustable').forEach(el => {
    el.style.fontSize = '';
  });

  scoreboard.style.position = '';
  scoreboard.classList.add('grid', 'grid-cols-3', 'gap-4');

  state.editMode = false;
  document.body.classList.remove('edit-mode');
  document.getElementById('edit-banner').classList.add('hidden');
  persistRuntimeState();
}

function loadDefaultLayout() {
  resetLayout();
  addLog('Default layout loaded');
  updateStatus('Default layout restored');
}

function handleEditableResize(e) {
  if (!state.editMode || !e.altKey) return;
  const target = e.target.closest('.size-adjustable');
  if (!target) return;
  e.preventDefault();

  const current = parseFloat(window.getComputedStyle(target).fontSize);
  const next = clamp(current + (e.deltaY < 0 ? 3 : -3), 20, 240);
  target.style.fontSize = `${next}px`;
  editSessionDirty = true;
}

// ─── HOTKEYS ──────────────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (isDisplayMode) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (state.awaitingAdvance && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyN')) {
    e.preventDefault();
    confirmAutoAdvance();
    return;
  }

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      masterToggle();
      break;
    case 'KeyZ':
      resetShotClock('full');
      break;
    case 'KeyX':
      resetShotClock('offensive');
      break;
    case 'KeyH':
      adjustScore('home', 1);
      break;
    case 'KeyJ':
      adjustScore('home', -1);
      break;
    case 'KeyK':
      adjustScore('away', 1);
      break;
    case 'KeyL':
      adjustScore('away', -1);
      break;
    case 'KeyQ':
      adjustTimeouts('home', -1);
      break;
    case 'KeyW':
      adjustTimeouts('home', 1);
      break;
    case 'KeyO':
      adjustTimeouts('away', -1);
      break;
    case 'KeyP':
      adjustTimeouts('away', 1);
      break;
    case 'KeyA':
      togglePossession();
      break;
    case 'KeyB':
      toggleMute();
      break;
    case 'KeyE':
      toggleEditMode();
      break;
    case 'KeyM':
      toggleModal();
      break;
  }
});

// ─── LIVE COLOR PREVIEW ───────────────────────────────────────────────────────

document.getElementById('input-home-color').addEventListener('input', (e) => {
  document.documentElement.style.setProperty('--home-color', e.target.value);
  document.getElementById('home-color-hex').textContent = e.target.value;
});

document.getElementById('input-away-color').addEventListener('input', (e) => {
  document.documentElement.style.setProperty('--away-color', e.target.value);
  document.getElementById('away-color-hex').textContent = e.target.value;
});

document.getElementById('input-bg-start').addEventListener('input', (e) => {
  state.customBackground.start = e.target.value;
  document.getElementById('bg-start-hex').textContent = e.target.value;
});

document.getElementById('input-bg-end').addEventListener('input', (e) => {
  state.customBackground.end = e.target.value;
  document.getElementById('bg-end-hex').textContent = e.target.value;
});

document.getElementById('input-bg-image').addEventListener('change', (e) => {
  loadBackgroundImageFromInput(e.target.files[0]);
});

document.getElementById('input-home-logo').addEventListener('change', (e) => {
  loadLogoFromInput('home', e.target.files[0]);
});

document.getElementById('input-away-logo').addEventListener('change', (e) => {
  loadLogoFromInput('away', e.target.files[0]);
});

document.addEventListener('wheel', handleEditableResize, { passive: false });

function bindScorePointerControls() {
  const bindings = [
    ['home-score', 'home'],
    ['away-score', 'away'],
  ];

  bindings.forEach(([id, team]) => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener('mousedown', (e) => {
      if (isDisplayMode || state.editMode) return;

      if (e.button === 0) {
        adjustScore(team, 1);
        e.preventDefault();
      } else if (e.button === 2) {
        adjustScore(team, -1);
        e.preventDefault();
      }
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  });
}

// ─── GAME LOG AND EXPORT ──────────────────────────────────────────────────────

function addLog(message) {
  const stamp = getLogStamp();
  state.gameLog.unshift({ stamp, message });
  state.gameLog = state.gameLog.slice(0, 100);
  renderGameLog();
  persistRuntimeState();
}

function renderGameLog() {
  const container = document.getElementById('game-log');
  if (state.gameLog.length === 0) {
    container.innerHTML = '<div class="event-log-entry py-2 control-muted">No events yet.</div>';
    return;
  }

  container.innerHTML = state.gameLog.map((entry) => (
    `<div class="event-log-entry py-2 flex items-start justify-between gap-3">`
      + `<span class="font-mono control-muted">${escapeHtml(entry.stamp)}</span>`
      + `<span class="text-right">${escapeHtml(entry.message)}</span>`
    + '</div>'
  )).join('');
}

function clearGameLog() {
  state.gameLog = [];
  renderGameLog();
  addLog('Game log cleared');
}

function getLogStamp() {
  const label = getPeriodLabel().charAt(0);
  const remaining = formatClockForLog(gameTimer.getRemaining());
  return `${label}${state.period} ${remaining}`;
}

function formatClockForLog(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${pad(mins)}:${pad(secs)}`;
}

function exportGameSummary() {
  const popup = window.open('', '_blank', 'width=960,height=720');
  if (!popup) return;

  const rows = state.gameLog.map((entry) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #d4d4d8;font-family:monospace;white-space:nowrap;">${escapeHtml(entry.stamp)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d4d4d8;">${escapeHtml(entry.message)}</td>
    </tr>
  `).join('');

  popup.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>CourtCast Summary</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
        h1, h2 { margin: 0 0 12px; }
        .meta { display: grid; grid-template-columns: repeat(2, minmax(180px, 1fr)); gap: 12px; margin: 20px 0 24px; }
        .card { border: 1px solid #d4d4d8; border-radius: 12px; padding: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 18px; }
        .scoreline { font-size: 32px; font-weight: bold; margin: 8px 0 18px; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(state.config.homeName)} vs ${escapeHtml(state.config.awayName)}</h1>
      <div class="scoreline">${state.homeScore} - ${state.awayScore}</div>
      <div class="meta">
        <div class="card"><h2>Home</h2><div>Score: ${state.homeScore}</div><div>Fouls: ${state.homeFouls}</div><div>Timeouts Left: ${state.homeTimeouts}</div></div>
        <div class="card"><h2>Away</h2><div>Score: ${state.awayScore}</div><div>Fouls: ${state.awayFouls}</div><div>Timeouts Left: ${state.awayTimeouts}</div></div>
        <div class="card"><h2>Game</h2><div>Completed Period: ${state.period}</div><div>Theme: ${escapeHtml(state.theme)}</div><div>Shot Clock Full: ${state.config.shotClockFull}s</div></div>
        <div class="card"><h2>Status</h2><div>Possession: ${escapeHtml(state.possession)}</div><div>Sound: ${state.muted ? 'Muted' : 'On'}</div><div>Clock Remaining: ${escapeHtml(formatClockForLog(gameTimer.getRemaining()))}</div></div>
      </div>
      <h2>Game Log</h2>
      <table>
        <thead><tr><th align="left">Stamp</th><th align="left">Event</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="2">No logged events.</td></tr>'}</tbody>
      </table>
      <script>window.onload = function () { window.print(); };</script>
    </body>
    </html>
  `);
  popup.document.close();
}

function loadLogoFromInput(team, file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.teamLogos[team] = reader.result;
    renderLogo(team);
    addLog(`${teamLabel(team)} logo updated`);
    persistRuntimeState();
  };
  reader.readAsDataURL(file);
}

function removeLogo(team) {
  state.teamLogos[team] = '';
  renderLogo(team);
  const input = document.getElementById(`input-${team}-logo`);
  if (input) input.value = '';
  addLog(`${teamLabel(team)} logo removed`);
  persistRuntimeState();
}

function flashScore(team) {
  const el = document.getElementById(`${team}-score`);
  el.classList.remove('score-flash');
  void el.offsetWidth;
  el.classList.add('score-flash');
}

function teamLabel(team) {
  return team === 'home' ? state.config.homeName : state.config.awayName;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function updateShotClockLabels() {
  document.getElementById('toolbar-shot-full').textContent = `${state.config.shotClockFull}s (Z)`;
  document.getElementById('toolbar-shot-offensive').textContent = `${state.config.shotClockOffensive}s (X)`;
}

function updateBackgroundInputs() {
  document.getElementById('input-bg-start').value = state.customBackground.start;
  document.getElementById('input-bg-end').value = state.customBackground.end;
  document.getElementById('bg-start-hex').textContent = state.customBackground.start;
  document.getElementById('bg-end-hex').textContent = state.customBackground.end;
  renderBackgroundModeButtons();
}

function openDisplayView() {
  const url = new URL(window.location.href);
  url.searchParams.set('mode', 'display');
  window.open(url.toString(), '_blank');
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

function init() {
  applyTheme(state.theme);
  gameTimer.reset(state.config.periodDuration * 60 * 1000);
  shotTimer.reset(state.config.shotClockFull * 1000);
  renderTeams();
  renderScores();
  const loadedCustomLayout = loadPositions();
  if (!loadedCustomLayout) {
    const scoreboard = document.getElementById('scoreboard');
    scoreboard.style.position = '';
    scoreboard.classList.add('grid', 'grid-cols-3', 'gap-4');
  }
  renderPossession();
  renderSoundState();
  renderLogos();
  renderGameLog();
  updateShotClockLabels();
  updateStatus('Press Space to Start');
  renderAppBackgroundVisual();
  bindScorePointerControls();

  subscribeCrossWindowSync();
  const restored = loadRuntimeState();

  state.hydrated = true;
  if (!restored) {
    addLog('Scoreboard ready');
  } else {
    updateStatus('State restored from previous session');
  }

  if (!isDisplayMode) {
    setInterval(() => {
      if (state.running) persistRuntimeState();
    }, 1000);
  }

  persistRuntimeState();
}

init();
