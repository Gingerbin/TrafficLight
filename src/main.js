import { invoke } from 'https://esm.sh/@tauri-apps/api@2.2.0/core';
import { listen } from 'https://esm.sh/@tauri-apps/api@2.2.0/event';
import { getCurrentWindow } from 'https://esm.sh/@tauri-apps/api@2.2.0/window';

const appWindow = getCurrentWindow();
console.log('Traffic Light App Starting...');

// State
let currentLight = 'off';
let timerActive = false;
let timerPaused = false;
let currentVolume = 0.5;
let timerInterval = null;
let flashInterval = null;
let rebindingAction = null;
let rebindingCountdown = null;

let currentShortcuts = {
  green: 'Alt+G',
  yellow: 'Alt+Y',
  red: 'Alt+R',
  timer: 'Alt+S',
  timerRed: 'Alt+A'
};

let timerState = {
  phase: 'idle',
  timeRemaining: 0,
  config: null,
  mode: 'green'
};

let appSettings = {
  volume: 0.5,
  greenDuration: 30000,
  yellowFlashDuration: 20000,
  timerMode: 'green',
  shortcuts: currentShortcuts
};

// Shortcut listener
async function setupShortcutListener() {
  try {
    await listen('shortcut-triggered', (event) => {
      const action = event.payload;
      console.log('Shortcut received:', action);
      
      switch(action) {
        case 'green':
          if (timerActive) pauseTimer();
          else setLight('green');
          break;
        case 'yellow':
          if (timerActive) pauseTimer();
          else setLight('yellow');
          break;
        case 'red':
          if (timerActive) pauseTimer();
          else setLight('red');
          break;
        case 'timer':
          if (timerActive) togglePause();
          else startTimer('green');
          break;
        case 'timerRed':
          if (timerActive) togglePause();
          else startTimer('red');
          break;
      }
    });
    console.log('Shortcut listener active');
  } catch (e) {
    console.error('Shortcut listener error:', e);
  }
}

// Light control
function setLight(color) {
  console.log('Setting light:', color);
  document.querySelectorAll('.light').forEach(l => l.classList.remove('active'));
  if (color !== 'off') {
    const el = document.getElementById(`light-${color}`);
    if (el) el.classList.add('active');
  }
  currentLight = color;
}

// Settings functions
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('trafficLightSettings') || '{}');
    appSettings = { ...appSettings, ...saved };
    
    currentVolume = appSettings.volume;
    timerState.mode = appSettings.timerMode || 'green';
    
    const volSlider = document.getElementById('volumeSlider');
    const volValue = document.getElementById('volumeValue');
    if (volSlider) volSlider.value = currentVolume * 100;
    if (volValue) volValue.textContent = Math.round(currentVolume * 100) + '%';
    
    const modeGreen = document.getElementById('modeGreen');
    const modeRed = document.getElementById('modeRed');
    if (modeGreen) modeGreen.checked = timerState.mode === 'green';
    if (modeRed) modeRed.checked = timerState.mode === 'red';
    
    const gm = document.getElementById('greenMinutes');
    const gs = document.getElementById('greenSeconds');
    const ym = document.getElementById('yellowMinutes');
    const ys = document.getElementById('yellowSeconds');
    
    if (gm) gm.value = Math.floor(appSettings.greenDuration / 60000);
    if (gs) gs.value = (appSettings.greenDuration % 60000) / 1000;
    if (ym) ym.value = Math.floor(appSettings.yellowFlashDuration / 60000);
    if (ys) ys.value = (appSettings.yellowFlashDuration % 60000) / 1000;
    
    if (appSettings.shortcuts) {
      currentShortcuts = { ...currentShortcuts, ...appSettings.shortcuts };
    }
    updateShortcutDisplays();
    
    invoke('initialize_shortcuts', { shortcuts: currentShortcuts })
      .then(() => console.log('Shortcuts registered'))
      .catch(e => console.error('Shortcut registration error:', e));
      
  } catch (e) {
    console.error('Load settings error:', e);
  }
}

function saveSettings() {
  try {
    const gm = parseInt(document.getElementById('greenMinutes')?.value) || 0;
    const gs = parseInt(document.getElementById('greenSeconds')?.value) || 0;
    const ym = parseInt(document.getElementById('yellowMinutes')?.value) || 0;
    const ys = parseInt(document.getElementById('yellowSeconds')?.value) || 0;
    
    const modeGreen = document.getElementById('modeGreen');
    const selectedMode = modeGreen?.checked ? 'green' : 'red';
    
    appSettings = {
      volume: currentVolume,
      greenDuration: (gm * 60 + gs) * 1000,
      yellowFlashDuration: (ym * 60 + ys) * 1000,
      timerMode: selectedMode,
      shortcuts: currentShortcuts
    };
    
    timerState.mode = selectedMode;
    localStorage.setItem('trafficLightSettings', JSON.stringify(appSettings));
    console.log('Settings saved:', appSettings);
  } catch (e) {
    console.error('Save settings error:', e);
  }
}

