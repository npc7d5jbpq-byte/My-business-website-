// Electron entry point: wraps the Express app (server.js) in a native
// desktop window, so the office can just double-click an icon instead of
// running a server and opening a browser.

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Everything the business actually cares about (colonies, plots, payments,
// etc.) lives under Electron's per-user "userData" folder, NOT inside the
// installed app folder — that survives app updates/reinstalls and never
// needs admin/write access to Program Files.
const userDataDir = app.getPath('userData');
const dataDir = path.join(userDataDir, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

process.env.DATA_DIR = dataDir;
// A fresh random session secret each launch is fine for a single-machine
// desktop app — it just means signing back in after fully closing the app.
process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
process.env.COOKIE_SECURE = 'false';

// server.js (and everything it requires, including src/db.js and
// src/backup.js) reads these env vars when it's required below, so they
// must be set before this line.
const { start } = require('../server');
const backup = require('../src/backup');

let mainWindow = null;
let serverHandle = null;

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Backup Data As…',
          click: backupData,
        },
        {
          label: 'Open Data Folder',
          click: () => shell.openPath(dataDir),
        },
        { type: 'separator' },
        {
          label: 'Backups && Restore…',
          click: () => mainWindow && mainWindow.loadURL(`${serverHandle.url}/backups.html`),
        },
        {
          label: 'Open Automatic Backups Folder',
          click: () => shell.openPath(backup.BACKUPS_DIR),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function backupData() {
  const dbFile = path.join(dataDir, 'db.json');
  if (!fs.existsSync(dbFile)) {
    dialog.showMessageBox(mainWindow, { type: 'info', message: 'No data has been saved yet — nothing to back up.' });
    return;
  }
  const defaultName = `gulberg-city-office-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Backup Data',
    defaultPath: defaultName,
    filters: [{ name: 'JSON Backup', extensions: ['json'] }],
  });
  if (canceled || !filePath) return;
  fs.copyFileSync(dbFile, filePath);
  dialog.showMessageBox(mainWindow, { type: 'info', message: `Backup saved to:\n${filePath}` });
}

async function createWindow() {
  try {
    serverHandle = await start(0); // port 0 = let the OS pick a free local port
  } catch (err) {
    dialog.showErrorBox('Failed to start', `The application could not start its local server:\n${err.message}`);
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'Gulberg City Office',
    backgroundColor: '#0f1a2e',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(true);
  mainWindow.loadURL(`${serverHandle.url}/login.html`);

  // Any attempt to open a link in a new window (there are none today, but
  // just in case) goes to the OS browser instead of a second app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Capture a final snapshot of anything edited since the last scheduled
  // backup before the app (and its embedded server) actually shuts down.
  backup.backupOnShutdown();
  if (serverHandle) serverHandle.server.close();
  app.quit();
});
