const { app, BrowserWindow, shell, dialog, Tray, Menu, nativeImage } = require("electron");
const path = require("path");

// Auto-update groundwork (safe even if you haven't set up updates yet)
let autoUpdater = null;
try {
  autoUpdater = require("electron-updater").autoUpdater;
} catch (_) {
  // If electron-updater is not installed yet, app still works.
}

// Allowed area (anything outside this opens in Chrome/default browser)
const ALLOW_PREFIX = "https://modernforextrading.com/tmft-community/";
const START_URL = ALLOW_PREFIX + "auth-login.php";

// Pages that mean "NOT logged in" (edit/add if your login URL changes)
const LOGGED_OUT_PATTERNS = [
  /auth-login\.php/i,
  /login/i
];

// Local assets
const ICON_PATH = path.join(__dirname, "icon.ico");
const OFFLINE_PATH = path.join(__dirname, "offline.html");

// Helps Windows show correct icon + taskbar grouping
if (process.platform === "win32") {
  app.setAppUserModelId("com.km.tmftdesktop");
}

let mainWindow = null;
let splashWindow = null;
let tray = null;
let forceQuit = false;
let isQuitting = false;

function isLikelyLoggedIn() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  const url = (mainWindow.webContents.getURL() || "").trim();
  if (!url) return false;

  if (!url.startsWith(ALLOW_PREFIX)) return false;
  return !LOGGED_OUT_PATTERNS.some((re) => re.test(url));
}

function blockReloadZoomAndDevtools(win) {
  // Block keyboard shortcuts: reload, zoom, devtools
  win.webContents.on("before-input-event", (event, input) => {
    const key = (input.key || "").toLowerCase();
    const ctrl = input.control || input.meta; // meta for mac
    const shift = input.shift;

    // Reload: Ctrl+R or F5
    if ((ctrl && key === "r") || key === "f5") {
      event.preventDefault();
      return;
    }

    // Zoom: Ctrl+Plus / Ctrl+Minus / Ctrl+0
    if (ctrl && (key === "+" || key === "=" || key === "-" || key === "0")) {
      event.preventDefault();
      return;
    }

    // DevTools: Ctrl+Shift+I or F12
    if ((ctrl && shift && key === "i") || key === "f12") {
      event.preventDefault();
      return;
    }
  });

  // Block zoom via Ctrl + mouse wheel / trackpad zoom gestures
  win.webContents.on("zoom-changed", (event) => {
    event.preventDefault();
  });

  // Force zoom factor back to normal (extra safety)
  try { win.webContents.setZoomFactor(1); } catch (_) {}
  try { win.webContents.setVisualZoomLevelLimits(1, 1); } catch (_) {}
}

function ensureOfflineHtmlExists() {
  // We don't write files here; just warn silently if missing.
  // If offline.html doesn't exist, we will show a dialog instead.
}

function showOfflineUI() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // If you create offline.html, we'll show it.
  // Otherwise, we fall back to a dialog.
  try {
    mainWindow.loadFile(OFFLINE_PATH);
  } catch (_) {
    dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["OK"],
      title: "Offline",
      message: "You appear to be offline.",
      detail: "Please check your internet connection, then reopen the app."
    });
  }
}

