const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
    const win = new BrowserWindow({
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

    win.setTitle("Di PseudoFlow Logics");
    win.loadFile("index.html");
}

app.whenReady().then(() => {
    createWindow();

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