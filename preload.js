const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scribe', {
  init: () => ipcRenderer.invoke('app:init'),
  manifest: () => ipcRenderer.invoke('app:manifest'),
  assetText: (rel) => ipcRenderer.invoke('app:asset-text', rel),
  setDirty: (d) => ipcRenderer.send('app:set-dirty', d),
  quit: () => ipcRenderer.send('app:quit'),
  toggleFullscreen: () => ipcRenderer.send('app:toggle-fullscreen'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  onCloseRequested: (fn) => ipcRenderer.on('app:close-requested', () => fn()),
  onOpenPath: (fn) => ipcRenderer.on('app:open-path', (_e, p) => fn(p)),

  update: {
    check: (force) => ipcRenderer.invoke('update:check', force),
    skip: (v) => ipcRenderer.invoke('update:skip', v),
    fetchAndInstall: () => ipcRenderer.invoke('update:fetch-and-install'),
    onProgress: (fn) => ipcRenderer.on('update:progress', (_e, p) => fn(p)),
  },
  version: () => ipcRenderer.invoke('app:version'),
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    addShelf: (name) => ipcRenderer.invoke('library:add-shelf', name),
    reveal: (p) => ipcRenderer.invoke('library:reveal', p),
    chooseRoot: () => ipcRenderer.invoke('library:choose-root'),
  },
  tome: {
    save: (target, payload) => ipcRenderer.invoke('tome:save', { target, payload }),
    exists: (shelf, filename) => ipcRenderer.invoke('tome:exists', { shelf, filename }),
    saveDialog: (suggested) => ipcRenderer.invoke('tome:save-dialog', suggested),
    openDialog: () => ipcRenderer.invoke('tome:open-dialog'),
    open: (p, words) => ipcRenderer.invoke('tome:open', p, words),
  },
  fonts: {
    list: () => ipcRenderer.invoke('fonts:list'),
    read: (id) => ipcRenderer.invoke('fonts:read', id),
    import: () => ipcRenderer.invoke('fonts:import'),
  },
});
