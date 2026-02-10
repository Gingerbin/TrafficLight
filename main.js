const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');

let mainWindow;
let timerState = {
  active: false,
  paused: false,
  phase: 'idle',
  timeRemaining: 0,
  config: {
    greenDuration: 30000,
    yellowFlashDuration: 20000,
    flashInterval: 500
  },
  flashTimer: null,
  countdownTimer: null
};

let hotkeys = {
  green: 'Alt+G',
  yellow: 'Alt+Y',
  red: 'Alt+R',
  timer: 'Alt+S'
};

// Track rebinding state
let rebindingState = {
  active: false,
  color: null,
  originalHotkey: null
};

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: 300,
    height: 600,
    x: width - 320,
    y: 50,
    alwaysOnTop: true,
    resizable: true,
    minimizable: true,
    maximizable: false,
    transparent: true,
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  
  // Better aspect ratio enforcement
  mainWindow.on('resize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [w, h] = mainWindow.getSize();
    // Maintain 1:2 ratio (width:height)
    const targetHeight = Math.round(w * 2);
    if (Math.abs(h - targetHeight) > 5) {
      mainWindow.setSize(w, targetHeight);
    }
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
    stopTimer();
    globalShortcut.unregisterAll();
  });
  
  registerHotkeys();
}

function safeSend(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  
  console.log('Registering hotkeys:', hotkeys);
  
  globalShortcut.register(hotkeys.green, () => {
    if (timerState.active) pauseTimer();
    safeSend('set-light', 'green');
  });
  
  globalShortcut.register(hotkeys.yellow, () => {
    if (timerState.active) pauseTimer();
    safeSend('set-light', 'yellow');
  });
  
  globalShortcut.register(hotkeys.red, () => {
    if (timerState.active) pauseTimer();
    safeSend('set-light', 'red');
  });
  
  globalShortcut.register(hotkeys.timer, () => {
    toggleTimer();
  });
}

function toggleTimer() {
  if (!timerState.active) startTimer();
  else if (timerState.paused) resumeTimer();
  else pauseTimer();
}

function pauseTimerFromUI() {
  if (timerState.active && !timerState.paused) {
    pauseTimer();
  } else if (timerState.active && timerState.paused) {
    resumeTimer();
  }
}

function startTimer() {
  timerState.active = true;
  timerState.paused = false;
  timerState.phase = 'green';
  timerState.timeRemaining = timerState.config.greenDuration;
  
  safeSend('set-light', 'green');
  safeSend('timer-started');
  
  runTimerCountdown();
}

function pauseTimer() {
  timerState.paused = true;
  clearInterval(timerState.countdownTimer);
  clearInterval(timerState.flashTimer);
  safeSend('timer-paused');
}

function resumeTimer() {
  timerState.paused = false;
  runTimerCountdown();
  safeSend('timer-resumed');
}

function stopTimer() {
  timerState.active = false;
  timerState.paused = false;
  timerState.phase = 'idle';
  clearInterval(timerState.countdownTimer);
  clearInterval(timerState.flashTimer);
  safeSend('timer-stopped');
}

function clearTimer() {
  stopTimer();
  safeSend('timer-cleared');
}

function runTimerCountdown() {
  clearInterval(timerState.countdownTimer);
  
  timerState.countdownTimer = setInterval(() => {
    if (timerState.paused) return;
    
    timerState.timeRemaining -= 100;
    
    if (timerState.timeRemaining <= 0) {
      advanceTimerPhase();
    } else {
      safeSend('timer-tick', {
        phase: timerState.phase,
        remaining: timerState.timeRemaining,
        total: timerState.phase === 'green' ? timerState.config.greenDuration : timerState.config.yellowFlashDuration
      });
    }
  }, 100);
}

function advanceTimerPhase() {
  clearInterval(timerState.flashTimer);
  
  if (timerState.phase === 'green') {
    timerState.phase = 'yellow-flash';
    timerState.timeRemaining = timerState.config.yellowFlashDuration;
    safeSend('set-light', 'yellow-flash');
    
    let flashState = true;
    timerState.flashTimer = setInterval(() => {
      if (!timerState.paused) {
        flashState = !flashState;
        safeSend('flash-yellow', flashState);
      }
    }, timerState.config.flashInterval);
    
  } else if (timerState.phase === 'yellow-flash') {
    timerState.phase = 'red';
    timerState.active = false;
    clearInterval(timerState.flashTimer);
    safeSend('set-light', 'red');
    safeSend('timer-completed');
  }
}

// IPC Handlers
ipcMain.handle('get-settings', () => ({
  hotkeys: hotkeys,
  timer: timerState.config
}));

ipcMain.handle('update-timer-config', (event, config) => {
  timerState.config = { ...timerState.config, ...config };
  return true;
});

ipcMain.handle('clear-timer', () => {
  clearTimer();
  return true;
});

ipcMain.handle('pause-timer', () => {
  pauseTimerFromUI();
  return { 
    active: timerState.active, 
    paused: timerState.paused 
  };
});

// ACTUAL REBINDING LOGIC
ipcMain.handle('start-rebind', (event, color) => {
  console.log('Starting rebind for:', color);
  rebindingState.active = true;
  rebindingState.color = color;
  rebindingState.originalHotkey = hotkeys[color];
  
  // Unregister this specific hotkey temporarily
  globalShortcut.unregister(hotkeys[color]);
  
  return true;
});

ipcMain.handle('complete-rebind', (event, { color, newHotkey }) => {
  console.log('Completing rebind:', color, '->', newHotkey);
  
  if (!rebindingState.active || rebindingState.color !== color) {
    return { success: false, error: 'Not in rebind mode' };
  }
  
  try {
    // Check if new hotkey is already registered elsewhere
    if (globalShortcut.isRegistered(newHotkey)) {
      // Re-register original
      registerHotkeys();
      rebindingState.active = false;
      return { success: false, error: 'Hotkey already in use' };
    }
    
    // Test register the new hotkey
    const testSuccess = globalShortcut.register(newHotkey, () => {
      // This is just a test, we'll re-register all properly after
    });
    
    if (!testSuccess) {
      registerHotkeys();
      rebindingState.active = false;
      return { success: false, error: 'Invalid hotkey or already in use' };
    }
    
    globalShortcut.unregister(newHotkey); // Unregister test
    
    // Update the hotkey
    hotkeys[color] = newHotkey;
    rebindingState.active = false;
    
    // Re-register all hotkeys with new one
    registerHotkeys();
    
    console.log('Rebind successful. New hotkeys:', hotkeys);
    return { success: true, hotkeys: hotkeys };
    
  } catch (error) {
    console.error('Rebind error:', error);
    registerHotkeys();
    rebindingState.active = false;
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cancel-rebind', () => {
  console.log('Cancelling rebind');
  rebindingState.active = false;
  rebindingState.color = null;
  registerHotkeys(); // Restore original
  return true;
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

ipcMain.handle('set-always-on-top', (event, value) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(value);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopTimer();
  globalShortcut.unregisterAll();
  app.quit();
});