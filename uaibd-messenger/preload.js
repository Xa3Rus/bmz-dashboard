const { contextBridge, ipcRenderer } = require('electron');

const uaibdAPI = {
    /**
     * Reads application configuration from config.json.
     * @returns {Promise<Object>}
     */
    getConfig: () => ipcRenderer.invoke('config:get'),

    /**
     * Shows a native desktop system notification.
     * @param {string|Object} title Notification title or object payload
     * @param {string} [body] Notification body
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    showNotification: (title, body) => {
        const payload = typeof title === 'object' && title !== null ? title : { title, body };
        return ipcRenderer.invoke('notify:show', payload);
    },

    /**
     * Safely opens a web URL or mailto link in the user's default browser.
     * @param {string} url
     * @returns {Promise<boolean>}
     */
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

    /**
     * Minimizes the application window.
     * @returns {Promise<boolean>}
     */
    minimize: () => ipcRenderer.invoke('window:minimize'),

    /**
     * Toggles maximize/unmaximize state of the application window.
     * @returns {Promise<boolean>}
     */
    maximize: () => ipcRenderer.invoke('window:maximize'),

    /**
     * Closes the application window.
     * @returns {Promise<boolean>}
     */
    close: () => ipcRenderer.invoke('window:close'),

    /**
     * Reads a local file as utf8 string or base64.
     * @param {string} filePath
     * @param {'utf8'|'base64'} [encoding='utf8']
     * @returns {Promise<string>}
     */
    readLocalFile: (filePath, encoding = 'utf8') => ipcRenderer.invoke('file:read', filePath, encoding)
};

contextBridge.exposeInMainWorld('uaibdAPI', uaibdAPI);

if (typeof module !== 'undefined') {
    module.exports = uaibdAPI;
}
