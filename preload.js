const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("diPseudoFlow", {
    // Application information
    getVersion: () => ipcRenderer.invoke("app:get-version"),
    checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
    onUpdateStatus: (callback) => {
        const listener = (_event, status) => callback(status);
        ipcRenderer.on("app:update-status", listener);
        return () => ipcRenderer.removeListener("app:update-status", listener);
    },
    exportPdf: (svg, title) => ipcRenderer.invoke("export:pdf", { svg, title }),

    // Project management
    saveProject: (project) =>
        ipcRenderer.invoke("project:save", project),

    loadProject: (projectId) =>
        ipcRenderer.invoke("project:load", projectId),

    listProjects: () =>
        ipcRenderer.invoke("project:list"),

    deleteProject: (projectId) =>
        ipcRenderer.invoke("project:delete", projectId),

    // Create/open a project library folder if needed
    openProjectsFolder: () =>
        ipcRenderer.invoke("project:open-folder")
});
