const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 650,
        backgroundColor: "#0f1117",
        icon: path.join(__dirname, "icon.ico"),

        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.setTitle("Di PseudoFlow Logics");
    mainWindow.loadFile("index.html");
}

function setupAutoUpdater() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("update-available", async () => {
        const result = await dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "Update Available",
            message: "A new version of Di PseudoFlow Logics is available.",
            detail: "Would you like to download the update now?",
            buttons: ["Download Update", "Later"],
            defaultId: 0,
            cancelId: 1
        });

        if (result.response === 0) {
            autoUpdater.downloadUpdate();
        }
    });

    autoUpdater.on("update-downloaded", async () => {
        const result = await dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "Update Ready",
            message: "The update has been downloaded successfully.",
            detail: "Restart Di PseudoFlow Logics now to install the update.",
            buttons: ["Restart and Install", "Later"],
            defaultId: 0,
            cancelId: 1
        });

        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });

    autoUpdater.on("error", (error) => {
        console.error("Auto-update error:", error);
    });

    autoUpdater.checkForUpdates().catch((error) => {
        console.error("Update check failed:", error);
    });
}

app.whenReady().then(() => {
    createWindow();

    setupAutoUpdater();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});