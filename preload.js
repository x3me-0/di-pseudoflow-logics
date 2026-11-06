const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("diPseudoFlow", {
    setFullScreen: (enabled) => ipcRenderer.invoke("window:set-fullscreen", Boolean(enabled)),
    // Application information
    getVersion: () => ipcRenderer.invoke("app:get-version"),
    checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
    onUpdateStatus: (callback) => {
        const listener = (_event, status) => callback(status);
        ipcRenderer.on("app:update-status", listener);
        return () => ipcRenderer.removeListener("app:update-status", listener);
    },
    exportPdf: (svg, title) => ipcRenderer.invoke("export:pdf", { svg, title }),

    // Bundled CPython execution and its interactive console
    runPythonCode: (code, runId) => ipcRenderer.invoke("python:run", { code: String(code || ""), runId: String(runId || "") }),
    sendPythonInput: (runId, value) => ipcRenderer.invoke("python:input", { runId, value: String(value ?? "") }),
    stopPython: (runId) => ipcRenderer.invoke("python:stop", String(runId || "")),
    onPythonOutput: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on("python:output", listener);
        return () => ipcRenderer.removeListener("python:output", listener);
    },
    onPythonInputRequest: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on("python:input-request", listener);
        return () => ipcRenderer.removeListener("python:input-request", listener);
    },
    onPythonExit: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on("python:exit", listener);
        return () => ipcRenderer.removeListener("python:exit", listener);
    },

    // Local profile accounts (passwords are hashed in the main process)
    listProfiles: () => ipcRenderer.invoke("profile:list"),
    createProfile: (profile) => ipcRenderer.invoke("profile:create", profile),
    loginProfile: (credentials) => ipcRenderer.invoke("profile:login", credentials),
    recoveryQuestion: (username) => ipcRenderer.invoke("profile:recovery-question", username),
    recoverProfile: (details) => ipcRenderer.invoke("profile:recover", details),
    updateProfile: (details) => ipcRenderer.invoke("profile:update", details),

    // Project management
    saveProject: (project) =>
        ipcRenderer.invoke("project:save", project),

    loadProject: (projectId) =>
        ipcRenderer.invoke("project:load", projectId),

    listProjects: (profileId) =>
        ipcRenderer.invoke("project:list", profileId),

    deleteProject: (projectId) =>
        ipcRenderer.invoke("project:delete", projectId),

    // Create/open a project library folder if needed
    openProjectsFolder: () =>
        ipcRenderer.invoke("project:open-folder"),
    chooseProjectsFolder: () => ipcRenderer.invoke("project:choose-folder"),
    getProjectsFolder: () => ipcRenderer.invoke("project:get-folder")
});
