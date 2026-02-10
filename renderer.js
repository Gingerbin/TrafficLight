console.log('Renderer loaded');

let currentLight = 'off';
let timerActive = false;
let timerPaused = false;
let rebindingColor = null;
let rebindingCountdown = null;
let currentHotkeys = {};

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM ready');
  
  try {
    await loadSettings();
    setupEventListeners();
    setupIPC();
    console.log('Setup complete');
  } catch (err) {
    console.error('Setup error:', err);
  }
});

async function loadSettings() {
  try {
    const settings = await window.electronAPI.getSettings();
    console.log('Settings loaded:', settings);
    currentHotkeys = settings.hotkeys;
    
    updateDisplay('key-green', currentHotkeys.green);
    updateDisplay('key-yellow', currentHotkeys.yellow);
    updateDisplay('key-red', currentHotkeys.red);
    updateDisplay('key-timer', currentHotkeys.timer);
    
    document.getElementById('greenDuration').value = settings.timer.greenDuration / 1000;
    document.getElementById('yellowDuration').value = settings.timer.yellowFlashDuration / 1000;
  } catch (err) {
    console.error('Load settings error:', err);
  }
}

function updateDisplay(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setupEventListeners() {
  console.log('Setting up listeners');
  
  // Window controls
  document.getElementById('minimizeBtn').addEventListener('click', () => {
    window.electronAPI.minimizeWindow();
  });
  
  document.getElementById('closeBtn').addEventListener('click', () => {
    window.electronAPI.closeWindow();
  });
  
  document.getElementById('settingsBtn').addEventListener('click', () => {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
  });
  
  document.getElementById('closeSettings').addEventListener('click', closeSettings);
  document.getElementById('settingsModal').addEventListener('click', (e) => {
    if (e.target.id === 'settingsModal') closeSettings();
  });
  
  // Save settings
  document.getElementById('saveSettings').addEventListener('click', async () => {
    const greenDur = parseInt(document.getElementById('greenDuration').value) * 1000;
    const yellowDur = parseInt(document.getElementById('yellowDuration').value) * 1000;
    await window.electronAPI.updateTimerConfig({
      greenDuration: greenDur,
      yellowFlashDuration: yellowDur
    });
    closeSettings();
  });
  
  // Light clicks
  document.querySelectorAll('.light').forEach(light => {
    light.addEventListener('click', () => {
      const color = light.dataset.color;
      console.log('Light clicked:', color);
      setLight(color);
    });
  });
  
  // Pause button
  document.getElementById('pauseBtn').addEventListener('click', async () => {
    console.log('Pause clicked');
    const result = await window.electronAPI.pauseTimer();
    console.log('Pause result:', result);
  });
  
  // Clear timer button
  document.getElementById('clearTimerBtn').addEventListener('click', () => {
    console.log('Clear clicked');
    window.electronAPI.clearTimer();
  });
  
  // Rebinding
  ['green', 'yellow', 'red', 'timer'].forEach(color => {
    document.getElementById(`key-${color}`).addEventListener('click', (e) => {
      e.stopPropagation();
      startRebinding(color);
    });
  });
  
  document.addEventListener('keydown', handleKeyDown);
}

function closeSettings() {
  const modal = document.getElementById('settingsModal');
  modal.classList.remove('active');
  setTimeout(() => {
    if (!modal.classList.contains('active')) {
      modal.style.display = 'none';
    }
  }, 300);
}

function setupIPC() {
  window.electronAPI.onSetLight((color) => {
    console.log('IPC set-light:', color);
    if (color === 'yellow-flash') {
      setLight('yellow', true);
    } else {
      setLight(color);
    }
  });
  
  window.electronAPI.onFlashYellow((state) => {
    const yellow = document.getElementById('light-yellow');
    if (state) yellow.classList.add('active');
    else yellow.classList.remove('active');
  });
  
  window.electronAPI.onTimerStarted(() => {
    timerActive = true;
    timerPaused = false;
    document.getElementById('timerStatus').style.display = 'block';
    document.getElementById('timerPhase').textContent = 'RUNNING';
    updatePauseButton();
  });
  
  window.electronAPI.onTimerStopped(() => {
    timerActive = false;
    timerPaused = false;
    document.getElementById('timerStatus').style.display = 'none';
  });
  
  window.electronAPI.onTimerCleared(() => {
    timerActive = false;
    timerPaused = false;
    document.getElementById('timerStatus').style.display = 'none';
    setLight('off');
  });
  
  window.electronAPI.onTimerPaused(() => {
    timerPaused = true;
    document.getElementById('timerPhase').textContent = 'PAUSED';
    updatePauseButton();
  });
  
  window.electronAPI.onTimerResumed(() => {
    timerPaused = false;
    document.getElementById('timerPhase').textContent = 'RUNNING';
    updatePauseButton();
  });
  
  window.electronAPI.onTimerTick((data) => {
    const seconds = Math.ceil(data.remaining / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    document.getElementById('timerCountdown').textContent = 
      `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    const progress = ((data.total - data.remaining) / data.total) * 100;
    document.getElementById('timerProgress').style.width = `${progress}%`;
    
    const phaseEl = document.getElementById('timerPhase');
    if (timerPaused) {
      phaseEl.textContent = 'PAUSED';
    } else {
      phaseEl.textContent = data.phase === 'green' ? 'GREEN' : 'WARNING';
    }
  });
  
  window.electronAPI.onTimerCompleted(() => {
    timerActive = false;
    timerPaused = false;
    document.getElementById('timerStatus').style.display = 'none';
  });
}

function updatePauseButton() {
  const btn = document.getElementById('pauseBtn');
  if (timerPaused) {
    btn.textContent = '▶';
    btn.title = 'Resume';
  } else {
    btn.textContent = '⏸';
    btn.title = 'Pause';
  }
}

function setLight(color, flashing = false) {
  console.log('Setting light:', color);
  
  document.querySelectorAll('.light').forEach(l => l.classList.remove('active'));
  
  if (color === 'off') {
    currentLight = 'off';
    return;
  }
  
  const lightEl = document.getElementById(`light-${color}`);
  if (lightEl && !flashing) {
    lightEl.classList.add('active');
  }
  currentLight = color;
}

// REBINDING WITH ACTUAL IPC
function startRebinding(color) {
  console.log('Starting rebind for:', color);
  rebindingColor = color;
  
  const overlay = document.getElementById('rebindOverlay');
  overlay.style.display = 'flex';
  document.getElementById('rebindCurrent').textContent = `Current: ${currentHotkeys[color]}`;
  
  let seconds = 10;
  document.getElementById('rebindCountdown').textContent = seconds;
  
  rebindingCountdown = setInterval(() => {
    seconds--;
    document.getElementById('rebindCountdown').textContent = seconds;
    if (seconds <= 0) cancelRebind();
  }, 1000);
  
  // Tell main process to start rebind
  window.electronAPI.startRebind(color);
}

function handleKeyDown(e) {
  if (!rebindingColor) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  if (e.key === 'Escape') {
    cancelRebind();
    return;
  }
  
  // Build combo
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Cmd');
  
  if (e.key.length === 1) {
    parts.push(e.key.toUpperCase());
  } else if (e.key === ' ') {
    parts.push('Space');
  }
  
  if (parts.length > 0 && !['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
    const combo = parts.join('+');
    completeRebind(combo);
  }
}

async function completeRebind(combo) {
  clearInterval(rebindingCountdown);
  
  console.log('Sending complete rebind:', rebindingColor, combo);
  
  const result = await window.electronAPI.completeRebind({
    color: rebindingColor,
    newHotkey: combo
  });
  
  console.log('Rebind result:', result);
  
  if (result.success) {
    currentHotkeys = result.hotkeys;
    updateDisplay(`key-${rebindingColor}`, combo);
    alert(`Hotkey changed to: ${combo}`);
  } else {
    alert('Failed: ' + result.error);
  }
  
  resetRebindUI();
}

function cancelRebind() {
  clearInterval(rebindingCountdown);
  window.electronAPI.cancelRebind();
  resetRebindUI();
}

function resetRebindUI() {
  rebindingColor = null;
  document.getElementById('rebindOverlay').style.display = 'none';
}