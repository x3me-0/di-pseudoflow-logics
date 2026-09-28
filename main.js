const {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    shell
} = require("electron");

const path = require("path");
const fs = require("fs");

const { autoUpdater } = require("electron-updater");

let mainWindow;

function releaseNotesText(notes) {
    if (!notes) return "";
    if (typeof notes === "string") return notes;
    if (!Array.isArray(notes)) return String(notes);
    return notes.map(item => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return String(item || "");
        return [item.version ? `Version ${item.version}` : "", item.noteText || item.notes || ""].filter(Boolean).join("\n");
    }).filter(Boolean).join("\n\n");
}

function sendUpdateStatus(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("app:update-status", payload);
    }
}


/* =========================================================
   PROJECT STORAGE
========================================================= */

function getProjectsDirectory() {
    const projectsDirectory = path.join(
        app.getPath("userData"),
        "projects"
    );

    if (!fs.existsSync(projectsDirectory)) {
        fs.mkdirSync(projectsDirectory, {
            recursive: true
        });
    }

    return projectsDirectory;
}


function sanitizeProjectId(projectId) {
    return String(projectId)
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 100);
}


function getProjectFilePath(projectId) {
    const safeId = sanitizeProjectId(projectId);

    if (!safeId) {
        throw new Error("Invalid project ID.");
    }

    return path.join(
        getProjectsDirectory(),
        `${safeId}.json`
    );
}


/* =========================================================
   WINDOW
========================================================= */

function createWindow() {

    mainWindow = new BrowserWindow({

        width: 1400,
        height: 900,

        minWidth: 1000,
        minHeight: 650,

        backgroundColor: "#0f1117",

        icon: path.join(
            __dirname,
            "icon.ico"
        ),

        webPreferences: {

            preload: path.join(
                __dirname,
                "preload.js"
            ),

            contextIsolation: true,

            nodeIntegration: false
        }
    });


    mainWindow.setTitle(
        "Di PseudoFlow Logics"
    );


    mainWindow.loadFile(
        "index.html"
    );
}


/* =========================================================
   PROJECT IPC
========================================================= */


/*
    Get application version
*/

ipcMain.handle(
    "app:get-version",
    () => app.getVersion()
);

ipcMain.handle("app:check-for-updates", async () => {
    try {
        sendUpdateStatus({ status: "checking" });
        const result = await autoUpdater.checkForUpdates();
        const info = result?.updateInfo || {};
        return { success: true, version: info.version || "", releaseNotes: releaseNotesText(info.releaseNotes) };
    } catch (error) {
        sendUpdateStatus({ status: "error", message: error?.message || String(error) });
        return { success: false, error: error?.message || String(error) };
    }
});

