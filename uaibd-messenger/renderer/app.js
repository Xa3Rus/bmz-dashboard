/**
 * UA&BD Task Messenger - Full Application Controller & State Engine
 * Department: Управление автоматизации и баз данных (УАиБД) БМЗ
 * Wires together ChatModule, TasksModule, SupabaseService, and uaibdAPI.
 * Manages active views (channels vs direct messages), tabs (chat vs tasks),
 * 1-click role/profile switcher for defense, task dialogs, file attachments,
 * and Supabase Realtime live subscriptions.
 */

(function (root, factory) {
    if (typeof exports === 'object' && typeof module !== 'undefined') {
        const ChatModule = require('./chat');
        const TasksModule = require('./tasks');
        let SupabaseService = null;
        try {
            SupabaseService = require('../src/supabaseClient').SupabaseService;
        } catch (_) {}
        let uaibdAPI = null;
        try {
            uaibdAPI = require('../preload');
        } catch (_) {}
        module.exports = factory(ChatModule, TasksModule, SupabaseService, uaibdAPI);
    } else if (typeof define === 'function' && define.amd) {
        define(['./chat', './tasks', '../src/supabaseClient', '../preload'], factory);
    } else {
        const exportsObj = factory(root.ChatModule, root.TasksModule, root.SupabaseService, root.uaibdAPI);
        root.AppState = exportsObj.AppState;
        root.AppController = exportsObj.AppController;
        root.SEED_PROFILES = exportsObj.SEED_PROFILES;
        root.appController = exportsObj.appController;
        if (typeof window !== 'undefined') {
            window.AppState = exportsObj.AppState;
            window.AppController = exportsObj.AppController;
            window.SEED_PROFILES = exportsObj.SEED_PROFILES;
            window.appController = exportsObj.appController;
        }
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function (
    ChatModuleDep,
    TasksModuleDep,
    SupabaseServiceDep,
    uaibdAPIDep
) {
    'use strict';

    // =========================================================================
    // SEED DATA FOR INTRA-DEPARTMENT TESTING & PROFESSOR DEFENSE
    // =========================================================================

    const SEED_PROFILES = [
        {
            id: '00000000-0000-0000-0000-000000000001',
            email: 'ivanov@bmz.by',
            full_name: 'Иванов А.С.',
            role: 'chief',
            status_text: 'Начальник УАиБД • В сети',
            avatar_color: '#e53935',
            initials: 'ИА',
            avatarClass: 'avatar-chief',
            roleBadgeClass: 'badge-role-chief',
            roleName: 'Начальник УАиБД',
            is_online: true
        },
        {
            id: '00000000-0000-0000-0000-000000000002',
            email: 'petrov@bmz.by',
            full_name: 'Петров В.И.',
            role: 'lead_engineer',
            status_text: 'Ведущий инженер • ДСП-1',
            avatar_color: '#f57c00',
            initials: 'ПВ',
            avatarClass: 'avatar-lead',
            roleBadgeClass: 'badge-role-lead',
            roleName: 'Вед. инженер',
            is_online: true
        },
        {
            id: '00000000-0000-0000-0000-000000000003',
            email: 'sidorov@bmz.by',
            full_name: 'Сидоров М.К.',
            role: 'developer',
            status_text: 'Программист АСУ ТП • На смене',
            avatar_color: '#2e7d32',
            initials: 'СМ',
            avatarClass: 'avatar-dev',
            roleBadgeClass: 'badge-role-dev',
            roleName: 'Программист АСУ ТП',
            is_online: true
        },
        {
            id: '00000000-0000-0000-0000-000000000004',
            email: 'kovalev@bmz.by',
            full_name: 'Ковалев Д.А.',
            role: 'developer',
            status_text: 'Программист • Базы данных',
            avatar_color: '#1976d2',
            initials: 'КД',
            avatarClass: 'avatar-dev',
            roleBadgeClass: 'badge-role-dev',
            roleName: 'Программист БД',
            is_online: false
        }
    ];

    const SEED_CHANNELS = [
        {
            id: '00000000-0000-0000-0000-000000000010',
            slug: 'general',
            name: 'общий-чат',
            topic: 'Оперативная координация дежурных смен и объявления УАиБД'
        }
    ];

    const SEED_INITIAL_TASKS = [
        {
            id: '00000000-0000-0000-0000-000000000101',
            title: 'Настройка связи ПЛК печи ДСП-1 с сервером SCADA',
            description: 'Необходимо устранить периодические обрывы пакетов Profinet на контроллере S7-1500 (стойка АСУ ТП печи ДСП-1) и выгрузить диагностический лог.',
            creator_id: '00000000-0000-0000-0000-000000000002',
            assignee_id: '00000000-0000-0000-0000-000000000003',
            priority: 'urgent',
            status: 'in_progress',
            due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
            created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
            reports: []
        },
        {
            id: '00000000-0000-0000-0000-000000000102',
            title: 'Оптимизация SQL-индексов таблицы плавок сталеплавильного цеха',
            description: 'Замедлилась выборка истории энергопотребления за квартал в MES-системе. Проанализировать план запроса и добавить составной индекс.',
            creator_id: '00000000-0000-0000-0000-000000000001',
            assignee_id: '00000000-0000-0000-0000-000000000004',
            priority: 'normal',
            status: 'todo',
            due_date: new Date(Date.now() + 259200000).toISOString().split('T')[0],
            created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
            reports: []
        }
    ];

    const SEED_INITIAL_MESSAGES = [
        {
            id: '00000000-0000-0000-0000-000000000201',
            channel_id: '00000000-0000-0000-0000-000000000010',
            sender_id: '00000000-0000-0000-0000-000000000001',
            content: 'Коллеги, в 14:00 плановая остановка ДСП-1 на техобслуживание. Просьба зафиксировать состояние датчиков температуры и давления свода печи.',
            attachments: [],
            created_at: new Date(Date.now() - 3600000 * 3).toISOString()
        },
        {
            id: '00000000-0000-0000-0000-000000000202',
            channel_id: '00000000-0000-0000-0000-000000000010',
            sender_id: '00000000-0000-0000-0000-000000000002',
            content: 'Принято. Сидоров М.К. уже проверяет контроллеры S7-1500 по регламенту задачи #0101.',
            attachments: [],
            created_at: new Date(Date.now() - 3600000 * 2).toISOString()
        }
    ];

    // =========================================================================
    // APPLICATION STATE MACHINE
    // =========================================================================

    class AppState {
        constructor() {
            this.activeViewType = 'channel'; // 'channel' | 'direct'
            this.activeSlug = 'general';
            this.activeTab = 'chat'; // 'chat' | 'tasks'

            this.currentUser = Object.assign({}, SEED_PROFILES[0]);
            this.activeDirectUserId = null;
            this.activeDirectUserName = null;
            this.activeDirectUserRole = null;
            this.activeDirectChatId = null;

            this.profiles = [...SEED_PROFILES];
            this.channels = [...SEED_CHANNELS];
            this.tasks = [...SEED_INITIAL_TASKS];
            this.messages = [...SEED_INITIAL_MESSAGES];

            this.taskFilter = 'all';
            this.pendingChatAttachments = [];
            this.pendingReportAttachments = [];
            this.activeReviewTask = null;
        }

        /**
         * Sets active view to a channel
         * @param {string} slug
         * @param {string} [channelName]
         * @param {string} [topic]
         */
        selectChannel(slug = 'general', channelName = 'общий-чат', topic = '') {
            this.activeViewType = 'channel';
            this.activeSlug = slug;
            this.activeDirectUserId = null;
            this.activeDirectUserName = null;
            this.activeDirectUserRole = null;
            this.activeDirectChatId = null;
        }

        /**
         * Sets active view to direct messaging with a user
         * @param {string} userId
         * @param {string} userName
         * @param {string} [userRole]
         * @param {string} [directChatId]
         */
        selectUserDirectChat(userId, userName, userRole = null, directChatId = null) {
            this.activeViewType = 'direct';
            this.activeDirectUserId = userId;
            this.activeDirectUserName = userName;
            this.activeDirectUserRole = userRole;
            this.activeDirectChatId = directChatId || `dc-${userId}`;
        }

        /**
         * Toggles tab mode between 'chat' and 'tasks'
         * @param {'chat'|'tasks'} tab
         */
        setActiveTab(tab) {
            this.activeTab = (tab === 'tasks') ? 'tasks' : 'chat';
        }

        /**
         * Updates the current authenticated / switched user
         * @param {Object} user
         */
        setCurrentUser(user) {
            if (!user) return;
            this.currentUser = Object.assign({}, user);
        }

        /**
         * Replaces or updates the tasks collection
         * @param {Array} tasks
         */
        setTasks(tasks) {
            this.tasks = Array.isArray(tasks) ? tasks : [];
        }

        /**
         * Replaces or updates the messages collection
         * @param {Array} messages
         */
        setMessages(messages) {
            this.messages = Array.isArray(messages) ? messages : [];
        }

        /**
         * Appends a message to the internal messages list
         * @param {Object} message
         */
        addMessage(message) {
            if (!message) return;
            const existingIdx = this.messages.findIndex(m => m.id === message.id);
            if (existingIdx >= 0) {
                this.messages[existingIdx] = message;
            } else {
                this.messages.push(message);
            }
        }

        /**
         * Updates or inserts a task in the tasks list
         * @param {Object} task
         */
        upsertTask(task) {
            if (!task) return;
            const existingIdx = this.tasks.findIndex(t => t.id === task.id);
            if (existingIdx >= 0) {
                this.tasks[existingIdx] = Object.assign({}, this.tasks[existingIdx], task);
            } else {
                this.tasks.unshift(task);
            }
        }

        /**
         * Calculates unread / active task count for the given user (or currentUser)
         * For developer: tasks assigned to them with status !== 'done'
         * For leadership (chief, lead_engineer): all departmental tasks with status !== 'done'
         * @param {Object} [user]
         * @returns {number}
         */
        getActiveTaskCount(user = this.currentUser) {
            if (!user || !Array.isArray(this.tasks)) return 0;
            if (user.role === 'developer') {
                return this.tasks.filter(t => t && t.assignee_id === user.id && t.status !== 'done').length;
            }
            if (user.role === 'chief' || user.role === 'lead_engineer') {
                return this.tasks.filter(t => t && t.status !== 'done').length;
            }
            return 0;
        }

        /**
         * Returns tasks filtered for the current view and taskFilter status
         * @returns {Array}
         */
        getFilteredTasks() {
            if (!Array.isArray(this.tasks)) return [];

            let list = this.tasks;

            // In direct chat view, scope tasks to the selected user
            if (this.activeViewType === 'direct' && this.activeDirectUserId) {
                const targetId = this.activeDirectUserId;
                list = list.filter(t =>
                    t.assignee_id === targetId ||
                    t.creator_id === targetId ||
                    (this.currentUser && t.assignee_id === this.currentUser.id && t.creator_id === targetId) ||
                    (this.currentUser && t.creator_id === this.currentUser.id && t.assignee_id === targetId)
                );
            }

            // Apply status filter
            if (this.taskFilter && this.taskFilter !== 'all') {
                list = list.filter(t => (t.status || '').toLowerCase() === this.taskFilter.toLowerCase());
            }

            return list;
        }
    }

    // =========================================================================
    // APPLICATION CONTROLLER
    // =========================================================================

    class AppController {
        /**
         * @param {Object} [options]
         */
        constructor(options = {}) {
            this.state = options.state || new AppState();
            this.api = options.api || (typeof window !== 'undefined' ? window.uaibdAPI : null) || uaibdAPIDep || {
                getConfig: async () => ({}),
                showNotification: async () => ({ success: true }),
                openExternal: async () => true,
                minimize: async () => true,
                maximize: async () => true,
                close: async () => true,
                readLocalFile: async () => ''
            };

            const SupabaseServiceClass = options.supabaseServiceClass ||
                (typeof window !== 'undefined' ? window.SupabaseService : null) ||
                (SupabaseServiceDep && SupabaseServiceDep.SupabaseService ? SupabaseServiceDep.SupabaseService : SupabaseServiceDep);

            if (options.supabaseService) {
                this.supabaseService = options.supabaseService;
            } else if (SupabaseServiceClass) {
                this.supabaseService = new SupabaseServiceClass();
            } else {
                this.supabaseService = {
                    init: () => {},
                    isConfigured: () => false,
                    canCreateTask: (r) => r === 'chief' || r === 'lead_engineer',
                    canReviewReport: (r) => r === 'chief' || r === 'lead_engineer',
                    getProfiles: async () => [...SEED_PROFILES],
                    getChannels: async () => [...SEED_CHANNELS],
                    getChannelMessages: async () => [...SEED_INITIAL_MESSAGES],
                    getDirectMessages: async () => [],
                    getTasks: async () => [...SEED_INITIAL_TASKS],
                    updateProfileStatus: async () => ({}),
                    updateTaskStatus: async (id, s) => ({ id, status: s }),
                    createTask: async (title, d, c, a, p, due) => ({ id: `task-${Date.now()}`, title, description: d, creator_id: c, assignee_id: a, priority: p, due_date: due, status: 'todo' }),
                    submitTaskReport: async (t, auth, rep, att) => ({ id: `rep-${Date.now()}`, task_id: t, author_id: auth, report_text: rep, attachments: att }),
                    reviewTaskReport: async (t, app, c) => ({ taskId: t, status: app ? 'done' : 'todo', isApproved: app, review_comment: c }),
                    sendMessage: async (s, type, target, text, att) => ({ id: `msg-${Date.now()}`, sender_id: s, content: text, attachments: att || [], created_at: new Date().toISOString() }),
                    subscribeToMessages: () => ({ unsubscribe: () => {} }),
                    subscribeToTasks: () => ({ unsubscribe: () => {} }),
                    formatAttachment: (n, s, t, u) => ({ name: n, size: s, type: t || '', url: u || '', sizeFormatted: `${s} B`, icon: 'file' })
                };
            }

            this.chatModule = options.chatModule || (typeof window !== 'undefined' ? window.ChatModule : null) || ChatModuleDep;
            this.tasksModule = options.tasksModule || (typeof window !== 'undefined' ? window.TasksModule : null) || TasksModuleDep;

            this.document = options.document || (typeof document !== 'undefined' ? document : null);
            this.window = options.window || (typeof window !== 'undefined' ? window : null);

            this.messageSubscription = null;
            this.taskSubscription = null;
        }

        /**
         * Initializes the entire application
         */
        async init() {
            // 1. Load config and initialize SupabaseService
            let config = {};
            try {
                if (this.api && typeof this.api.getConfig === 'function') {
                    config = await this.api.getConfig();
                }
            } catch (err) {
                console.warn('[AppController] Failed to read config via API:', err);
            }

            if (this.supabaseService && typeof this.supabaseService.init === 'function') {
                this.supabaseService.init(config || {});
            }

            // 2. Load profiles
            await this.loadProfiles();

            // 3. Load channels
            await this.loadChannels();

            // 4. Load tasks
            await this.loadTasks();

            // 5. Load initial channel messages
            await this.loadMessages();

            // 6. Bind DOM events if running in browser
            if (this.document) {
                this.bindAllEvents();
                this.renderAll();
            }

            // 7. Subscribe to Realtime events
            this.setupRealtimeSubscriptions();

            return this;
        }

        /**
         * Loads profiles from remote Supabase or seed fallback
         */
        async loadProfiles() {
            try {
                if (this.supabaseService && typeof this.supabaseService.getProfiles === 'function') {
                    const profiles = await this.supabaseService.getProfiles();
                    if (profiles && profiles.length > 0) {
                        this.state.profiles = profiles;
                        // Synchronize current user with loaded profile
                        const currentMatch = profiles.find(p => p.id === this.state.currentUser.id || p.email === this.state.currentUser.email);
                        if (currentMatch) {
                            this.state.setCurrentUser(currentMatch);
                        } else {
                            this.state.setCurrentUser(profiles[0]);
                        }
                        return;
                    }
                }
            } catch (err) {
                console.warn('[AppController] Falling back to seed profiles:', err);
            }

            this.state.profiles = [...SEED_PROFILES];
            if (!this.state.currentUser) {
                this.state.setCurrentUser(SEED_PROFILES[0]);
            }
        }

        /**
         * Loads channels from remote Supabase or seed fallback
         */
        async loadChannels() {
            try {
                if (this.supabaseService && typeof this.supabaseService.getChannels === 'function') {
                    const channels = await this.supabaseService.getChannels();
                    if (channels && channels.length > 0) {
                        this.state.channels = channels;
                        return;
                    }
                }
            } catch (err) {
                console.warn('[AppController] Falling back to seed channels:', err);
            }
            this.state.channels = [...SEED_CHANNELS];
        }

        /**
         * Loads tasks from remote Supabase or seed fallback
         */
        async loadTasks() {
            try {
                if (this.supabaseService && typeof this.supabaseService.getTasks === 'function') {
                    const tasks = await this.supabaseService.getTasks();
                    if (tasks && tasks.length > 0) {
                        this.state.setTasks(tasks);
                        return;
                    }
                }
            } catch (err) {
                console.warn('[AppController] Falling back to seed tasks:', err);
            }
            if (this.state.tasks.length === 0) {
                this.state.setTasks([...SEED_INITIAL_TASKS]);
            }
        }

        /**
         * Loads messages for current active view
         */
        async loadMessages() {
            try {
                if (this.state.activeViewType === 'channel') {
                    const channel = this.state.channels.find(c => c.slug === this.state.activeSlug) || this.state.channels[0];
                    if (channel && this.supabaseService && typeof this.supabaseService.getChannelMessages === 'function') {
                        const msgs = await this.supabaseService.getChannelMessages(channel.id);
                        if (msgs && msgs.length > 0) {
                            this.state.setMessages(msgs);
                            return;
                        }
                    }
                } else if (this.state.activeViewType === 'direct' && this.state.activeDirectChatId) {
                    if (this.supabaseService && typeof this.supabaseService.getDirectMessages === 'function') {
                        const msgs = await this.supabaseService.getDirectMessages(this.state.activeDirectChatId);
                        if (msgs) {
                            this.state.setMessages(msgs);
                            return;
                        }
                    }
                }
            } catch (err) {
                console.warn('[AppController] Error loading messages:', err);
            }
        }

        /**
         * Can current role create tasks
         * @returns {boolean}
         */
        canCurrentRoleCreateTask() {
            const role = this.state.currentUser ? this.state.currentUser.role : null;
            return role === 'chief' || role === 'lead_engineer';
        }

        /**
         * Can current role review reports
         * @returns {boolean}
         */
        canCurrentRoleReviewReport() {
            const role = this.state.currentUser ? this.state.currentUser.role : null;
            return role === 'chief' || role === 'lead_engineer';
        }

        /**
         * Switches current user profile in 1 click (crucial for defense & testing)
         * Accepts identifier: profile id, email, or role
         * @param {string} profileIdentifier
         */
        switchProfile(profileIdentifier) {
            if (!profileIdentifier) return;

            const needle = String(profileIdentifier).toLowerCase().trim();
            const found = this.state.profiles.find(p =>
                (p.id && String(p.id).toLowerCase() === needle) ||
                (p.email && p.email.toLowerCase() === needle) ||
                (p.role && p.role.toLowerCase() === needle) ||
                (p.full_name && p.full_name.toLowerCase().includes(needle))
            ) || SEED_PROFILES.find(p =>
                (p.id && String(p.id).toLowerCase() === needle) ||
                (p.email && p.email.toLowerCase() === needle) ||
                (p.role && p.role.toLowerCase() === needle)
            );

            if (!found) {
                console.warn(`[AppController] Profile not found for: ${profileIdentifier}`);
                return;
            }

            this.state.setCurrentUser(found);

            // Update remote online status if available
            if (this.supabaseService && typeof this.supabaseService.updateProfileStatus === 'function') {
                this.supabaseService.updateProfileStatus(found.id, true).catch(() => {});
            }

            this.notify(`Смена профиля: ${found.full_name}`, `Роль: ${this.getRoleDisplayName(found.role)}`);

            if (this.document) {
                this.closeModal('modalProfileSwitch');
                this.renderUserProfileBar();
                this.renderCreateTaskButtonVisibility();
                this.renderTaskCounters();
                this.renderTasksStage();
                this.renderChatMessages();
            }
        }

        /**
         * Switches view to channel
         * @param {string} slug
         */
        async selectChannel(slug = 'general') {
            const ch = this.state.channels.find(c => c.slug === slug) || { slug, name: `#${slug}` };
            this.state.selectChannel(slug, ch.name, ch.topic || '');

            await this.loadMessages();

            if (this.document) {
                this.updateSidebarActiveStyles();
                this.renderHeader();
                this.renderChatMessages();
                this.renderTasksStage();
            }
        }

        /**
         * Switches view to direct chat with employee
         * @param {string} userId
         * @param {string} userName
         * @param {string} [userRole]
         */
        async selectDirectChat(userId, userName, userRole = null) {
            this.state.selectUserDirectChat(userId, userName, userRole);

            await this.loadMessages();

            if (this.document) {
                this.updateSidebarActiveStyles();
                this.renderHeader();
                this.renderChatMessages();
                this.renderTasksStage();
            }
        }

        /**
         * Toggles tab between 'chat' and 'tasks'
         * @param {'chat'|'tasks'} tabName
         */
        switchTab(tabName) {
            this.state.setActiveTab(tabName);

            if (!this.document) return;

            const tabChat = this.document.getElementById('tabChat');
            const tabTasks = this.document.getElementById('tabTasks');
            const chatView = this.document.getElementById('chatView');
            const tasksView = this.document.getElementById('tasksView');

            if (tabName === 'tasks') {
                if (tabChat) {
                    tabChat.classList.remove('active');
                    tabChat.setAttribute('aria-selected', 'false');
                }
                if (tabTasks) {
                    tabTasks.classList.add('active');
                    tabTasks.setAttribute('aria-selected', 'true');
                }
                if (chatView) {
                    chatView.classList.add('hidden');
                    chatView.classList.remove('active');
                }
                if (tasksView) {
                    tasksView.classList.remove('hidden');
                    tasksView.classList.add('active');
                }
                this.renderTasksStage();
            } else {
                if (tabTasks) {
                    tabTasks.classList.remove('active');
                    tabTasks.setAttribute('aria-selected', 'false');
                }
                if (tabChat) {
                    tabChat.classList.add('active');
                    tabChat.setAttribute('aria-selected', 'true');
                }
                if (tasksView) {
                    tasksView.classList.add('hidden');
                    tasksView.classList.remove('active');
                }
                if (chatView) {
                    chatView.classList.remove('hidden');
                    chatView.classList.add('active');
                }
                this.renderChatMessages();
            }
        }

        /**
         * Changes tasks filter ('all' | 'todo' | 'in_progress' | 'review' | 'done')
         * @param {string} status
         */
        setTaskFilter(status) {
            this.state.taskFilter = status || 'all';
            if (this.document) {
                const filterBtns = this.document.querySelectorAll('.tasks-filters-group .filter-btn');
                filterBtns.forEach(btn => {
                    const btnStatus = btn.getAttribute('data-status');
                    if (btnStatus === this.state.taskFilter) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
                this.renderTasksStage();
            }
        }

        // =====================================================================
        // MODALS MANAGEMENT
        // =====================================================================

        /**
         * Opens a modal dialog by DOM ID
         * @param {string} modalId
         */
        openModal(modalId) {
            if (!this.document) return;
            const modal = this.document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('hidden');
            }
        }

        /**
         * Closes a modal dialog by DOM ID
         * @param {string} modalId
         */
        closeModal(modalId) {
            if (!this.document) return;
            const modal = this.document.getElementById(modalId);
            if (modal) {
                modal.classList.add('hidden');
            }
        }

        /**
         * Opens task creation modal with pre-populated developer select
         */
        openCreateTaskModal() {
            if (!this.canCurrentRoleCreateTask()) {
                this.notify('Отказ в доступе', 'Назначать задачи могут только Начальник УАиБД и Ведущий инженер');
                return;
            }

            if (!this.document) return;

            // Populate assignee select
            const select = this.document.getElementById('taskAssigneeSelect');
            if (select) {
                const devs = this.state.profiles.filter(p => p.role === 'developer' || p.role === 'lead_engineer');
                select.innerHTML = '<option value="">-- Выберите программиста --</option>' +
                    devs.map(d => `<option value="${d.id}">${d.full_name} (${this.getRoleDisplayName(d.role)})</option>`).join('');
            }

            // Reset form
            const form = this.document.getElementById('formCreateTask');
            if (form && typeof form.reset === 'function') form.reset();

            this.openModal('modalCreateTask');
        }

        /**
         * Opens report submission modal for a developer
         * @param {string} taskId
         */
        openSubmitReportModal(taskId) {
            const task = this.state.tasks.find(t => t.id === taskId);
            if (!task) return;

            if (this.document) {
                const idInput = this.document.getElementById('reportTaskId');
                const titleSpan = this.document.getElementById('reportTaskTitle');
                const textInput = this.document.getElementById('reportTextInput');
                const fileList = this.document.getElementById('reportFileList');

                if (idInput) idInput.value = taskId;
                if (titleSpan) titleSpan.textContent = task.title;
                if (textInput) textInput.value = '';
                if (fileList) fileList.innerHTML = '';

                this.state.pendingReportAttachments = [];
                this.openModal('modalSubmitReport');
            }
        }

        /**
         * Opens task review modal for leadership
         * @param {string} taskId
         */
        openReviewModal(taskId) {
            const task = this.state.tasks.find(t => t.id === taskId);
            if (!task) return;

            this.state.activeReviewTask = task;

            if (this.document) {
                const idInput = this.document.getElementById('reviewTaskId');
                const heading = this.document.getElementById('reviewTaskHeading');
                const body = this.document.getElementById('reviewReportBody');
                const attachments = this.document.getElementById('reviewAttachmentsList');
                const commentInput = this.document.getElementById('reviewCommentInput');

                if (idInput) idInput.value = taskId;
                if (heading) heading.textContent = task.title;

                // Extract latest report
                const report = (task.reports && task.reports.length > 0) ? task.reports[task.reports.length - 1] :
                    (task.report_text ? { report_text: task.report_text, attachments: task.attachments } : null);

                if (body) {
                    body.innerHTML = report ?
                        `<p class="report-desc">${this.escapeHtml(report.report_text || task.description)}</p>` :
                        `<p class="report-desc">${this.escapeHtml(task.description)}</p>`;
                }

                if (attachments) {
                    const atts = (report && Array.isArray(report.attachments)) ? report.attachments : [];
                    if (atts.length > 0 && this.chatModule && typeof this.chatModule.renderAttachmentCard === 'function') {
                        attachments.innerHTML = atts.map(a => this.chatModule.renderAttachmentCard(a)).join('');
                    } else {
                        attachments.innerHTML = '<span class="text-muted">Файлы к отчету не прикреплены</span>';
                    }
                }

                if (commentInput) commentInput.value = '';

                this.openModal('modalReviewTask');
            }
        }

        // =====================================================================
        // TASK LIFECYCLE WORKFLOW (todo -> in_progress -> review -> done)
        // =====================================================================

        /**
         * Submits task creation form
         * @param {Object} [taskPayload]
         * @returns {Promise<Object>}
         */
        async createTask(taskPayload) {
            if (!this.canCurrentRoleCreateTask()) {
                throw new Error('У вас нет прав на создание задач. Требуется роль Начальник УАиБД или Ведущий инженер.');
            }

            let payload = taskPayload;
            if (!payload && this.document) {
                const titleInput = this.document.getElementById('taskTitleInput');
                const descInput = this.document.getElementById('taskDescInput');
                const assigneeSelect = this.document.getElementById('taskAssigneeSelect');
                const prioritySelect = this.document.getElementById('taskPrioritySelect');
                const dueDateInput = this.document.getElementById('taskDueDateInput');

                const title = titleInput ? titleInput.value.trim() : '';
                const desc = descInput ? descInput.value.trim() : '';
                const assigneeId = assigneeSelect ? assigneeSelect.value : '';
                const priority = prioritySelect ? prioritySelect.value : 'normal';
                const dueDate = dueDateInput ? dueDateInput.value : null;

                if (!title || !desc || !assigneeId) {
                    this.notify('Ошибка заполнения', 'Заполните название, регламент и исполнителя задачи');
                    return null;
                }

                payload = { title, description: desc, assigneeId, priority, dueDate };
            }

            const creatorId = this.state.currentUser ? this.state.currentUser.id : 'user-chief';
            const created = await this.supabaseService.createTask(
                payload.title,
                payload.description,
                creatorId,
                payload.assigneeId,
                payload.priority || 'normal',
                payload.dueDate || null
            );

            const completeTask = Object.assign({
                id: (created && created.id) ? created.id : `task-${Date.now()}`,
                title: payload.title,
                description: payload.description,
                creator_id: creatorId,
                assignee_id: payload.assigneeId,
                priority: payload.priority || 'normal',
                status: 'todo',
                due_date: payload.dueDate || null,
                created_at: new Date().toISOString()
            }, created || {});

            this.state.upsertTask(completeTask);
            this.notify('Новая задача УАиБД', `Создана: ${payload.title}`);

            if (this.document) {
                this.closeModal('modalCreateTask');
                this.renderTaskCounters();
                this.renderTasksStage();
            }

            return completeTask;
        }

        /**
         * Developer takes task into progress
         * @param {string} taskId
         */
        async takeTaskInProgress(taskId) {
            const task = this.state.tasks.find(t => t.id === taskId);
            if (!task) return;

            await this.supabaseService.updateTaskStatus(taskId, 'in_progress');
            task.status = 'in_progress';
            task.updated_at = new Date().toISOString();
            this.state.upsertTask(task);

            this.notify('Задача принята в работу', task.title);

            if (this.document) {
                this.renderTaskCounters();
                this.renderTasksStage();
            }
        }

        /**
         * Developer submits engineering completion report
         * @param {string} taskId
         * @param {string} reportText
         * @param {Array} [attachments]
         */
        async submitTaskReport(taskId, reportText, attachments = []) {
            const task = this.state.tasks.find(t => t.id === taskId);
            if (!task) return;

            const authorId = this.state.currentUser ? this.state.currentUser.id : task.assignee_id;
            await this.supabaseService.submitTaskReport(taskId, authorId, reportText, attachments);

            task.status = 'review';
            task.updated_at = new Date().toISOString();
            if (!task.reports) task.reports = [];
            task.reports.push({
                task_id: taskId,
                author_id: authorId,
                report_text: reportText,
                attachments: attachments || [],
                created_at: new Date().toISOString()
            });

            this.state.upsertTask(task);
            this.notify('Отчет отправлен на проверку', task.title);

            if (this.document) {
                this.closeModal('modalSubmitReport');
                this.renderTaskCounters();
                this.renderTasksStage();
            }
        }

        /**
         * Chief or Lead reviews report: approves to 'done' or rejects back to 'todo'
         * @param {string} taskId
         * @param {boolean} isApproved
         * @param {string} [comment]
         */
        async reviewTask(taskId, isApproved, comment = '') {
            if (!this.canCurrentRoleReviewReport()) {
                throw new Error('У вас нет прав на проверку отчетов.');
            }

            const task = this.state.tasks.find(t => t.id === taskId);
            if (!task) return;

            await this.supabaseService.reviewTaskReport(taskId, isApproved, comment);

            task.status = isApproved ? 'done' : 'todo';
            task.updated_at = new Date().toISOString();
            if (task.reports && task.reports.length > 0) {
                task.reports[task.reports.length - 1].review_comment = comment;
            }

            this.state.upsertTask(task);

            const actionTitle = isApproved ? 'Задача принята и закрыта' : 'Задача возвращена на доработку';
            this.notify(actionTitle, `${task.title}${comment ? ` (${comment})` : ''}`);

            if (this.document) {
                this.closeModal('modalReviewTask');
                this.renderTaskCounters();
                this.renderTasksStage();
            }
        }

        // =====================================================================
        // CHAT MESSAGING
        // =====================================================================

        /**
         * Sends message to current channel or direct chat
         * @param {string} text
         * @param {Array} [attachments]
         */
        async sendMessage(text, attachments = []) {
            const cleanText = String(text || '').trim();
            const atts = Array.isArray(attachments) ? attachments : [];

            if (!cleanText && atts.length === 0) return null;

            const senderId = this.state.currentUser ? this.state.currentUser.id : 'unknown';
            const targetType = this.state.activeViewType;
            let targetId = null;

            if (targetType === 'channel') {
                const channel = this.state.channels.find(c => c.slug === this.state.activeSlug) || this.state.channels[0];
                targetId = channel ? channel.id : '00000000-0000-0000-0000-000000000010';
            } else {
                targetId = this.state.activeDirectChatId || `dc-${this.state.activeDirectUserId}`;
            }

            let sent = null;
            try {
                sent = await this.supabaseService.sendMessage(senderId, targetType, targetId, cleanText, atts);
            } catch (err) {
                console.warn('[AppController] Failed to send message via Supabase, using local fallback:', err);
            }

            const localMsg = Object.assign({
                id: (sent && sent.id) ? sent.id : `msg-${Date.now()}`,
                sender_id: senderId,
                content: cleanText,
                attachments: atts,
                created_at: new Date().toISOString()
            }, targetType === 'channel' ? { channel_id: targetId } : { direct_chat_id: targetId }, sent || {});

            this.state.addMessage(localMsg);

            if (this.document) {
                const container = this.document.getElementById('messagesContainer');
                if (container && this.chatModule && typeof this.chatModule.appendSingleMessage === 'function') {
                    this.chatModule.appendSingleMessage(container, localMsg, this.state.currentUser);
                }
                const input = this.document.getElementById('messageInput');
                if (input) {
                    input.value = '';
                    input.style.height = 'auto';
                }
                this.state.pendingChatAttachments = [];
                this.renderAttachmentPreviews();
            }

            return localMsg;
        }

        // =====================================================================
        // REALTIME EVENT HANDLERS
        // =====================================================================

        /**
         * Subscribes to Supabase Realtime channels for live updates
         */
        setupRealtimeSubscriptions() {
            if (!this.supabaseService) return;

            if (typeof this.supabaseService.subscribeToMessages === 'function') {
                this.messageSubscription = this.supabaseService.subscribeToMessages((payload) => {
                    this.handleRealtimeMessage(payload);
                });
            }

            if (typeof this.supabaseService.subscribeToTasks === 'function') {
                this.taskSubscription = this.supabaseService.subscribeToTasks((payload) => {
                    this.handleRealtimeTask(payload);
                });
            }
        }

        /**
         * Handles incoming live message payload from Realtime
         * @param {Object} payload
         */
        handleRealtimeMessage(payload) {
            if (!payload) return;
            const msg = payload.new || payload;
            if (!msg || !msg.id) return;

            // Don't duplicate self-sent messages already in state
            const exists = this.state.messages.some(m => m.id === msg.id);
            if (!exists) {
                this.state.addMessage(msg);

                const isCurrentView = (this.state.activeViewType === 'channel' && msg.channel_id) ||
                    (this.state.activeViewType === 'direct' && msg.direct_chat_id === this.state.activeDirectChatId);

                if (isCurrentView && this.document) {
                    const container = this.document.getElementById('messagesContainer');
                    const sender = this.state.profiles.find(p => p.id === msg.sender_id) || { full_name: 'Сотрудник' };
                    if (container && this.chatModule && typeof this.chatModule.appendSingleMessage === 'function') {
                        this.chatModule.appendSingleMessage(container, msg, sender);
                    }
                }

                // Show notification if sender is not currentUser
                const isFromOther = !this.state.currentUser || msg.sender_id !== this.state.currentUser.id;
                if (isFromOther) {
                    const sender = this.state.profiles.find(p => p.id === msg.sender_id);
                    const senderName = sender ? sender.full_name : 'Сотрудник УАиБД';
                    this.notify(`Новое сообщение от ${senderName}`, msg.content || 'Прикреплен файл');
                }
            }
        }

        /**
         * Handles incoming live task update payload from Realtime
         * @param {Object} payload
         */
        handleRealtimeTask(payload) {
            if (!payload) return;
            const task = payload.new || payload;
            if (!task || !task.id) return;

            this.state.upsertTask(task);

            if (this.document) {
                this.renderTaskCounters();
                this.renderTasksStage();
            }

            const isForMe = this.state.currentUser && (task.assignee_id === this.state.currentUser.id || task.creator_id === this.state.currentUser.id);
            if (isForMe) {
                this.notify(`Задача обновлена: ${task.title}`, `Статус: ${task.status}`);
            }
        }

        // =====================================================================
        // UI RENDERING HELPERS
        // =====================================================================

        renderAll() {
            if (!this.document) return;
            this.renderUserProfileBar();
            this.renderSidebarContacts();
            this.renderHeader();
            this.renderCreateTaskButtonVisibility();
            this.renderTaskCounters();
            this.renderChatMessages();
            this.renderTasksStage();
        }

        renderUserProfileBar() {
            if (!this.document) return;
            const u = this.state.currentUser || SEED_PROFILES[0];
            const avatar = this.document.getElementById('currentUserAvatar');
            const name = this.document.getElementById('currentUserName');
            const role = this.document.getElementById('currentUserRole');

            if (avatar) {
                avatar.textContent = this.getInitials(u.full_name || 'ИА');
                avatar.className = `avatar-circle ${this.getAvatarClass(u.role)}`;
            }
            if (name) name.textContent = u.full_name || 'Пользователь';
            if (role) {
                role.textContent = this.getRoleDisplayName(u.role);
                role.className = `user-role ${this.getRoleBadgeClass(u.role)}`;
            }
        }

        renderSidebarContacts() {
            if (!this.document) return;

            const leadershipList = this.document.getElementById('contactsLeadership');
            const devsList = this.document.getElementById('contactsDevelopers');

            const leadership = this.state.profiles.filter(p => p.role === 'chief' || p.role === 'lead_engineer');
            const devs = this.state.profiles.filter(p => p.role === 'developer');

            if (leadershipList) {
                leadershipList.innerHTML = leadership.map(p => this.renderContactItemHtml(p)).join('');
            }
            if (devsList) {
                devsList.innerHTML = devs.map(p => this.renderContactItemHtml(p)).join('');
            }
        }

        renderContactItemHtml(profile) {
            const activeClass = (this.state.activeViewType === 'direct' && this.state.activeDirectUserId === profile.id) ? ' active' : '';
            const initials = this.getInitials(profile.full_name);
            const avatarClass = this.getAvatarClass(profile.role);
            const statusDotClass = profile.is_online ? 'online' : 'offline';
            const taskCount = this.state.tasks.filter(t => t.assignee_id === profile.id && t.status !== 'done').length;

            return `
                <div class="contact-item${activeClass}" data-user-id="${profile.id}" role="button" tabindex="0">
                    <div class="avatar-wrap">
                        <div class="avatar-circle ${avatarClass}">${initials}</div>
                        <span class="status-dot ${statusDotClass}"></span>
                    </div>
                    <div class="contact-details">
                        <span class="contact-name">${this.escapeHtml(profile.full_name)}</span>
                        <span class="contact-role-tag">${this.escapeHtml(this.getRoleDisplayName(profile.role))}</span>
                    </div>
                    <span class="contact-task-badge" title="Активные задачи">${taskCount}</span>
                </div>
            `;
        }

        renderHeader() {
            if (!this.document) return;
            const icon = this.document.getElementById('headerIcon');
            const title = this.document.getElementById('headerTitle');
            const topic = this.document.getElementById('headerTopic');

            if (this.state.activeViewType === 'channel') {
                if (icon) icon.textContent = '#';
                if (title) title.textContent = 'общий-чат';
                if (topic) topic.textContent = 'Оперативная координация дежурных смен и объявления УАиБД';
            } else {
                if (icon) icon.textContent = '@';
                if (title) title.textContent = this.state.activeDirectUserName || 'Сотрудник';
                if (topic) topic.textContent = this.getRoleDisplayName(this.state.activeDirectUserRole) || 'Прямой канал связи';
            }
        }

        renderCreateTaskButtonVisibility() {
            if (!this.document) return;
            const btn = this.document.getElementById('btnOpenCreateTask');
            if (btn) {
                if (this.canCurrentRoleCreateTask()) {
                    btn.classList.remove('hidden');
                } else {
                    btn.classList.add('hidden');
                }
            }
        }

        renderTaskCounters() {
            if (!this.document) return;
            const badge = this.document.getElementById('taskCountBadge');
            const count = this.state.getActiveTaskCount();
            if (badge) {
                badge.textContent = count;
                if (count > 0) {
                    badge.classList.remove('hidden');
                }
            }

            // Update sub-filter counts
            const tasks = this.state.tasks || [];
            const countAll = this.document.getElementById('filterCountAll');
            const countTodo = this.document.getElementById('filterCountTodo');
            const countInProg = this.document.getElementById('filterCountInProgress');
            const countRev = this.document.getElementById('filterCountReview');
            const countDone = this.document.getElementById('filterCountDone');

            if (countAll) countAll.textContent = tasks.length;
            if (countTodo) countTodo.textContent = tasks.filter(t => t.status === 'todo').length;
            if (countInProg) countInProg.textContent = tasks.filter(t => t.status === 'in_progress').length;
            if (countRev) countRev.textContent = tasks.filter(t => t.status === 'review').length;
            if (countDone) countDone.textContent = tasks.filter(t => t.status === 'done').length;
        }

        renderChatMessages() {
            if (!this.document) return;
            const container = this.document.getElementById('messagesContainer');
            if (container && this.chatModule && typeof this.chatModule.renderMessages === 'function') {
                let msgs = this.state.messages;
                if (this.state.activeViewType === 'channel') {
                    const channel = this.state.channels.find(c => c.slug === this.state.activeSlug) || this.state.channels[0];
                    if (channel) {
                        msgs = msgs.filter(m => m.channel_id === channel.id || (!m.channel_id && !m.direct_chat_id));
                    }
                } else if (this.state.activeViewType === 'direct') {
                    msgs = msgs.filter(m => m.direct_chat_id === this.state.activeDirectChatId);
                }
                this.chatModule.renderMessages(container, msgs, this.state.profiles);
            }
        }

        renderTasksStage() {
            if (!this.document) return;
            const container = this.document.getElementById('tasksContainer');
            if (container && this.tasksModule && typeof this.tasksModule.renderTasks === 'function') {
                const filtered = this.state.getFilteredTasks();
                this.tasksModule.renderTasks(container, filtered, this.state.currentUser, this.state.profiles);
            }
        }

        renderAttachmentPreviews() {
            if (!this.document) return;
            const box = this.document.getElementById('attachmentPreviews');
            const list = this.document.getElementById('attachmentList');

            if (!box || !list) return;

            const atts = this.state.pendingChatAttachments || [];
            if (atts.length === 0) {
                box.classList.add('hidden');
                list.innerHTML = '';
                return;
            }

            box.classList.remove('hidden');
            list.innerHTML = atts.map((att, idx) => `
                <div class="attachment-preview-chip">
                    <span class="chip-icon">${(this.chatModule && typeof this.chatModule.getAttachmentIconGlyph === 'function') ? this.chatModule.getAttachmentIconGlyph(att.icon, att.name) : '📎'}</span>
                    <span class="chip-name" title="${this.escapeHtml(att.name)}">${this.escapeHtml(att.name)}</span>
                    <button class="chip-remove" data-remove-idx="${idx}" type="button">&times;</button>
                </div>
            `).join('');

            list.querySelectorAll('.chip-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = Number(btn.getAttribute('data-remove-idx'));
                    this.state.pendingChatAttachments.splice(idx, 1);
                    this.renderAttachmentPreviews();
                });
            });
        }

        renderReportFileList() {
            if (!this.document) return;
            const list = this.document.getElementById('reportFileList');
            if (!list) return;

            const atts = this.state.pendingReportAttachments || [];
            if (atts.length === 0) {
                list.innerHTML = '';
                return;
            }

            list.innerHTML = atts.map((att, idx) => `
                <div class="attachment-preview-chip">
                    <span class="chip-icon">${(this.chatModule && typeof this.chatModule.getAttachmentIconGlyph === 'function') ? this.chatModule.getAttachmentIconGlyph(att.icon, att.name) : '📎'}</span>
                    <span class="chip-name">${this.escapeHtml(att.name)} (${att.sizeFormatted || `${att.size} B`})</span>
                    <button class="chip-remove" data-remove-report-idx="${idx}" type="button">&times;</button>
                </div>
            `).join('');

            list.querySelectorAll('[data-remove-report-idx]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = Number(btn.getAttribute('data-remove-report-idx'));
                    this.state.pendingReportAttachments.splice(idx, 1);
                    this.renderReportFileList();
                });
            });
        }

        updateSidebarActiveStyles() {
            if (!this.document) return;
            const channelGen = this.document.getElementById('channelGeneral');
            if (channelGen) {
                if (this.state.activeViewType === 'channel') {
                    channelGen.classList.add('active');
                } else {
                    channelGen.classList.remove('active');
                }
            }

            const contactItems = this.document.querySelectorAll('.contacts-list .contact-item');
            contactItems.forEach(item => {
                const uid = item.getAttribute('data-user-id');
                if (this.state.activeViewType === 'direct' && this.state.activeDirectUserId === uid) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        }

        // =====================================================================
        // EVENT BINDINGS
        // =====================================================================

        bindAllEvents() {
            if (!this.document) return;

            // 1. Server Sidebar navigation
            const btnServerHome = this.document.getElementById('btnServerHome');
            if (btnServerHome) {
                btnServerHome.addEventListener('click', () => {
                    this.selectChannel('general');
                    this.switchTab('chat');
                });
            }

            const btnServerTasksSummary = this.document.getElementById('btnServerTasksSummary');
            if (btnServerTasksSummary) {
                btnServerTasksSummary.addEventListener('click', () => {
                    this.switchTab('tasks');
                });
            }

            // 2. Channels & Contacts Sidebar
            const channelGen = this.document.getElementById('channelGeneral');
            if (channelGen) {
                channelGen.addEventListener('click', () => {
                    this.selectChannel('general');
                });
            }

            // Delegate contact item clicks
            const channelsSidebar = this.document.getElementById('channelsSidebar');
            if (channelsSidebar) {
                channelsSidebar.addEventListener('click', (e) => {
                    const contactItem = e.target.closest('.contact-item');
                    if (contactItem) {
                        const uid = contactItem.getAttribute('data-user-id');
                        const p = this.state.profiles.find(pr => pr.id === uid) ||
                            SEED_PROFILES.find(pr => pr.id === uid);
                        if (p) {
                            this.selectDirectChat(p.id, p.full_name, p.role);
                        }
                    }
                });
            }

            // 3. User Profile Bar / Profile Switcher button
            const currentUserBar = this.document.getElementById('currentUserBar');
            const btnSwitchProfile = this.document.getElementById('btnSwitchProfile');
            if (currentUserBar) {
                currentUserBar.addEventListener('click', (e) => {
                    this.openModal('modalProfileSwitch');
                });
            }
            if (btnSwitchProfile) {
                btnSwitchProfile.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openModal('modalProfileSwitch');
                });
            }

            // 4. Profile quick cards in modal
            const profileCards = this.document.querySelectorAll('#profileQuickList .profile-card');
            profileCards.forEach(card => {
                card.addEventListener('click', () => {
                    const email = card.getAttribute('data-email');
                    const role = card.getAttribute('data-role');
                    this.switchProfile(email || role);
                });
            });

            // 5. Tabs navigation (Chat vs Tasks)
            const tabChat = this.document.getElementById('tabChat');
            const tabTasks = this.document.getElementById('tabTasks');
            if (tabChat) tabChat.addEventListener('click', () => this.switchTab('chat'));
            if (tabTasks) tabTasks.addEventListener('click', () => this.switchTab('tasks'));

            // 6. Generic modal close buttons [data-close-modal]
            this.document.querySelectorAll('[data-close-modal]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const modalId = btn.getAttribute('data-close-modal');
                    this.closeModal(modalId);
                });
            });

            // 7. Chat Module event bindings
            if (this.chatModule && typeof this.chatModule.bindChatEvents === 'function') {
                this.chatModule.bindChatEvents(this.document, {
                    onSendMessage: (text, atts) => {
                        const allAtts = (this.state.pendingChatAttachments || []).concat(atts || []);
                        this.sendMessage(text, allAtts);
                    },
                    onFilesSelected: (fileList) => {
                        this.handleChatFilesSelected(fileList);
                    }
                });
            }

            // 8. Tasks Module event bindings
            if (this.tasksModule && typeof this.tasksModule.bindTaskEvents === 'function') {
                this.tasksModule.bindTaskEvents(this.document, {
                    onFilterChange: (status) => this.setTaskFilter(status),
                    onTakeInProgress: (taskId) => this.takeTaskInProgress(taskId),
                    onOpenSubmitReport: (taskId) => this.openSubmitReportModal(taskId),
                    onOpenReview: (taskId) => this.openReviewModal(taskId),
                    onOpenCreateTask: () => this.openCreateTaskModal(),
                    onCreateTaskSubmit: () => this.createTask(),
                    onSubmitReportSubmit: () => this.handleReportModalSubmit(),
                    onReviewApprove: () => this.handleReviewDecision(true),
                    onReviewReject: () => this.handleReviewDecision(false)
                });
            }

            // 9. Report modal file selector
            const btnReportAddFile = this.document.getElementById('btnReportAddFile');
            const reportFileInput = this.document.getElementById('reportFileInput');
            if (btnReportAddFile && reportFileInput) {
                btnReportAddFile.addEventListener('click', () => reportFileInput.click());
                reportFileInput.addEventListener('change', () => {
                    if (reportFileInput.files && reportFileInput.files.length > 0) {
                        this.handleReportFilesSelected(reportFileInput.files);
                    }
                });
            }
        }

        handleChatFilesSelected(fileList) {
            if (!fileList || fileList.length === 0) return;
            for (let i = 0; i < fileList.length; i++) {
                const file = fileList[i];
                const formatted = this.supabaseService && typeof this.supabaseService.formatAttachment === 'function' ?
                    this.supabaseService.formatAttachment(file.name, file.size, file.type) :
                    { name: file.name, size: file.size, type: file.type || '', url: '', sizeFormatted: `${file.size} B`, icon: 'file' };
                this.state.pendingChatAttachments.push(formatted);
            }
            this.renderAttachmentPreviews();
        }

        handleReportFilesSelected(fileList) {
            if (!fileList || fileList.length === 0) return;
            for (let i = 0; i < fileList.length; i++) {
                const file = fileList[i];
                const formatted = this.supabaseService && typeof this.supabaseService.formatAttachment === 'function' ?
                    this.supabaseService.formatAttachment(file.name, file.size, file.type) :
                    { name: file.name, size: file.size, type: file.type || '', url: '', sizeFormatted: `${file.size} B`, icon: 'file' };
                this.state.pendingReportAttachments.push(formatted);
            }
            this.renderReportFileList();
        }

        handleReportModalSubmit() {
            if (!this.document) return;
            const taskIdInput = this.document.getElementById('reportTaskId');
            const reportTextInput = this.document.getElementById('reportTextInput');

            const taskId = taskIdInput ? taskIdInput.value : '';
            const reportText = reportTextInput ? reportTextInput.value.trim() : '';

            if (!taskId || !reportText) {
                this.notify('Ошибка заполнения', 'Укажите описание выполненных инженерных работ');
                return;
            }

            this.submitTaskReport(taskId, reportText, this.state.pendingReportAttachments);
        }

        handleReviewDecision(isApproved) {
            if (!this.document) return;
            const taskIdInput = this.document.getElementById('reviewTaskId');
            const commentInput = this.document.getElementById('reviewCommentInput');

            const taskId = taskIdInput ? taskIdInput.value : '';
            const comment = commentInput ? commentInput.value.trim() : '';

            if (!taskId) return;
            this.reviewTask(taskId, isApproved, comment);
        }

        // =====================================================================
        // UTILITIES
        // =====================================================================

        notify(title, body) {
            if (this.api && typeof this.api.showNotification === 'function') {
                this.api.showNotification(title, body).catch(() => {});
            }
        }

        getInitials(name) {
            if (this.chatModule && typeof this.chatModule.getEmployeeInitials === 'function') {
                return this.chatModule.getEmployeeInitials(name);
            }
            if (!name) return '??';
            const parts = name.trim().split(/\s+/);
            if (parts.length >= 2) {
                return (parts[0][0] + parts[1][0]).toUpperCase();
            }
            return parts[0].substring(0, 2).toUpperCase();
        }

        getRoleDisplayName(role) {
            switch ((role || '').toLowerCase()) {
                case 'chief': return 'Начальник УАиБД';
                case 'lead_engineer': return 'Вед. инженер';
                case 'developer': return 'Программист';
                default: return role || 'Сотрудник';
            }
        }

        getAvatarClass(role) {
            switch ((role || '').toLowerCase()) {
                case 'chief': return 'avatar-chief';
                case 'lead_engineer': return 'avatar-lead';
                case 'developer': return 'avatar-dev';
                default: return 'avatar-dev';
            }
        }

        getRoleBadgeClass(role) {
            switch ((role || '').toLowerCase()) {
                case 'chief': return 'badge-role-chief';
                case 'lead_engineer': return 'badge-role-lead';
                case 'developer': return 'badge-role-dev';
                default: return 'badge-role-dev';
            }
        }

        escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    }

    // Auto-initialize when loaded in browser/Electron window
    let globalAppController = null;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const startApp = () => {
            if (!globalAppController) {
                globalAppController = new AppController();
                window.appController = globalAppController;
                globalAppController.init().catch(err => {
                    console.error('[App] Failed to auto-initialize AppController:', err);
                });
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startApp);
        } else {
            startApp();
        }
    }

    return {
        AppState,
        AppController,
        SEED_PROFILES,
        SEED_CHANNELS,
        SEED_INITIAL_TASKS,
        appController: globalAppController
    };
});
