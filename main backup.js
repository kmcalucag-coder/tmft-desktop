const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

// Allowed area (anything outside this opens in Chrome/default browser)
const ALLOW_PREFIX = "https://modernforextrading.com/tmft-community/";
const START_URL = ALLOW_PREFIX + "auth-login.php";

let mainWindow = null;
let splashWindow = null;

function createWindows() {
  // =========================
  // SPLASH WINDOW (no taskbar, no scrollbars, centered)
  // =========================
  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    useContentSize: true,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: true,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  splashWindow.once("ready-to-show", () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
  });

  // =========================
  // MAIN WINDOW (normal Windows buttons)
  // =========================
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    center: true,
    show: false,
    frame: true,            // keep window controls
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    transparent: false,     // IMPORTANT: keep false so buttons work normally
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Hard-remove menu
  mainWindow.setMenu(null);

  // Start hidden + fade in
  mainWindow.setOpacity(0);
  mainWindow.loadURL(START_URL);

  // External links: target=_blank
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(ALLOW_PREFIX)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // External links: normal navigation
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ALLOW_PREFIX)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // ========= TRANSITION LOGIC (fixes infinite splash) =========
  let transitioned = false;

  function transitionToMain() {
    if (transitioned || !mainWindow) return;
    transitioned = true;

    // Show main window first, then fade in
    mainWindow.show();
    mainWindow.focus();

    let opacity = 0;
    const step = 0.08;
    const timer = setInterval(() => {
      if (!mainWindow) return clearInterval(timer);

      opacity = Math.min(1, opacity + step);
      mainWindow.setOpacity(opacity);

      if (opacity >= 1) {
        clearInterval(timer);

        // Close splash cleanly
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.setAlwaysOnTop(false);
          splashWindow.close();
          splashWindow = null;
        }
      }
    }, 16);
  }

  // Close splash when the page actually loads (more reliable than ready-to-show)
  mainWindow.webContents.once("did-finish-load", transitionToMain);

  // Fallback: if site is slow / event doesn't fire, still continue after 12s
  setTimeout(() => {
    transitionToMain();
  }, 6000);

  // If load fails, don't get stuck forever
  mainWindow.webContents.on("did-fail-load", () => {
    transitionToMain();
  });

  // Cleanup
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    splashWindow = null;
  });
}

app.whenReady().then(createWindows);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