function createTray() {
  if (tray) return;

  const icon = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(icon);

  tray.setToolTip("TMFT Desktop");

  const menu = Menu.buildFromTemplate([
    {
      label: "Open TMFT Desktop",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: "Reload",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(START_URL);
        }
      }
    },
    { type: "separator" },
    {
      label: "Exit",
      click: async () => {
        // Respect your "confirm before closing if logged in"
        // by triggering the normal close flow.
        isQuitting = true;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.close();
        } else {
          app.quit();
        }
      }
    }
  ]);

  tray.setContextMenu(menu);

  // Click tray icon to toggle show/hide
  tray.on("click", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function wireAutoUpdate() {
  if (!autoUpdater) return;

  // Optional: uncomment if you want logs later
  // autoUpdater.logger = require("electron-log");
  // autoUpdater.logger.transports.file.level = "info";

  autoUpdater.on("error", (err) => {
    // Keep silent; updates are optional groundwork
    // console.error("Auto-update error:", err);
  });

  autoUpdater.on("update-available", () => {
    // You can show a toast later; keeping quiet for now
  });

  autoUpdater.on("update-downloaded", async () => {
    // Ask user then restart to install
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const result = await dialog.showMessageBox(mainWindow, {
      type: "question",
      buttons: ["Later", "Restart and Install"],
      defaultId: 1,
      cancelId: 0,
      title: "Update ready",
      message: "A TMFT Desktop update is ready.",
      detail: "Restart now to install the update?"
    });

    if (result.response === 1) {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });

  // Safe call: if not configured, it typically just errors silently or no-ops
  try {
    autoUpdater.checkForUpdatesAndNotify();
  } catch (_) {}
}

function createWindows() {
  ensureOfflineHtmlExists();

  // =========================
  // SPLASH WINDOW
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
    icon: ICON_PATH,
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
  // MAIN WINDOW
  // =========================
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    center: true,
    show: false,
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    transparent: false,
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Hard-remove menu
  mainWindow.setMenu(null);

  // Tray: create once main window exists
  createTray();

  // Disable reload/zoom/devtools shortcuts
  blockReloadZoomAndDevtools(mainWindow);

  // Start hidden + fade in
  mainWindow.setOpacity(0);
  mainWindow.loadURL(START_URL);

  // External links: target=_blank / window.open
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

  // ========= OFFLINE DETECTION =========
  // If the page fails to load due to network/DNS/etc, show offline screen.
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // errorCode < 0 usually indicates network failure
    if (isMainFrame) {
      // Close splash if still visible so user isn't stuck
      if (splashWindow && !splashWindow.isDestroyed()) {
        try {
          splashWindow.setAlwaysOnTop(false);
          splashWindow.close();
        } catch (_) {}
        splashWindow = null;
      }

      // Show an offline UI/page
      showOfflineUI();
    }
  });

  // ========= TRANSITION LOGIC =========
  let transitioned = false;

  function transitionToMain() {
    if (transitioned || !mainWindow || mainWindow.isDestroyed()) return;
    transitioned = true;

    mainWindow.show();
    mainWindow.focus();

    let opacity = 0;
    const step = 0.08;
    const timer = setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return clearInterval(timer);

      opacity = Math.min(1, opacity + step);
      mainWindow.setOpacity(opacity);

      if (opacity >= 1) {
        clearInterval(timer);

        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.setAlwaysOnTop(false);
          splashWindow.close();
          splashWindow = null;
        }
      }
    }, 16);
  }

  mainWindow.webContents.once("did-finish-load", transitionToMain);
  setTimeout(() => transitionToMain(), 6000);

  // ========= TRAY: MINIMIZE TO TRAY =========
  mainWindow.on("minimize", (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  // Optional: when user clicks the X, minimize to tray instead of exiting
  // BUT still respect your "confirm before closing if logged in" if they truly exit.
  mainWindow.on("close", async (event) => {
    // If we're quitting intentionally (tray Exit / update install), proceed
    if (isQuitting) return;

    // If user clicked X: minimize to tray instead of closing
    // (Feels like Discord/Slack)
    event.preventDefault();
    mainWindow.hide();

    // One-time tip (optional): comment out if you don't want it
    // tray?.displayBalloon?.({ title: "TMFT Desktop", content: "Still running in the tray." });
  });

  // ========= CONFIRM BEFORE EXITING (Tray Exit or app quit) =========
  // We implement this in app.before-quit so it only triggers on real exits.
  app.on("before-quit", async (event) => {
    if (forceQuit) return;

    // If user is likely logged in, confirm
    if (isLikelyLoggedIn()) {
      event.preventDefault();

      const result = await dialog.showMessageBox(mainWindow, {
        type: "question",
        buttons: ["Cancel", "Exit"],
        defaultId: 0,
        cancelId: 0,
        title: "Exit TMFT Desktop?",
        message: "You appear to be logged in.",
        detail: "Exiting will close TMFT Desktop on this device. Do you want to exit now?"
      });

      if (result.response === 1) {
        forceQuit = true;
        isQuitting = true;
        app.quit();
      }
    } else {
      // Not logged in: allow quit
      forceQuit = true;
    }
  });

  // Cleanup
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    splashWindow = null;

    if (tray) {
      try { tray.destroy(); } catch (_) {}
      tray = null;
    }
  });

  // Auto-update groundwork (non-blocking)
  wireAutoUpdate();
}

app.whenReady().then(createWindows);

app.on("window-all-closed", () => {
  // With tray apps, we typically keep running in background on Windows.
  // We'll NOT quit here to preserve tray behavior.
  // If you want it to quit when all windows closed on Windows, uncomment next line:
  // if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
});
