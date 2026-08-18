const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sapMcpWizard', {
  getInitialState: () => ipcRenderer.invoke('wizard:get-initial-state'),
  getHostedToolCatalog: (url) => ipcRenderer.invoke('wizard:get-hosted-tool-catalog', url),
  save: (draft) => ipcRenderer.invoke('wizard:save', draft),
  openExternal: (url) => ipcRenderer.invoke('wizard:open-external', url),
});
