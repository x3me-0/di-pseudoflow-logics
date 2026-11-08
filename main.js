const {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    shell
} = require("electron");

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { autoUpdater } = require("electron-updater");

let mainWindow;
let selectedProjectsDirectory = null;

function getProjectsDirectorySettingPath() {
    return path.join(app.getPath("userData"), "projects-location.json");
}

function loadProjectsDirectorySetting() {
    if (selectedProjectsDirectory) return selectedProjectsDirectory;
    try {
        const setting = JSON.parse(fs.readFileSync(getProjectsDirectorySettingPath(), "utf8"));
        if (setting && typeof setting.directory === "string" && fs.existsSync(setting.directory)) {
            selectedProjectsDirectory = setting.directory;
        }
    } catch (_) {}
    return selectedProjectsDirectory;
}

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

ipcMain.handle("window:set-fullscreen", (_event, enabled) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    mainWindow.setFullScreen(Boolean(enabled));
    return true;
});


/* =========================================================
   PROJECT STORAGE
========================================================= */

function getProjectsDirectory() {
    const projectsDirectory = loadProjectsDirectorySetting() || path.join(
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


function getProfilesFilePath() {
    return path.join(app.getPath("userData"), "profiles.json");
}

function readProfiles() {
    const filePath = getProfilesFilePath();
    if (!fs.existsSync(filePath)) return [];
    try {
        const profiles = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return Array.isArray(profiles) ? profiles : [];
    } catch (error) {
        console.error("Could not read local profiles:", error);
        return [];
    }
}

function writeProfiles(profiles) {
    const filePath = getProfilesFilePath();
    const temporaryPath = filePath + ".tmp";
    fs.writeFileSync(temporaryPath, JSON.stringify(profiles, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
}

function publicProfile(profile) {
    const { passwordHash, passwordSalt, recoveryAnswerHash, recoveryAnswerSalt, ...safeProfile } = profile;
    return safeProfile;
}

ipcMain.handle("profile:list", () => readProfiles().map(publicProfile));

ipcMain.handle("profile:create", (_event, input = {}) => {
    try {
        const firstName = String(input.firstName || "").trim().slice(0, 50);
        const lastName = String(input.lastName || "").trim().slice(0, 50);
        const username = String(input.username || "").trim().toLowerCase().slice(0, 32);
        const password = String(input.password || "");
        const schoolName = String(input.schoolName || "").trim().slice(0, 100);
        const schoolId = String(input.schoolId || "").trim().slice(0, 60);
        const avatar = String(input.avatar || "🙂").slice(0, 12);
        const recoveryQuestion = String(input.recoveryQuestion || "").trim().slice(0, 180);
        const recoveryAnswer = String(input.recoveryAnswer || "").trim().toLowerCase();
        if (!firstName || !lastName) throw new Error("Enter your first and last name.");
        if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error("Username must be 3–32 characters and use letters, numbers, dots, dashes, or underscores.");
        if (password.length < 8 || password.length > 128) throw new Error("Password must be between 8 and 128 characters.");
        if (!recoveryQuestion || recoveryAnswer.length < 2) throw new Error("Add a recovery question and an answer with at least 2 characters.");
        const profiles = readProfiles();
        if (profiles.some(profile => profile.username.toLowerCase() === username)) throw new Error("That username is already in use on this computer.");
        const passwordSalt = crypto.randomBytes(16).toString("hex");
        const passwordHash = crypto.scryptSync(password, passwordSalt, 64).toString("hex");
        const recoveryAnswerSalt = crypto.randomBytes(16).toString("hex");
        const recoveryAnswerHash = crypto.scryptSync(recoveryAnswer, recoveryAnswerSalt, 64).toString("hex");
        const profile = {
            id: crypto.randomUUID(), firstName, lastName, username,
            displayName: firstName + " " + lastName, schoolName, schoolId, avatar,
            created: new Date().toISOString(), passwordSalt, passwordHash, recoveryQuestion, recoveryAnswerSalt, recoveryAnswerHash
        };
        profiles.push(profile);
        writeProfiles(profiles);
        claimGuestProjects(profile);
        return { success: true, profile: publicProfile(profile) };
    } catch (error) {
        return { success: false, error: error.message || "Could not create the profile." };
    }
});

function claimGuestProjects(profile) {
    const directory = getProjectsDirectory();
    for (const name of fs.readdirSync(directory)) {
        if (!name.endsWith(".json")) continue;
        const filePath = path.join(directory, name);
        try {
            const project = JSON.parse(fs.readFileSync(filePath, "utf8"));
            if (project.profileId === "guest-local") {
                project.profileId = profile.id;
                project.ownerDisplayName = profile.displayName;
                project.ownerUsername = profile.username;
                fs.writeFileSync(filePath, JSON.stringify(project, null, 4), "utf8");
            }
        } catch (error) { console.warn("Could not associate guest project with new profile:", name, error); }
    }
}

ipcMain.handle("profile:recovery-question", (_event, username) => {
    const normalized = String(username || "").trim().toLowerCase();
    const profile = readProfiles().find(item => item.username.toLowerCase() === normalized);
    if (!profile || !profile.recoveryQuestion) return { success: false, error: "No recovery question is available for that username." };
    return { success: true, recoveryQuestion: profile.recoveryQuestion };
});

ipcMain.handle("profile:recover", (_event, input = {}) => {
    try {
        const username = String(input.username || "").trim().toLowerCase();
        const answer = String(input.recoveryAnswer || "").trim().toLowerCase();
        const newPassword = String(input.newPassword || "");
        const profiles = readProfiles();
        const profile = profiles.find(item => item.username.toLowerCase() === username);
        if (!profile || !profile.recoveryAnswerHash) throw new Error("Recovery details could not be verified.");
        if (newPassword.length < 8 || newPassword.length > 128) throw new Error("New password must be between 8 and 128 characters.");
        const attempt = crypto.scryptSync(answer, profile.recoveryAnswerSalt, 64);
        const saved = Buffer.from(profile.recoveryAnswerHash, "hex");
        if (attempt.length !== saved.length || !crypto.timingSafeEqual(attempt, saved)) throw new Error("Recovery details could not be verified.");
        profile.passwordSalt = crypto.randomBytes(16).toString("hex");
        profile.passwordHash = crypto.scryptSync(newPassword, profile.passwordSalt, 64).toString("hex");
        writeProfiles(profiles);
        return { success: true };
    } catch (error) { return { success: false, error: error.message || "Password recovery failed." }; }
});

ipcMain.handle("profile:update", (_event, input = {}) => {
    try {
        const profiles = readProfiles();
        const profile = profiles.find(item => item.id === String(input.id || ""));
        if (!profile) throw new Error("Profile not found.");
        const currentPassword = String(input.currentPassword || "");
        const verify = crypto.scryptSync(currentPassword, profile.passwordSalt, 64);
        const savedPassword = Buffer.from(profile.passwordHash, "hex");
        if (verify.length !== savedPassword.length || !crypto.timingSafeEqual(verify, savedPassword)) throw new Error("Enter your current password to save profile changes.");
        const firstName = String(input.firstName || "").trim().slice(0, 50);
        const lastName = String(input.lastName || "").trim().slice(0, 50);
        const username = String(input.username || "").trim().toLowerCase().slice(0, 32);
        if (!firstName || !lastName) throw new Error("Enter your first and last name.");
        if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error("Username must be 3–32 characters and use letters, numbers, dots, dashes, or underscores.");
        if (profiles.some(item => item.id !== profile.id && item.username.toLowerCase() === username)) throw new Error("That username is already in use on this computer.");
        profile.firstName=firstName; profile.lastName=lastName; profile.displayName=firstName+" "+lastName; profile.username=username;
        profile.schoolName=String(input.schoolName||"").trim().slice(0,100); profile.schoolId=String(input.schoolId||"").trim().slice(0,60); profile.avatar=String(input.avatar||"🙂").slice(0,12);
        const question=String(input.recoveryQuestion||"").trim().slice(0,180); const answer=String(input.recoveryAnswer||"").trim().toLowerCase();
        if (Boolean(question) !== Boolean(answer)) throw new Error("Enter both the recovery question and its answer, or leave both unchanged.");
        if (question && answer) { profile.recoveryQuestion=question; profile.recoveryAnswerSalt=crypto.randomBytes(16).toString("hex"); profile.recoveryAnswerHash=crypto.scryptSync(answer,profile.recoveryAnswerSalt,64).toString("hex"); }
        const newPassword=String(input.newPassword||"");
        if (newPassword) { if(newPassword.length<8||newPassword.length>128)throw new Error("New password must be between 8 and 128 characters.");profile.passwordSalt=crypto.randomBytes(16).toString("hex");profile.passwordHash=crypto.scryptSync(newPassword,profile.passwordSalt,64).toString("hex"); }
        writeProfiles(profiles);
        for (const name of fs.readdirSync(getProjectsDirectory())) {
            if (!name.endsWith(".json")) continue;
            const projectPath=path.join(getProjectsDirectory(),name);
            try { const project=JSON.parse(fs.readFileSync(projectPath,"utf8")); if(project.profileId===profile.id){project.ownerDisplayName=profile.displayName;project.ownerUsername=profile.username;fs.writeFileSync(projectPath,JSON.stringify(project,null,4),"utf8");} } catch(error) { console.warn("Could not refresh profile stamp on project:",name,error); }
        }
        return {success:true,profile:publicProfile(profile)};
    } catch(error) { return {success:false,error:error.message||"Could not update profile."}; }
});

ipcMain.handle("profile:login", (_event, input = {}) => {
    try {
        const username = String(input.username || "").trim().toLowerCase();
        const password = String(input.password || "");
        const profile = readProfiles().find(item => item.username.toLowerCase() === username);
        if (!profile) throw new Error("Username or password is incorrect.");
        const attempt = crypto.scryptSync(password, profile.passwordSalt, 64);
        const saved = Buffer.from(profile.passwordHash, "hex");
        if (attempt.length !== saved.length || !crypto.timingSafeEqual(attempt, saved)) throw new Error("Username or password is incorrect.");
        return { success: true, profile: publicProfile(profile) };
    } catch (error) {
        return { success: false, error: error.message || "Could not sign in." };
    }
});

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

ipcMain.handle("export:pdf", async (_event, options = {}) => {
    let pdfWindow;
    let pdfTempDirectory = null;
    let pdfTempFile = null;
    try {
        const { svg = "", pseudocode = "", title = "Untitled Project", stamp = "", content = "both", flowLayout = "tile" } = options || {};
        if (!["both", "pseudocode", "flowchart"].includes(content)) throw new Error("Choose pseudocode, flowchart, or both for the PDF.");
        const includePseudocode = content !== "flowchart";
        const includeFlowchart = content !== "pseudocode";
        if (includeFlowchart && (typeof svg !== "string" || !/<svg\b/i.test(svg))) throw new Error("No flowchart image was provided.");
        if (includePseudocode && typeof pseudocode !== "string") throw new Error("Pseudocode could not be read.");

        const safeTitle = String(title || "Untitled Project").replace(/[<>:"\/\\|?*]/g, "-").slice(0, 100);
        const suffix = content === "both" ? "pseudocode-flowchart" : content;
        const target = await dialog.showSaveDialog(mainWindow, {
            title: "Export Project as PDF",
            defaultPath: path.join(app.getPath("downloads"), safeTitle + "-" + suffix + ".pdf"),
            filters: [{ name: "PDF document", extensions: ["pdf"] }]
        });
        if (target.canceled || !target.filePath) return { success: false, canceled: true };

        const escapeHtml = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        const pages = [];
        if (includePseudocode) {
            pages.push('<section class="code-export"><h1>' + escapeHtml(safeTitle) + '</h1><p class="work-stamp">' + escapeHtml(stamp) + '</p><h2>Pseudocode</h2><pre>' + escapeHtml(pseudocode) + '</pre></section>');
        }

        if (includeFlowchart) {
            const match = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg\s*>/i);
            if (!match) throw new Error("The flowchart image could not be prepared.");
            const svgBody = match[1];

            const widthMatch = svg.match(/<svg\b[^>]*\bwidth="([\d.]+)"/i);
            const heightMatch = svg.match(/<svg\b[^>]*\bheight="([\d.]+)"/i);
            const chartWidth = Math.max(1, Number(widthMatch?.[1]) || 1);
            const chartHeight = Math.max(1, Number(heightMatch?.[1]) || 1);
            const tileWidth = 273 / 25.4 * 96;
            const tileHeight = 178 / 25.4 * 96;
            const overlap = 40;
            const svgForView = (x, y, w, h) => '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="' + x + ' ' + y + ' ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" style="background-color:#0b1120">' + svgBody + '</svg>';

            if (flowLayout === "fit") {
                pages.push('<section class="chart-page last' + (includePseudocode ? " chart-start" : "") + '"><div class="chart-page-label">Flowchart — complete overview (scaled to one page)</div><div class="chart-frame">' + svgForView(0, 0, chartWidth, chartHeight) + '</div></section>');
            } else {
                const makeStarts = (total, span) => {
                    if (total <= span + overlap) return [0];
                    const starts = [0];
                    while (starts[starts.length - 1] + span < total) {
                        const last = starts[starts.length - 1];
                        let next = last + span - overlap;
                        if (next + span >= total) next = Math.max(last + 1, total - span);
                        starts.push(next);
                    }
                    return starts;
                };
                const xStarts = makeStarts(chartWidth, tileWidth);
                const yStarts = makeStarts(chartHeight, tileHeight);
                const totalPages = xStarts.length * yStarts.length;
                let pageNumber = 0;
                yStarts.forEach((y, row) => xStarts.forEach((x, column) => {
                    pageNumber++;
                    const label = 'Flowchart — page ' + pageNumber + ' of ' + totalPages + ' (row ' + (row + 1) + ', column ' + (column + 1) + '; pages overlap slightly)';
                    const lastClass = (pageNumber === totalPages ? ' last' : '') + (pageNumber === 1 && includePseudocode ? ' chart-start' : '');
                    const viewWidth = xStarts.length === 1 ? Math.max(tileWidth, chartWidth) : tileWidth;
                    const viewHeight = yStarts.length === 1 ? Math.max(tileHeight, chartHeight) : tileHeight;
                    pages.push('<section class="chart-page' + lastClass + '"><div class="chart-page-label">' + label + '</div><div class="chart-frame">' + svgForView(x, y, viewWidth, viewHeight) + '</div></section>');
                }));
            }
        }

        const html = '<!doctype html><html><head><meta charset="utf-8"><style>' +
            '@page{size:A4 landscape;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111827;font-family:Arial,sans-serif}' +
            '.code-export{padding:0 0 8mm}.code-export h1{font-size:20pt;margin:0 0 3mm}.code-export h2{font-size:14pt;margin:6mm 0 3mm}.work-stamp{font-size:8pt;color:#475569;margin:0 0 5mm;overflow-wrap:anywhere}' +
            '.code-export pre{font:10pt/1.45 Consolas,"Courier New",monospace;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:4;margin:0;color:#111827}' +
            '.chart-page{width:273mm;height:186mm;overflow:hidden;display:flex;flex-direction:column;break-after:page;page-break-after:always}.chart-page.last{break-after:auto;page-break-after:auto}.chart-page-label{height:8mm;flex:0 0 8mm;font-size:8pt;color:#334155;padding:0 0 1.5mm}.chart-frame{width:273mm;height:178mm;flex:0 0 178mm}.chart-frame svg{display:block;width:100%;height:100%}' +
            '.chart-page.chart-start{break-before:page;page-break-before:always}' +
            '</style></head><body>' + pages.join("") + '</body></html>';
        pdfWindow = new BrowserWindow({ show: false, width: 1200, height: 850, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
        pdfTempDirectory = fs.mkdtempSync(path.join(app.getPath("temp"), "di-pseudoflow-pdf-"));
        pdfTempFile = path.join(pdfTempDirectory, "export.html");
        fs.writeFileSync(pdfTempFile, html, "utf8");
        await pdfWindow.loadFile(pdfTempFile);
        const pdf = await pdfWindow.webContents.printToPDF({ printBackground: true, pageSize: "A4", landscape: true, margins: { top: 0.4724, bottom: 0.4724, left: 0.4724, right: 0.4724 } });
        fs.writeFileSync(target.filePath, pdf);
        return { success: true, filePath: target.filePath };
    } catch (error) {
        console.error("PDF export error:", error);
        return { success: false, error: error?.message || "Unable to export PDF." };
    } finally {
        if (pdfWindow && !pdfWindow.isDestroyed()) pdfWindow.destroy();
        try {
            if (pdfTempFile && fs.existsSync(pdfTempFile)) fs.unlinkSync(pdfTempFile);
            if (pdfTempDirectory && fs.existsSync(pdfTempDirectory)) fs.rmdirSync(pdfTempDirectory);
        } catch (cleanupError) {
            console.warn("Could not remove temporary PDF export files:", cleanupError?.message || cleanupError);
        }
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
    async (_event, profileId) => {

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

                    if (profileId && project.profileId && project.profileId !== profileId) continue;

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
                            || null,

                        hasPseudocode: Boolean(project.pseudocode && project.pseudocode.trim()),
                        hasFlowchart: Boolean(project.flowchart && Array.isArray(project.flowchart.nodes) && project.flowchart.nodes.length)
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

ipcMain.handle("project:get-folder", async () => ({ success: true, directory: getProjectsDirectory() }));

ipcMain.handle("project:choose-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: "Choose where to store projects", properties: ["openDirectory", "createDirectory"] });
    if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true };
    const previousDirectory = getProjectsDirectory();
    selectedProjectsDirectory = result.filePaths[0];
    fs.mkdirSync(selectedProjectsDirectory, { recursive: true });
    if (path.resolve(previousDirectory) !== path.resolve(selectedProjectsDirectory)) {
        for (const name of fs.readdirSync(previousDirectory)) {
            if (!name.toLowerCase().endsWith(".json")) continue;
            const source = path.join(previousDirectory, name);
            const destination = path.join(selectedProjectsDirectory, name);
            if (!fs.existsSync(destination) && fs.statSync(source).isFile()) fs.copyFileSync(source, destination);
        }
    }
    fs.writeFileSync(getProjectsDirectorySettingPath(), JSON.stringify({ directory: selectedProjectsDirectory }, null, 2), "utf8");
    return { success: true, directory: selectedProjectsDirectory };
});


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


    // Automatic checks are started by the renderer only when the signed-in profile enables them.
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