ipcMain.handle("export:pdf", async (_event, { svg, title } = {}) => {
    let pdfWindow;
    try {
        if (typeof svg !== "string" || !svg.includes("<svg")) throw new Error("No flowchart image was provided.");
        const safeTitle = String(title || "Flowchart").replace(/[<>:"\/\\|?*]/g, "-").slice(0, 100);
        const target = await dialog.showSaveDialog(mainWindow, {
            title: "Export Flowchart as PDF",
            defaultPath: path.join(app.getPath("downloads"), `${safeTitle}.pdf`),
            filters: [{ name: "PDF document", extensions: ["pdf"] }]
        });
        if (target.canceled || !target.filePath) return { success: false, canceled: true };
        const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:12mm}html,body{margin:0;background:#0b1120}svg{display:block;width:100%;height:auto;max-height:180mm;object-fit:contain}</style></head><body>${svg}</body></html>`;
        pdfWindow = new BrowserWindow({ show: false, width: 1200, height: 850, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        const pdf = await pdfWindow.webContents.printToPDF({ printBackground: true, pageSize: "A4", landscape: true, margins: { marginType: "custom", top: 36, bottom: 36, left: 36, right: 36 } });
        fs.writeFileSync(target.filePath, pdf);
        return { success: true, filePath: target.filePath };
    } catch (error) {
        console.error("PDF export error:", error);
        return { success: false, error: error?.message || "Unable to export PDF." };
    } finally {
        if (pdfWindow && !pdfWindow.isDestroyed()) pdfWindow.destroy();
    }
});


/*
    Save project
*/

ipcMain.handle(
    "project:save",
    async (event, project) => {

        try {

            if (!project || typeof project !== "object") {
                throw new Error(
                    "Invalid project data."
                );
            }


            const projectId =
                sanitizeProjectId(
                    project.id
                    || `project-${Date.now()}`
                );


            const projectToSave = {

                ...project,

                id: projectId,

                modified:
                    new Date().toISOString(),

                created:
                    project.created
                    || new Date().toISOString()
            };


            const filePath =
                getProjectFilePath(
                    projectId
                );


            fs.writeFileSync(
                filePath,
                JSON.stringify(
                    projectToSave,
                    null,
                    4
                ),
                "utf8"
            );


            return {

                success: true,

                project:
                    projectToSave
            };

        } catch (error) {

            console.error(
                "Project save error:",
                error
            );


            return {

                success: false,

                error:
                    error.message
                    || "Unable to save project."
            };
        }
    }
);


/*
    Load project
*/

ipcMain.handle(
    "project:load",
    async (event, projectId) => {

        try {

            const filePath =
                getProjectFilePath(
                    projectId
                );


            if (!fs.existsSync(filePath)) {

                throw new Error(
                    "Project could not be found."
                );
            }


            const fileContents =
                fs.readFileSync(
                    filePath,
                    "utf8"
                );


            const project =
                JSON.parse(
                    fileContents
                );


            return {

                success: true,

                project
            };

        } catch (error) {

            console.error(
                "Project load error:",
                error
            );


            return {

                success: false,

                error:
                    error.message
                    || "Unable to load project."
            };
        }
    }
);


/*
    List projects
*/

ipcMain.handle(
    "project:list",
    async () => {

        try {

            const projectsDirectory =
                getProjectsDirectory();


            const files =
                fs.readdirSync(
                    projectsDirectory
                );


            const projects = [];


            for (const file of files) {

                if (
                    !file.toLowerCase()
                        .endsWith(".json")
                ) {
                    continue;
                }


                try {

                    const filePath =
                        path.join(
                            projectsDirectory,
                            file
                        );


                    const fileContents =
                        fs.readFileSync(
                            filePath,
                            "utf8"
                        );


                    const project =
                        JSON.parse(
                            fileContents
                        );


                    projects.push({

                        id:
                            project.id,

                        title:
                            project.title
                            || "Untitled Project",

                        question:
                            project.question
                            || "",

                        created:
                            project.created
                            || null,

                        modified:
                            project.modified
                            || null
                    });

                } catch (error) {

                    console.error(
                        "Could not read project:",
                        file,
                        error
                    );
                }
            }


            projects.sort(
                (a, b) => {

                    const dateA =
                        new Date(
                            a.modified || 0
                        ).getTime();

                    const dateB =
                        new Date(
                            b.modified || 0
                        ).getTime();

                    return dateB - dateA;
                }
            );


            return {

                success: true,

                projects
            };

        } catch (error) {

            console.error(
                "Project list error:",
                error
            );


            return {

                success: false,

                projects: [],

                error:
                    error.message
                    || "Unable to list projects."
            };
        }
    }
);


/*
    Delete project
*/

ipcMain.handle(
    "project:delete",
    async (event, projectId) => {

        try {

            const filePath =
                getProjectFilePath(
                    projectId
                );


            if (
                fs.existsSync(
                    filePath
                )
            ) {

                fs.unlinkSync(
                    filePath
                );
            }


            return {

                success: true
            };

        } catch (error) {

            console.error(
                "Project delete error:",
                error
            );


            return {

                success: false,

                error:
                    error.message
                    || "Unable to delete project."
            };
        }
    }
);


/*
    Open project storage folder
*/

ipcMain.handle(
    "project:open-folder",
    async () => {

        try {

            const projectsDirectory =
                getProjectsDirectory();


            await shell.openPath(
                projectsDirectory
            );


            return {

                success: true
            };

        } catch (error) {

            console.error(
                "Open projects folder error:",
                error
            );


            return {

                success: false,

                error:
                    error.message
                    || "Unable to open project folder."
            };
        }
    }
);


/* =========================================================
   AUTO UPDATER
========================================================= */

function setupAutoUpdater() {

    autoUpdater.autoDownload = false;

    autoUpdater.autoInstallOnAppQuit = true;


    autoUpdater.on(
        "checking-for-update",
        () => {
            console.log("Checking for updates...");
            sendUpdateStatus({ status: "checking" });
        }
    );


    autoUpdater.on(
        "update-available",
        async (info) => {

            console.log(
                "Update available:",
                info.version
            );
            sendUpdateStatus({
                status: "available",
                version: info.version,
                releaseNotes: releaseNotesText(info.releaseNotes)
            });


            const result =
                await dialog.showMessageBox(
                    mainWindow,
                    {

                        type: "info",

                        title:
                            "Update Available",

                        message:
                            `Di PseudoFlow Logics ${info.version} is available.`,

                        detail:
                            "Would you like to download the update now?",

                        buttons: [
                            "Download Update",
                            "Later"
                        ],

                        defaultId: 0,

                        cancelId: 1
                    }
                );


            if (
                result.response === 0
            ) {

                try {

                    console.log(
                        "Starting update download..."
                    );


                    await autoUpdater
                        .downloadUpdate();


                    console.log(
                        "Update download started."
                    );

                } catch (error) {

                    console.error(
                        "Download failed:",
                        error
                    );


                    await dialog.showMessageBox(
                        mainWindow,
                        {

                            type: "error",

                            title:
                                "Update Download Failed",

                            message:
                                "The update could not be downloaded.",

                            detail:
                                error?.message
                                || String(error),

                            buttons: [
                                "OK"
                            ]
                        }
                    );
                }
            }
        }
    );


    autoUpdater.on(
        "download-progress",
        (progress) => {
            console.log(`Update download: ${progress.percent.toFixed(1)}%`);
            sendUpdateStatus({ status: "progress", percent: progress.percent, bytesPerSecond: progress.bytesPerSecond });
        }
    );


    autoUpdater.on(
        "update-downloaded",
        async (info) => {

            console.log(
                "Update downloaded:",
                info.version
            );
            sendUpdateStatus({ status: "downloaded", version: info.version });


            const result =
                await dialog.showMessageBox(
                    mainWindow,
                    {

                        type: "info",

                        title:
                            "Update Ready",

                        message:
                            "The update has been downloaded successfully.",

                        detail:
                            `Version ${info.version} is ready to install. Restart Di PseudoFlow Logics now?`,

                        buttons: [
                            "Restart and Install",
                            "Later"
                        ],

                        defaultId: 0,

                        cancelId: 1
                    }
                );


            if (
                result.response === 0
            ) {

                autoUpdater.quitAndInstall();
            }
        }
    );


    autoUpdater.on(
        "update-not-available",
        (info) => {
            console.log("No update available. Current/latest version:", info.version);
            sendUpdateStatus({ status: "not-available", version: info.version });
        }
    );


    autoUpdater.on(
        "error",
        (error) => {
            console.error("Auto-update error:", error);
            sendUpdateStatus({ status: "error", message: error?.message || String(error) });
        }
    );


    autoUpdater
        .checkForUpdates()
        .catch(
            (error) => {

                console.error(
                    "Update check failed:",
                    error
                );
            }
        );
}


/* =========================================================
   APP START
========================================================= */

app.whenReady().then(() => {

    createWindow();

    setupAutoUpdater();


    app.on(
        "activate",
        () => {

            if (
                BrowserWindow
                    .getAllWindows()
                    .length === 0
            ) {

                createWindow();
            }
        }
    );
});


app.on(
    "window-all-closed",
    () => {

        if (
            process.platform !== "darwin"
        ) {

            app.quit();
        }
    }
);