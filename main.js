const { app, BrowserWindow } = require('electron');
const serveModule = require('electron-serve');
const serve = serveModule.default || serveModule;
const path = require('path');
const fs = require('fs');

const outDir = path.join(__dirname, 'out');
const hasOutDir = fs.existsSync(path.join(outDir, 'index.html'));

// Always register electron-serve scheme before app.whenReady()
const appServe = serve({
  directory: outDir
});

const createWindow = async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Domain Masker',
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.setMenuBarVisibility(false);

  if (app.isPackaged || hasOutDir) {
    try {
      await appServe(win);
    } catch (err) {
      console.error('Failed to serve via electron-serve, trying fallback file:', err);
      const indexPath = path.join(outDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        win.loadFile(indexPath);
      } else {
        win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
          <!DOCTYPE html>
          <html>
            <head><title>Domain Masker</title></head>
            <body style="font-family:system-ui,-apple-system,sans-serif;padding:50px;background:#1c1917;color:#f5f5f4;text-align:center;">
              <h1 style="color:#818cf8;">Domain Masker</h1>
              <p style="font-size:16px;color:#a8a29e;">Frontend export was not found in <code>out/index.html</code>.</p>
              <div style="margin-top:20px;padding:15px;background:#292524;border-radius:8px;display:inline-block;text-align:left;">
                <p style="margin:0 0 10px 0;font-weight:bold;color:#fbbf24;">To fix this:</p>
                <ol style="margin:0;padding-left:20px;color:#d6d3d1;">
                  <li>Run <code>build.bat</code> to export and build the application</li>
                  <li>Or run <code>npm run build:export</code> in this directory</li>
                  <li>Then relaunch the application</li>
                </ol>
              </div>
            </body>
          </html>
        `));
      }
    }
  } else {
    // Development mode
    try {
      await win.loadURL('http://localhost:3000');
    } catch (e) {
      console.error('Failed to connect to dev server on http://localhost:3000:', e);
      win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <!DOCTYPE html>
        <html>
          <head><title>Domain Masker - Dev Mode</title></head>
          <body style="font-family:system-ui,-apple-system,sans-serif;padding:50px;background:#1c1917;color:#f5f5f4;text-align:center;">
            <h1 style="color:#818cf8;">Domain Masker - Dev Mode</h1>
            <p style="font-size:16px;color:#a8a29e;">Could not connect to the local Next.js development server at <code>http://localhost:3000</code>.</p>
            <div style="margin-top:20px;padding:15px;background:#292524;border-radius:8px;display:inline-block;text-align:left;">
              <p style="margin:0 0 10px 0;font-weight:bold;color:#fbbf24;">Please choose one:</p>
              <ul style="margin:0;padding-left:20px;color:#d6d3d1;">
                <li>Start the dev server: <code>npm run dev</code></li>
                <li>Or build the standalone app: double-click <code>build.bat</code></li>
              </ul>
            </div>
          </body>
        </html>
      `));
    }
    win.webContents.openDevTools();
  }
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

