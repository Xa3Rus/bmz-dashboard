# UA&BD Task Messenger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Discord-inspired desktop task messenger for the UA&BD (Управление автоматизации и баз данных) department of BMZ using Electron and Supabase with real-time chat, task assignment, role-based access, and technical report/file attachments.

**Architecture:** Electron desktop application with a 3-column Discord-style industrial interface. Connects directly to Supabase (PostgreSQL 15+) for profiles, messages, channels, tasks, and task reports. Realtime WebSocket subscriptions push new messages and task status updates without page reloads; Supabase Storage hosts technical reports, logs, and screenshots.

**Tech Stack:** Electron 34+, Node.js, `@supabase/supabase-js`, HTML5, CSS3 (Discord dark palette), Vanilla JS (clean component architecture), Jest/Node native test runner.

**Spec:** [`docs/superpowers/specs/2026-10-21-uaibd-task-messenger-design.md`](file:///c:/Users/XauRus/Desktop/bmz-dashboard/docs/superpowers/specs/2026-10-21-uaibd-task-messenger-design.md)

## Global Constraints
- Target platform: Windows Electron desktop app.
- Style theme: Discord dark industrial palette with BMZ accent colors (graphite `#2f3136`, slate `#36393f`, dark navy `#202225`, BMZ steel blue `#2d7d9a`, alert red `#f04747`, accent green `#43b581`).
- Roles: strictly `'chief'` (Начальник УАиБД), `'lead_engineer'` (Ведущий инженер), `'developer'` (Программист).
- Task statuses: `'todo'` -> `'in_progress'` -> `'review'` -> `'done'`.
- No settings button in UI for Supabase keys: configuration loaded via `config.json`.
- Complete test coverage for each task before marking complete.

---

### Task 1: Project Scaffolding, Configuration & Database Schema

**Files:**
- Create: `uaibd-messenger/package.json`
- Create: `uaibd-messenger/config.json`
- Create: `uaibd-messenger/schema.sql`
- Create: `uaibd-messenger/test/config.test.js`

**Interfaces:**
- Consumes: None
- Produces: `config.json` credentials structure `{ supabaseUrl: string, supabaseAnonKey: string }`, `schema.sql` DDL for Supabase setup.

- [ ] **Step 1: Write the failing configuration & schema validation test**

```javascript
// uaibd-messenger/test/config.test.js
const fs = require('fs');
const path = require('path');

describe('Project Configuration & Schema', () => {
    test('config.json exists and contains required Supabase properties', () => {
        const configPath = path.join(__dirname, '..', 'config.json');
        expect(fs.existsSync(configPath)).toBe(true);
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        expect(config).toHaveProperty('supabaseUrl');
        expect(config).toHaveProperty('supabaseAnonKey');
        expect(typeof config.supabaseUrl).toBe('string');
        expect(typeof config.supabaseAnonKey).toBe('string');
    });

    test('schema.sql contains required tables and constraints', () => {
        const schemaPath = path.join(__dirname, '..', 'schema.sql');
        expect(fs.existsSync(schemaPath)).toBe(true);
        const sql = fs.readFileSync(schemaPath, 'utf8');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS profiles');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS channels');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS direct_chats');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS messages');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS tasks');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS task_reports');
        expect(sql).toContain("'chief'");
        expect(sql).toContain("'lead_engineer'");
        expect(sql).toContain("'developer'");
        expect(sql).toContain("'todo'");
        expect(sql).toContain("'review'");
        expect(sql).toContain("'done'");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node -e "require('./uaibd-messenger/test/config.test.js')"`
Expected: FAIL (file or folder not found).

- [ ] **Step 3: Create package.json, config.json, and schema.sql**

Write `uaibd-messenger/package.json`:
```json
{
  "name": "uaibd-messenger",
  "version": "1.0.0",
  "description": "Enterprise Task Messenger for BMZ UA&BD Department",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "test": "node --test test/*.test.js"
  },
  "keywords": ["bmz", "uaibd", "messenger", "tasks", "electron", "supabase"],
  "author": "BMZ UA&BD",
  "license": "ISC",
  "dependencies": {
    "@supabase/supabase-js": "^2.49.1"
  },
  "devDependencies": {
    "electron": "^34.2.0"
  }
}
```

Write `uaibd-messenger/config.json`:
```json
{
  "supabaseUrl": "https://your-project.supabase.co",
  "supabaseAnonKey": "your-anon-key-here"
}
```

Write `uaibd-messenger/schema.sql` with all DDL statements, indexes, RLS policies, seed profiles for testing (Иванов А.С. — Начальник, Петров В.И. — Вед. инженер, Сидоров М.К. — Программист АСУ ТП, Ковалев Д.А. — Программист), seed channels, and bucket creation script.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test uaibd-messenger/test/config.test.js`
Expected: PASS with 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add uaibd-messenger/package.json uaibd-messenger/config.json uaibd-messenger/schema.sql uaibd-messenger/test/config.test.js
git commit -m "feat(uaibd): project scaffolding, config and supabase database schema"
```

---

### Task 2: Supabase Data Access Client Module

**Files:**
- Create: `uaibd-messenger/src/supabaseClient.js`
- Create: `uaibd-messenger/test/supabaseClient.test.js`

**Interfaces:**
- Consumes: `uaibd-messenger/config.json`
- Produces: `SupabaseService` class exposing:
  - `init(config)`
  - `getProfiles()`, `updateProfileStatus(userId, isOnline, statusText)`
  - `getChannels()`, `getChannelMessages(channelId)`
  - `getDirectChats(userId)`, `getDirectMessages(chatId)`
  - `sendMessage(senderId, targetType, targetId, text, attachments)`
  - `getTasks(filterUser, role)`
  - `createTask(title, description, creatorId, assigneeId, priority, dueDate)`
  - `updateTaskStatus(taskId, newStatus)`
  - `submitTaskReport(taskId, authorId, reportText, attachments)`
  - `reviewTaskReport(taskId, isApproved, comment)`
  - `uploadFile(bucket, path, fileBuffer, mimeType)`
  - `subscribeToMessages(callback)`, `subscribeToTasks(callback)`

- [ ] **Step 1: Write failing unit tests for SupabaseService**

```javascript
// uaibd-messenger/test/supabaseClient.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { SupabaseService } = require('../src/supabaseClient');

describe('SupabaseService Unit Tests', () => {
    test('validates configuration and initializes client', () => {
        const service = new SupabaseService();
        assert.strictEqual(service.isConfigured(), false);
        service.init({
            supabaseUrl: 'https://test.supabase.co',
            supabaseAnonKey: 'test-key'
        });
        assert.strictEqual(service.isConfigured(), true);
    });

    test('validates role permissions for task creation', () => {
        const service = new SupabaseService();
        assert.strictEqual(service.canCreateTask('developer'), false);
        assert.strictEqual(service.canCreateTask('lead_engineer'), true);
        assert.strictEqual(service.canCreateTask('chief'), true);
    });

    test('validates role permissions for report review', () => {
        const service = new SupabaseService();
        assert.strictEqual(service.canReviewReport('developer'), false);
        assert.strictEqual(service.canReviewReport('lead_engineer'), true);
        assert.strictEqual(service.canReviewReport('chief'), true);
    });

    test('formats file attachment records correctly', () => {
        const service = new SupabaseService();
        const record = service.formatAttachment('error_log.txt', 1024, 'text/plain', 'https://storage/error_log.txt');
        assert.strictEqual(record.name, 'error_log.txt');
        assert.strictEqual(record.sizeFormatted, '1.0 KB');
        assert.strictEqual(record.icon, 'text');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test uaibd-messenger/test/supabaseClient.test.js`
Expected: FAIL (Cannot find module '../src/supabaseClient').

- [ ] **Step 3: Implement SupabaseService**

Implement `uaibd-messenger/src/supabaseClient.js` with all methods, robust parameter checking, file size formatting helpers, role permission guards, and Realtime event dispatchers.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test uaibd-messenger/test/supabaseClient.test.js`
Expected: PASS with 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add uaibd-messenger/src/supabaseClient.js uaibd-messenger/test/supabaseClient.test.js
git commit -m "feat(uaibd): supabase client service and role permission guards"
```

---

### Task 3: Electron Main Process & Preload Bridge

**Files:**
- Create: `uaibd-messenger/main.js`
- Create: `uaibd-messenger/preload.js`
- Create: `uaibd-messenger/test/electronBridge.test.js`

**Interfaces:**
- Consumes: `uaibd-messenger/config.json`
- Produces: `window.uaibdAPI` object in renderer context:
  - `getConfig()`
  - `showNotification(title, body)`
  - `openExternal(url)`
  - `minimize()`, `maximize()`, `close()`
  - `readLocalFile(filePath)`

- [ ] **Step 1: Write failing test for Electron bridge interfaces**

```javascript
// uaibd-messenger/test/electronBridge.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Electron Main & Preload Bridge', () => {
    test('main.js exists and configures browser window with preload', () => {
        const mainPath = path.join(__dirname, '..', 'main.js');
        const code = fs.readFileSync(mainPath, 'utf8');
        assert.ok(code.includes('BrowserWindow'));
        assert.ok(code.includes('preload:'));
        assert.ok(code.includes('ipcMain'));
    });

    test('preload.js exposes uaibdAPI via contextBridge', () => {
        const preloadPath = path.join(__dirname, '..', 'preload.js');
        const code = fs.readFileSync(preloadPath, 'utf8');
        assert.ok(code.includes('contextBridge.exposeInMainWorld'));
        assert.ok(code.includes('uaibdAPI'));
        assert.ok(code.includes('getConfig'));
        assert.ok(code.includes('showNotification'));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test uaibd-messenger/test/electronBridge.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement main.js and preload.js**

Implement `uaibd-messenger/main.js` with standard 1280x800 minimum frame, dark background `#202225`, IPC handlers for config loading, system notifications, and `uaibd-messenger/preload.js` with secure `contextBridge`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test uaibd-messenger/test/electronBridge.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add uaibd-messenger/main.js uaibd-messenger/preload.js uaibd-messenger/test/electronBridge.test.js
git commit -m "feat(uaibd): electron main process and secure preload bridge"
```

---

### Task 4: Discord-Style Dark Layout & CSS Design System

**Files:**
- Create: `uaibd-messenger/renderer/index.html`
- Create: `uaibd-messenger/renderer/style.css`
- Create: `uaibd-messenger/test/layout.test.js`

**Interfaces:**
- Consumes: None (pure DOM/CSS)
- Produces: Complete UI shell with:
  - Sidebar 1: Plant badge (`БМЗ / УАиБД`), Home button, Profile bar.
  - Sidebar 2: `#общий-чат`, Direct contacts list with online indicators and badge counts.
  - Main area: Header with channel name, topic, and tab buttons (`[ 💬 Чат ]`, `[ 📋 Задачи (N) ]`).
  - Chat stage: Messages list, attachment previews, message input with upload trigger.
  - Tasks stage: Task cards grid/list, priority tags, status indicators, action buttons.
  - Modals: "Назначить задачу", "Сдать отчет по задаче", "Авторизация / Смена профиля".

- [ ] **Step 1: Write failing layout DOM structure test**

```javascript
// uaibd-messenger/test/layout.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Discord-style Layout HTML and CSS', () => {
    test('index.html contains three-column Discord containers and required IDs', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
        assert.ok(html.includes('id="serverSidebar"'));
        assert.ok(html.includes('id="channelsSidebar"'));
        assert.ok(html.includes('id="mainContent"'));
        assert.ok(html.includes('id="tabChat"'));
        assert.ok(html.includes('id="tabTasks"'));
        assert.ok(html.includes('id="messagesContainer"'));
        assert.ok(html.includes('id="tasksContainer"'));
        assert.ok(html.includes('id="messageInput"'));
        assert.ok(html.includes('id="btnAttachFile"'));
        assert.ok(html.includes('id="modalCreateTask"'));
        assert.ok(html.includes('id="modalSubmitReport"'));
    });

    test('style.css defines Discord color tokens and utility classes', () => {
        const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'style.css'), 'utf8');
        assert.ok(css.includes('--bg-primary: #36393f') || css.includes('#36393f'));
        assert.ok(css.includes('--bg-secondary: #2f3136') || css.includes('#2f3136'));
        assert.ok(css.includes('--bg-tertiary: #202225') || css.includes('#202225'));
        assert.ok(css.includes('.badge-urgent'));
        assert.ok(css.includes('.badge-high'));
        assert.ok(css.includes('.task-card'));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test uaibd-messenger/test/layout.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement index.html and style.css**

Craft the complete, clean, Discord-style UI in `uaibd-messenger/renderer/index.html` and `uaibd-messenger/renderer/style.css` using modern flexbox/grid, custom scrollbars, tooltips, smooth modals, and responsive layout.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test uaibd-messenger/test/layout.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add uaibd-messenger/renderer/index.html uaibd-messenger/renderer/style.css uaibd-messenger/test/layout.test.js
git commit -m "feat(uaibd): discord-style dark theme layout and modals"
```

---

### Task 5: Real-Time Chat Engine & File Attachment Renderer

**Files:**
- Create: `uaibd-messenger/renderer/chat.js`
- Create: `uaibd-messenger/test/chatRenderer.test.js`

**Interfaces:**
- Consumes: `SupabaseService`
- Produces: `ChatModule` object exposing:
  - `renderMessages(messagesList, currentUserId)`
  - `appendSingleMessage(message, currentUserId)`
  - `formatMessageContent(text)` (escapes HTML, formats code snippets with ```` ``` ````)
  - `renderAttachmentCard(attachment)`
  - `handleFileUpload(file)`

- [ ] **Step 1: Write failing unit test for chat rendering and markdown formatting**

```javascript
// uaibd-messenger/test/chatRenderer.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { formatMessageContent, renderAttachmentCard } = require('../renderer/chat');

describe('Chat Formatting and Attachments', () => {
    test('formats code blocks with pre/code tags', () => {
        const raw = 'Исправил регистр:\n```plc\nMW100 := 450;\n```\nПроверьте';
        const formatted = formatMessageContent(raw);
        assert.ok(formatted.includes('<pre><code'));
        assert.ok(formatted.includes('MW100 := 450;'));
    });

    test('escapes malicious HTML tags', () => {
        const raw = '<script>alert(1)</script>';
        const formatted = formatMessageContent(raw);
        assert.ok(!formatted.includes('<script>'));
        assert.ok(formatted.includes('&lt;script&gt;'));
    });

    test('renders file attachment card for pdf and txt documents', () => {
        const att = { name: 'furnace_dump.txt', sizeFormatted: '12.4 KB', url: 'https://files/furnace_dump.txt' };
        const html = renderAttachmentCard(att);
        assert.ok(html.includes('furnace_dump.txt'));
        assert.ok(html.includes('12.4 KB'));
        assert.ok(html.includes('href="https://files/furnace_dump.txt"'));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test uaibd-messenger/test/chatRenderer.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement renderer/chat.js**

Write `uaibd-messenger/renderer/chat.js` with sanitization, code formatting, file attachment badge generation, date headers, scroll-to-bottom handling, and typing debouncing.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test uaibd-messenger/test/chatRenderer.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add uaibd-messenger/renderer/chat.js uaibd-messenger/test/chatRenderer.test.js
git commit -m "feat(uaibd): chat rendering engine, code snippet formatter and attachment cards"
```

---

### Task 6: Task Board & Engineering Report Submission Engine

**Files:**
- Create: `uaibd-messenger/renderer/tasks.js`
- Create: `uaibd-messenger/test/tasksEngine.test.js`

**Interfaces:**
- Consumes: `SupabaseService`
- Produces: `TasksModule` exposing:
  - `renderTaskCards(tasksList, currentRole, currentUserId)`
  - `filterTasks(tasksList, statusFilter)`
  - `generateStatusBadge(status)`
  - `generatePriorityBadge(priority)`
  - `renderReportBlock(report, currentRole)`

- [ ] **Step 1: Write failing unit test for task status lifecycle and permissions**

```javascript
// uaibd-messenger/test/tasksEngine.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { generateStatusBadge, generatePriorityBadge, getAvailableTaskActions } = require('../renderer/tasks');

describe('Task Board Logic & Role Actions', () => {
    test('renders correct status and priority badges', () => {
        const todoBadge = generateStatusBadge('todo');
        assert.ok(todoBadge.includes('Назначена'));
        const urgentBadge = generatePriorityBadge('urgent');
        assert.ok(urgentBadge.includes('Авария') || urgentBadge.includes('Срочно'));
    });

    test('developer can take task and submit report', () => {
        const actionsTodo = getAvailableTaskActions('todo', 'developer', true);
        assert.ok(actionsTodo.includes('take_in_progress'));
        const actionsInProgress = getAvailableTaskActions('in_progress', 'developer', true);
        assert.ok(actionsInProgress.includes('submit_report'));
    });

    test('lead engineer can review report or return for rework', () => {
        const actionsReview = getAvailableTaskActions('review', 'lead_engineer', false);
        assert.ok(actionsReview.includes('approve'));
        assert.ok(actionsReview.includes('reject'));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test uaibd-messenger/test/tasksEngine.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement renderer/tasks.js**

Implement `uaibd-messenger/renderer/tasks.js` with full state transition handlers, deadline warning calculation, action button matrix, report modal bindings, and review comment dialogues.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test uaibd-messenger/test/tasksEngine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add uaibd-messenger/renderer/tasks.js uaibd-messenger/test/tasksEngine.test.js
git commit -m "feat(uaibd): task board logic, role action rules and report submission engine"
```

---

### Task 7: Full Application Controller, Auth & Realtime Subscriptions

**Files:**
- Create: `uaibd-messenger/renderer/app.js`
- Create: `uaibd-messenger/test/appFlow.test.js`

**Interfaces:**
- Consumes: `ChatModule`, `TasksModule`, `SupabaseService`, `window.uaibdAPI`
- Produces: Initialized state machine, active view switcher (Channel vs Direct Message, Chat tab vs Tasks tab), seed user fast-switcher for testing/defense, Realtime live subscriptions.

- [ ] **Step 1: Write integration tests for app state transitions**

```javascript
// uaibd-messenger/test/appFlow.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { AppState } = require('../renderer/app');

describe('App State Machine & View Navigation', () => {
    test('initializes with general channel active by default', () => {
        const state = new AppState();
        assert.strictEqual(state.activeViewType, 'channel');
        assert.strictEqual(state.activeSlug, 'general');
        assert.strictEqual(state.activeTab, 'chat');
    });

    test('switching to direct user switches active view and keeps task context', () => {
        const state = new AppState();
        state.selectUserDirectChat('user-dev-1', 'Сидоров М.К.', 'developer');
        assert.strictEqual(state.activeViewType, 'direct');
        assert.strictEqual(state.activeDirectUserId, 'user-dev-1');
        assert.strictEqual(state.activeDirectUserName, 'Сидоров М.К.');
    });

    test('switching tab between chat and tasks updates state', () => {
        const state = new AppState();
        state.setActiveTab('tasks');
        assert.strictEqual(state.activeTab, 'tasks');
        state.setActiveTab('chat');
        assert.strictEqual(state.activeTab, 'chat');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test uaibd-messenger/test/appFlow.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement renderer/app.js**

Wire up the entire client:
1. Load config and profiles on start.
2. Provide a clean profile switcher modal (Начальник, Вед. инженер, Программист) so the user can easily log in as any employee for defense or enter their own Supabase credentials.
3. Manage channel switching, direct message threads, task counters, file upload drag-and-drop, and Realtime event listeners.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test uaibd-messenger/test/appFlow.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add uaibd-messenger/renderer/app.js uaibd-messenger/test/appFlow.test.js
git commit -m "feat(uaibd): app controller, role switching modal and live event bindings"
```

---

### Task 8: Documentation, Defense Presentation Guide & Readme

**Files:**
- Create: `uaibd-messenger/README.md`
- Create: `uaibd-messenger/DEFENSE_GUIDE.md` (Методическое руководство для успешной защиты перед преподавателем)
- Modify: `README.md` (Главный корень проекта)

**Interfaces:**
- Consumes: All previous tasks
- Produces: Complete setup manual, SQL schema import instructions, university defense speech script with answers to tricky professor questions.

- [ ] **Step 1: Write uaibd-messenger/README.md**

Document installation (`npm install`), launch (`npm start`), configuration (`config.json`), Supabase setup in 3 minutes via SQL editor (`schema.sql`), and UI walkthrough.

- [ ] **Step 2: Write uaibd-messenger/DEFENSE_GUIDE.md**

Create an engineering and defense guide for the student:
- **Цель и актуальность проекта**: почему предприятию БМЗ необходим специализированный таск-мессенджер, а не стандартный Telegram/Discord (заводская безопасность, привязка задач к оборудованию, разделение ролей, хранение отчетов и логов).
- **Архитектурный стек**: Electron + PostgreSQL (Supabase) + Realtime WebSockets.
- **Демонстрационный сценарий для показа преподавателю (Шаг за шагом)**:
  1. Вход под ролью Ведущего инженера: демонстрация общего чата, создание задачи «Настройка ПЛК печи ДСП-1» с высоким приоритетом.
  2. Переключение на Программиста: мгновенное появление задачи, перевод «В работу», сдача отчета с прикреплением дампа логов `.txt`.
  3. Возврат к Ведущему инженеру: мгновенное обновление статуса, проверка отчета, нажатие «Принять задачу».
- **Ответы на типовые вопросы комиссии/преподавателя**:
  - «Как обеспечена безопасность данных?» (RLS политики в PostgreSQL, отсутствие посторонних в заводской сети).
  - «Почему Electron?» (кроссплатформенность, нативные уведомления ОС, доступ к локальным файлам дампов).
  - «Как работает Realtime без нагрузки на сервер?» (WebSocket события через Supabase Realtime).

- [ ] **Step 3: Update root README.md**

Add an overview of the UA&BD Task Messenger to the root project documentation.

- [ ] **Step 4: Run full test suite across the project**

Run: `node --test uaibd-messenger/test/*.test.js`
Expected: All tests PASS.

- [ ] **Step 5: Commit & push**

```bash
git add uaibd-messenger/README.md uaibd-messenger/DEFENSE_GUIDE.md README.md
git commit -m "docs(uaibd): user documentation and academic defense guide"
git push origin main
```
