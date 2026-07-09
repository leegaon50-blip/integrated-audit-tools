const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getFileHeaders: (filePath) =>
    ipcRenderer.invoke('get-file-headers', filePath),

  runPythonScript: (scriptName, filePath, mapping) =>
    ipcRenderer.invoke('run-python-script', { scriptName, filePath, mapping }),

  onPythonOutput: (callback) =>
    ipcRenderer.on('python-output', (_event, data) => callback(data)),

  onPythonDone: (callback) =>
    ipcRenderer.on('python-done', (_event, result) => callback(result)),

  removeAllListeners: (channel) =>
    ipcRenderer.removeAllListeners(channel),
});