// Timer functions
function startTimer(mode) {
  if (timerActive) return;
  console.log('Starting timer in mode:', mode);
  
  timerState.mode = mode;
  timerActive = true;
  timerPaused = false;
  timerState.config = {
    greenDuration: appSettings.greenDuration,
    yellowFlashDuration: appSettings.yellowFlashDuration,
    flashInterval: 500
  };
  
  if (mode === 'green') {
    timerState.phase = 'green';
    timerState.timeRemaining = timerState.config.greenDuration;
    setLight('green');
  } else {
    timerState.phase = 'red';
    timerState.timeRemaining = timerState.config.greenDuration;
    setLight('red');
  }
  
  const controlBar = document.getElementById('controlBar');
  if (controlBar) controlBar.classList.add('active');
  
  updateTimerDisplay();
  timerInterval = setInterval(tick, 100);
}

function tick() {
  if (timerPaused || !timerActive) return;
  
  timerState.timeRemaining -= 100;
  if (timerState.timeRemaining < 0) timerState.timeRemaining = 0;
  
  updateTimerDisplay();
  
  if (timerState.timeRemaining <= 0) {
    clearInterval(timerInterval);
    advancePhase();
  }
}

function advancePhase() {
  console.log('Advancing from:', timerState.phase, 'mode:', timerState.mode);
  clearInterval(timerInterval);
  clearInterval(flashInterval);
  
  if (timerState.phase === 'green' || timerState.phase === 'red') {
    timerState.phase = 'yellow-flash';
    timerState.timeRemaining = timerState.config.yellowFlashDuration;
    startYellowFlash();
    timerInterval = setInterval(tick, 100);
    
  } else if (timerState.phase === 'yellow-flash') {
    stopTimer();
    if (timerState.mode === 'green') {
      setLight('red');
    } else {
      setLight('green');
    }
  }
}

function startYellowFlash() {
  let flashState = true;
  const yellowEl = document.getElementById('light-yellow');
  setLight('off');
  
  flashInterval = setInterval(() => {
    if (!timerPaused && timerActive) {
      flashState = !flashState;
      if (yellowEl) {
        if (flashState) yellowEl.classList.add('active');
        else yellowEl.classList.remove('active');
      }
    }
  }, timerState.config.flashInterval);
  
  playTicker();
}

