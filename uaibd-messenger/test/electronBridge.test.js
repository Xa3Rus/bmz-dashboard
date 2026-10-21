const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Electron Main & Preload Bridge', () => {
    test('main.js exists and configures browser window with preload', () => {
        const mainPath = path.join(__dirname, '..', 'main.js');
        assert.ok(fs.existsSync(mainPath), 'main.js must exist');
        const code = fs.readFileSync(mainPath, 'utf8');
        assert.ok(code.includes('BrowserWindow'), 'must use BrowserWindow');
        assert.ok(code.includes('preload'), 'must reference preload');
        assert.ok(code.includes('ipcMain'), 'must use ipcMain');
        assert.ok(code.includes('1280'), 'must set width 1280');
        assert.ok(code.includes('800'), 'must set height 800');
        assert.ok(code.includes('#202225') || code.includes('202225'), 'must use dark theme #202225');
        assert.ok(code.includes('contextIsolation: true') || code.includes('contextIsolation'), 'must enable contextIsolation');
    });

    test('preload.js exposes uaibdAPI via contextBridge', () => {
        const preloadPath = path.join(__dirname, '..', 'preload.js');
        assert.ok(fs.existsSync(preloadPath), 'preload.js must exist');
        const code = fs.readFileSync(preloadPath, 'utf8');
        assert.ok(code.includes('contextBridge.exposeInMainWorld'), 'must use exposeInMainWorld');
        assert.ok(code.includes('uaibdAPI'), 'must expose uaibdAPI');
        assert.ok(code.includes('getConfig'), 'must expose getConfig');
        assert.ok(code.includes('showNotification'), 'must expose showNotification');
        assert.ok(code.includes('openExternal'), 'must expose openExternal');
        assert.ok(code.includes('minimize'), 'must expose minimize');
        assert.ok(code.includes('maximize'), 'must expose maximize');
        assert.ok(code.includes('close'), 'must expose close');
        assert.ok(code.includes('readLocalFile'), 'must expose readLocalFile');
    });

    test('main.js handles config loading and IPC handlers', () => {
        const mainPath = path.join(__dirname, '..', 'main.js');
        assert.ok(fs.existsSync(mainPath), 'main.js must exist');
        const code = fs.readFileSync(mainPath, 'utf8');
        assert.ok(code.includes('config:get') || code.includes('getConfig'), 'must handle config IPC');
        assert.ok(code.includes('notify:show') || code.includes('showNotification'), 'must handle notify IPC');
        assert.ok(code.includes('shell:openExternal') || code.includes('openExternal'), 'must handle external links');
        assert.ok(code.includes('window:minimize') || code.includes('minimize'), 'must handle window minimize');
        assert.ok(code.includes('window:maximize') || code.includes('maximize'), 'must handle window maximize');
        assert.ok(code.includes('window:close') || code.includes('close'), 'must handle window close');
        assert.ok(code.includes('file:read') || code.includes('readLocalFile'), 'must handle file read IPC');
    });

    test('preload.js can be evaluated with mock contextBridge to verify exposed API shape', () => {
        const preloadPath = path.join(__dirname, '..', 'preload.js');
        assert.ok(fs.existsSync(preloadPath), 'preload.js must exist');

        let exposedKey = null;
        let exposedApi = null;
        const mockContextBridge = {
            exposeInMainWorld: (key, api) => {
                exposedKey = key;
                exposedApi = api;
            }
        };

        const invokedChannels = [];
        const mockIpcRenderer = {
            invoke: async (channel, ...args) => {
                invokedChannels.push({ channel, args });
                return { channel, args };
            }
        };

        const mockElectron = {
            contextBridge: mockContextBridge,
            ipcRenderer: mockIpcRenderer
        };

        const preloadCode = fs.readFileSync(preloadPath, 'utf8');
        const mockModule = { exports: {} };
        const runFn = new Function('require', 'module', 'exports', preloadCode);
        runFn((mod) => {
            if (mod === 'electron') return mockElectron;
            return require(mod);
        }, mockModule, mockModule.exports);

        assert.strictEqual(exposedKey, 'uaibdAPI');
        assert.ok(exposedApi, 'API object should be passed');
        assert.strictEqual(typeof exposedApi.getConfig, 'function');
        assert.strictEqual(typeof exposedApi.showNotification, 'function');
        assert.strictEqual(typeof exposedApi.openExternal, 'function');
        assert.strictEqual(typeof exposedApi.minimize, 'function');
        assert.strictEqual(typeof exposedApi.maximize, 'function');
        assert.strictEqual(typeof exposedApi.close, 'function');
        assert.strictEqual(typeof exposedApi.readLocalFile, 'function');

        exposedApi.getConfig();
        assert.strictEqual(invokedChannels[0].channel, 'config:get');

        exposedApi.showNotification('Title', 'Body');
        assert.strictEqual(invokedChannels[1].channel, 'notify:show');
        assert.deepStrictEqual(invokedChannels[1].args[0], { title: 'Title', body: 'Body' });

        exposedApi.openExternal('https://bmz.by');
        assert.strictEqual(invokedChannels[2].channel, 'shell:openExternal');

        exposedApi.minimize();
        assert.strictEqual(invokedChannels[3].channel, 'window:minimize');

        exposedApi.maximize();
        assert.strictEqual(invokedChannels[4].channel, 'window:maximize');

        exposedApi.close();
        assert.strictEqual(invokedChannels[5].channel, 'window:close');

        exposedApi.readLocalFile('/tmp/file.txt', 'utf8');
        assert.strictEqual(invokedChannels[6].channel, 'file:read');
    });
});
