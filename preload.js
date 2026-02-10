const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Events from main
  onSetLight: (callback) => ipcRenderer.on('set-light', (e, color) => callback(color)),
  onFlashYellow: (callback) => ipcRenderer.on('flash-yellow', (e, state) => callback(state)),
  onTimerStarted: (callback) => ipcRenderer.on('timer-started', () => callback()),
  onTimerStopped: (callback) => ipcRenderer.on('timer-stopped', () => callback()),
  onTimerCleared: (callback) => ipcRenderer.on('timer-cleared', () => callback()),
  onTimerPaused: (callback) => ipcRenderer.on('timer-paused', () => callback()),
  onTimerResumed: (callback) => ipcRenderer.on('timer-resumed', () => callback()),
  onTimerTick: (callback) => ipcRenderer.on('timer-tick', (e, data) => callback(data)),
  onTimerCompleted: (callback) => ipcRenderer.on('timer-completed', () => callback()),
  
  // Methods to main
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateTimerConfig: (config) => ipcRenderer.invoke('update-timer-config', config),
  clearTimer: () => ipcRenderer.invoke('clear-timer'),
  pauseTimer: () => ipcRenderer.invoke('pause-timer'),
  startRebind: (color) => ipcRenderer.invoke('start-rebind', color),
  completeRebind: (data) => ipcRenderer.invoke('complete-rebind', data),
  cancelRebind: () => ipcRenderer.invoke('cancel-rebind'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('set-always-on-top', value)
});