function updateTimerDisplay() {
  const seconds = Math.max(0, Math.ceil(timerState.timeRemaining / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  const el = document.getElementById('timerCountdown');
  if (el) el.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  
  const phaseEl = document.getElementById('timerPhase');
  if (phaseEl) {
    if (timerPaused) phaseEl.textContent = 'PAUSED';
    else if (timerState.phase === 'green') phaseEl.textContent = 'GREEN';
    else if (timerState.phase === 'red') phaseEl.textContent = 'RED';
    else if (timerState.phase === 'yellow-flash') phaseEl.textContent = 'WARNING';
  }
}

function pauseTimer() {
  if (!timerActive) return;
  timerPaused = true;
  
  // Pause ticker sound if in yellow flash phase
  if (timerState.phase === 'yellow-flash') {
    const audio = document.getElementById('tickerAudio');
    if (audio) audio.pause();
  }
  
  updateTimerDisplay();
}

function resumeTimer() {
  if (!timerActive) return;
  timerPaused = false;
  
  // Resume ticker sound if in yellow flash phase
  if (timerState.phase === 'yellow-flash') {
    const audio = document.getElementById('tickerAudio');
    if (audio) audio.play().catch(e => console.log('Audio resume error:', e));
  }
  
  updateTimerDisplay();
}

function togglePause() {
  if (!timerActive) return;
  if (timerPaused) resumeTimer();
  else pauseTimer();
}

function stopTimer() {
  console.log('Stopping timer');
  timerActive = false;
  timerPaused = false;
  clearInterval(timerInterval);
  clearInterval(flashInterval);
  stopTicker();
  
  const controlBar = document.getElementById('controlBar');
  if (controlBar) controlBar.classList.remove('active');
  
  document.getElementById('timerCountdown').textContent = '00:00';
  const phaseEl = document.getElementById('timerPhase');
  if (phaseEl) phaseEl.textContent = 'READY';
}

function playTicker() {
  const audio = document.getElementById('tickerAudio');
  if (audio) {
    audio.volume = currentVolume;
    audio.currentTime = 0;
    audio.play().catch(e => console.log('Audio error:', e));
  }
}

function stopTicker() {
  const audio = document.getElementById('tickerAudio');
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}

// Rebind functions
function updateShortcutDisplays() {
  Object.keys(currentShortcuts).forEach(action => {
    const btn = document.getElementById(`key-${action}`);
    if (btn) btn.textContent = currentShortcuts[action];
  });
}

function startRebind(action) {
  if (rebindingAction) return;
  rebindingAction = action;
  
  const overlay = document.getElementById('rebindOverlay');
  const countdown = document.getElementById('rebindCountdown');
  const current = document.getElementById('rebindCurrent');
  
  if (overlay) overlay.style.display = 'flex';
  if (countdown) countdown.textContent = '10';
  if (current) current.textContent = `Current: ${currentShortcuts[action]}`;
  
  let timeLeft = 10;
  rebindingCountdown = setInterval(() => {
    timeLeft--;
    if (countdown) countdown.textContent = timeLeft;
    if (timeLeft <= 0) cancelRebind();
  }, 1000);
}

function cancelRebind() {
  if (rebindingCountdown) clearInterval(rebindingCountdown);
  rebindingCountdown = null;
  rebindingAction = null;
  const overlay = document.getElementById('rebindOverlay');
  if (overlay) overlay.style.display = 'none';
}

async function completeRebind(combo) {
  if (!rebindingAction) return;
  clearInterval(rebindingCountdown);
  
  try {
    await invoke('update_shortcut', { action: rebindingAction, newCombo: combo });
    currentShortcuts[rebindingAction] = combo;
    updateShortcutDisplays();
    saveSettings();
  } catch (e) {
    alert('Failed: ' + e);
  }
  
  rebindingAction = null;
  const overlay = document.getElementById('rebindOverlay');
  if (overlay) overlay.style.display = 'none';
}

// Event Handlers
document.addEventListener('keydown', (e) => {
  if (!rebindingAction) return;
  e.preventDefault();
  e.stopPropagation();
  
  if (e.key === 'Escape') {
    cancelRebind();
    return;
  }
  
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Cmd');
  
  if (e.key.length === 1 && e.key.match(/[a-z0-9]/i)) {
    parts.push(e.key.toUpperCase());
  } else if (e.key === ' ') {
    parts.push('Space');
  } else if (['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12','Enter','Tab'].includes(e.key)) {
    parts.push(e.key);
  }
  
  if (parts.length > 0) {
    const last = parts[parts.length - 1];
    if (!['Ctrl','Alt','Shift','Cmd'].includes(last)) {
      completeRebind(parts.join('+'));
    }
  }
});

// UI Setup
function setupUI() {
  console.log('Setting up UI...');
  
  document.getElementById('minimizeBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    appWindow.minimize().catch(e => console.error('Minimize error:', e));
  });
  
  document.getElementById('closeBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    appWindow.close().catch(e => console.error('Close error:', e));
  });
  
  const modal = document.getElementById('settingsModal');
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    if (modal) {
      modal.style.display = 'flex';
      setTimeout(() => modal.classList.add('active'), 10);
    }
  });
  
  document.getElementById('closeSettings')?.addEventListener('click', () => {
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    }
  });
  
  document.getElementById('saveSettings')?.addEventListener('click', () => {
    saveSettings();
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    }
  });
  
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 300);
      }
    });
  }
  
  document.querySelectorAll('.light').forEach(light => {
    light.addEventListener('click', () => {
      setLight(light.dataset.color);
      if (timerActive) pauseTimer();
    });
  });
  
  ['green', 'yellow', 'red', 'timer', 'timerRed'].forEach(action => {
    document.getElementById(`key-${action}`)?.addEventListener('click', (e) => {
      e.stopPropagation();
      startRebind(action);
    });
  });
  
  document.getElementById('volumeSlider')?.addEventListener('input', (e) => {
    currentVolume = e.target.value / 100;
    const volValue = document.getElementById('volumeValue');
    if (volValue) volValue.textContent = e.target.value + '%';
  });
  
  document.getElementById('modeGreen')?.addEventListener('change', () => {
    timerState.mode = 'green';
  });
  
  document.getElementById('modeRed')?.addEventListener('change', () => {
    timerState.mode = 'red';
  });
  
  document.getElementById('timerStartBtn')?.addEventListener('click', () => {
    const mode = document.getElementById('modeRed')?.checked ? 'red' : 'green';
    startTimer(mode);
  });
  
  document.getElementById('pauseBtn')?.addEventListener('click', togglePause);
  document.getElementById('clearTimerBtn')?.addEventListener('click', () => {
    stopTimer();
    setLight('off');
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing app...');
  
  setupUI();
  await setupShortcutListener();
  loadSettings();
});