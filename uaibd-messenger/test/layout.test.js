const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Discord-style Layout HTML and CSS', () => {
    test('index.html contains three-column Discord containers and required IDs', () => {
        const htmlPath = path.join(__dirname, '..', 'renderer', 'index.html');
        assert.ok(fs.existsSync(htmlPath), 'index.html should exist');
        const html = fs.readFileSync(htmlPath, 'utf8');

        // Three columns
        assert.ok(html.includes('id="serverSidebar"'), 'serverSidebar missing');
        assert.ok(html.includes('id="channelsSidebar"'), 'channelsSidebar missing');
        assert.ok(html.includes('id="mainContent"'), 'mainContent missing');

        // Navigation tabs & counter
        assert.ok(html.includes('id="tabChat"'), 'tabChat missing');
        assert.ok(html.includes('id="tabTasks"'), 'tabTasks missing');
        assert.ok(html.includes('id="taskCountBadge"'), 'taskCountBadge missing');

        // Chat containers and inputs
        assert.ok(html.includes('id="messagesContainer"'), 'messagesContainer missing');
        assert.ok(html.includes('id="messageInput"'), 'messageInput missing');
        assert.ok(html.includes('id="btnAttachFile"'), 'btnAttachFile missing');
        assert.ok(html.includes('id="btnSendMessage"'), 'btnSendMessage missing');
        assert.ok(html.includes('id="fileInput"'), 'fileInput missing');

        // Tasks container and action button
        assert.ok(html.includes('id="tasksContainer"'), 'tasksContainer missing');
        assert.ok(html.includes('id="btnOpenCreateTask"'), 'btnOpenCreateTask missing');

        // Required modals
        assert.ok(html.includes('id="modalCreateTask"'), 'modalCreateTask missing');
        assert.ok(html.includes('id="modalSubmitReport"'), 'modalSubmitReport missing');
        assert.ok(html.includes('id="modalReviewTask"'), 'modalReviewTask missing');
        assert.ok(html.includes('id="modalProfileSwitch"'), 'modalProfileSwitch missing');
    });

    test('index.html has appropriate document structure and metadata', () => {
        const htmlPath = path.join(__dirname, '..', 'renderer', 'index.html');
        const html = fs.readFileSync(htmlPath, 'utf8');
        assert.ok(html.includes('<!DOCTYPE html>'), 'DOCTYPE missing');
        assert.ok(html.includes('rel="stylesheet"') && html.includes('style.css'), 'style.css link missing');
        assert.ok(html.includes('БМЗ'), 'BMZ branding missing in HTML');
        assert.ok(html.includes('УАиБД'), 'UAiBD branding missing in HTML');
        assert.ok(html.includes('id="currentUserBar"') || html.includes('id="currentUser"'), 'Current user profile bar missing');
    });

    test('style.css defines Discord color tokens and utility classes', () => {
        const cssPath = path.join(__dirname, '..', 'renderer', 'style.css');
        assert.ok(fs.existsSync(cssPath), 'style.css should exist');
        const css = fs.readFileSync(cssPath, 'utf8');

        // Discord dark palette tokens
        assert.ok(css.includes('--bg-primary') || css.includes('#36393f'), 'primary bg missing');
        assert.ok(css.includes('--bg-secondary') || css.includes('#2f3136'), 'secondary bg missing');
        assert.ok(css.includes('--bg-tertiary') || css.includes('#202225'), 'tertiary bg missing');

        // Badges and task card components
        assert.ok(css.includes('.badge-urgent'), 'badge-urgent missing');
        assert.ok(css.includes('.badge-high'), 'badge-high missing');
        assert.ok(css.includes('.task-card'), 'task-card missing');

        // Custom scrollbar and modal styles
        assert.ok(css.includes('::-webkit-scrollbar'), 'custom scrollbar missing');
        assert.ok(css.includes('.modal'), 'modal styles missing');
    });
});
