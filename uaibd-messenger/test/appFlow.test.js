const { test, describe } = require('node:test');
const assert = require('node:assert');
const { AppState, AppController } = require('../renderer/app');

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

    test('updates current user profile and role', () => {
        const state = new AppState();
        state.setCurrentUser({
            id: 'user-chief',
            full_name: 'Иванов А.С.',
            role: 'chief',
            status_text: 'Начальник УАиБД'
        });
        assert.strictEqual(state.currentUser.role, 'chief');
        assert.strictEqual(state.currentUser.full_name, 'Иванов А.С.');
    });

    test('calculates unread task count for current user', () => {
        const state = new AppState();
        state.setCurrentUser({ id: 'dev-1', role: 'developer' });
        const tasks = [
            { id: 't1', assignee_id: 'dev-1', status: 'todo' },
            { id: 't2', assignee_id: 'dev-1', status: 'in_progress' },
            { id: 't3', assignee_id: 'dev-1', status: 'done' },
            { id: 't4', assignee_id: 'dev-2', status: 'todo' }
        ];
        state.setTasks(tasks);
        assert.strictEqual(state.getActiveTaskCount(), 2);
    });

    test('calculates active task count for chief and lead_engineer across department', () => {
        const state = new AppState();
        state.setCurrentUser({ id: 'chief-1', role: 'chief' });
        const tasks = [
            { id: 't1', assignee_id: 'dev-1', status: 'todo' },
            { id: 't2', assignee_id: 'dev-1', status: 'in_progress' },
            { id: 't3', assignee_id: 'dev-2', status: 'review' },
            { id: 't4', assignee_id: 'dev-2', status: 'done' }
        ];
        state.setTasks(tasks);
        assert.strictEqual(state.getActiveTaskCount(), 3);
    });

    test('switches back from direct chat to channel view', () => {
        const state = new AppState();
        state.selectUserDirectChat('dev-1', 'Сидоров М.К.', 'developer');
        assert.strictEqual(state.activeViewType, 'direct');
        state.selectChannel('general', 'общий-чат');
        assert.strictEqual(state.activeViewType, 'channel');
        assert.strictEqual(state.activeSlug, 'general');
        assert.strictEqual(state.activeDirectUserId, null);
    });
});

describe('AppController Integration & Workflow', () => {
    function createMockSupabaseService() {
        return {
            init: () => {},
            isConfigured: () => true,
            canCreateTask: (role) => role === 'chief' || role === 'lead_engineer',
            canReviewReport: (role) => role === 'chief' || role === 'lead_engineer',
            getProfiles: async () => [
                { id: 'p1', email: 'ivanov@bmz.by', full_name: 'Иванов А.С.', role: 'chief' },
                { id: 'p2', email: 'sidorov@bmz.by', full_name: 'Сидоров М.К.', role: 'developer' }
            ],
            getChannels: async () => [
                { id: 'ch1', slug: 'general', name: 'общий-чат' }
            ],
            getChannelMessages: async () => [],
            getDirectMessages: async () => [],
            getTasks: async () => [
                { id: 't1', title: 'Task 1', assignee_id: 'p2', creator_id: 'p1', status: 'todo', priority: 'high' }
            ],
            updateProfileStatus: async () => ({ success: true }),
            updateTaskStatus: async (taskId, status) => ({ id: taskId, status }),
            createTask: async (title, desc, creatorId, assigneeId, priority, dueDate) => ({
                id: 't-new', title, description: desc, creator_id: creatorId, assignee_id: assigneeId, priority, due_date: dueDate, status: 'todo'
            }),
            submitTaskReport: async (taskId, authorId, reportText, attachments) => ({
                id: 'rep-1', task_id: taskId, author_id: authorId, report_text: reportText, attachments
            }),
            reviewTaskReport: async (taskId, isApproved, comment) => ({
                taskId, status: isApproved ? 'done' : 'todo', isApproved, review_comment: comment
            }),
            sendMessage: async (senderId, targetType, targetId, text, attachments) => ({
                id: 'm1', sender_id: senderId, content: text, attachments, created_at: new Date().toISOString()
            }),
            subscribeToMessages: () => ({ unsubscribe: () => {} }),
            subscribeToTasks: () => ({ unsubscribe: () => {} })
        };
    }

    function createMockAPI() {
        const notifications = [];
        return {
            getConfig: async () => ({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'anon-key' }),
            showNotification: async (title, body) => {
                notifications.push({ title, body });
                return { success: true };
            },
            _notifications: notifications
        };
    }

    test('initializes AppController and populates state with profiles and channels', async () => {
        const mockSupabase = createMockSupabaseService();
        const mockAPI = createMockAPI();
        const controller = new AppController({
            supabaseService: mockSupabase,
            api: mockAPI
        });

        await controller.init();
        assert.ok(controller.state.currentUser);
        assert.strictEqual(controller.state.currentUser.role, 'chief');
        assert.strictEqual(controller.state.channels.length, 1);
        assert.strictEqual(controller.state.tasks.length, 1);
    });

    test('switchProfile changes current user and adjusts role-based permissions', async () => {
        const mockSupabase = createMockSupabaseService();
        const mockAPI = createMockAPI();
        const controller = new AppController({
            supabaseService: mockSupabase,
            api: mockAPI
        });
        await controller.init();

        // Switch to developer
        controller.switchProfile('sidorov@bmz.by');
        assert.strictEqual(controller.state.currentUser.role, 'developer');
        assert.strictEqual(controller.state.currentUser.email, 'sidorov@bmz.by');
        assert.strictEqual(controller.canCurrentRoleCreateTask(), false);

        // Switch back to chief
        controller.switchProfile('ivanov@bmz.by');
        assert.strictEqual(controller.state.currentUser.role, 'chief');
        assert.strictEqual(controller.canCurrentRoleCreateTask(), true);
    });

    test('creates task via controller when user has chief or lead_engineer role', async () => {
        const mockSupabase = createMockSupabaseService();
        const mockAPI = createMockAPI();
        const controller = new AppController({
            supabaseService: mockSupabase,
            api: mockAPI
        });
        await controller.init();

        const created = await controller.createTask({
            title: 'Настройка датчика печи',
            description: 'Калибровка термопары ДСП-1',
            assigneeId: 'p2',
            priority: 'urgent',
            dueDate: '2026-10-25'
        });

        assert.strictEqual(created.title, 'Настройка датчика печи');
        assert.strictEqual(created.priority, 'urgent');
        assert.strictEqual(mockAPI._notifications.length > 0, true);
    });

    test('rejects task creation when current user is developer', async () => {
        const mockSupabase = createMockSupabaseService();
        const mockAPI = createMockAPI();
        const controller = new AppController({
            supabaseService: mockSupabase,
            api: mockAPI
        });
        await controller.init();
        controller.switchProfile('sidorov@bmz.by');

        await assert.rejects(
            async () => {
                await controller.createTask({
                    title: 'Недопустимая задача',
                    description: 'Попытка создания программистом',
                    assigneeId: 'p2'
                });
            },
            /У вас нет прав на создание задач/
        );
    });

    test('handles developer taking task into progress and submitting report', async () => {
        const mockSupabase = createMockSupabaseService();
        const mockAPI = createMockAPI();
        const controller = new AppController({
            supabaseService: mockSupabase,
            api: mockAPI
        });
        await controller.init();
        controller.switchProfile('sidorov@bmz.by');

        await controller.takeTaskInProgress('t1');
        assert.strictEqual(controller.state.tasks.find(t => t.id === 't1').status, 'in_progress');

        await controller.submitTaskReport('t1', 'Изменения в ПЛК загружены и протестированы', []);
        assert.strictEqual(controller.state.tasks.find(t => t.id === 't1').status, 'review');
    });

    test('handles chief reviewing report with approval and rejection', async () => {
        const mockSupabase = createMockSupabaseService();
        const mockAPI = createMockAPI();
        const controller = new AppController({
            supabaseService: mockSupabase,
            api: mockAPI
        });
        await controller.init();

        // Review approve
        await controller.reviewTask('t1', true, 'Отличная работа, принято');
        assert.strictEqual(controller.state.tasks.find(t => t.id === 't1').status, 'done');

        // Review reject back to todo
        await controller.reviewTask('t1', false, 'Не прикреплен дамп памяти');
        assert.strictEqual(controller.state.tasks.find(t => t.id === 't1').status, 'todo');
    });

    test('handles realtime message event and triggers notification', async () => {
        const mockSupabase = createMockSupabaseService();
        const mockAPI = createMockAPI();
        const controller = new AppController({
            supabaseService: mockSupabase,
            api: mockAPI
        });
        await controller.init();

        // Message in current channel from another user
        const incomingMsg = {
            id: 'm-live-1',
            channel_id: 'ch1',
            sender_id: 'p2',
            content: 'Датчик температуры откалиброван',
            created_at: new Date().toISOString()
        };

        controller.handleRealtimeMessage({ eventType: 'INSERT', new: incomingMsg });
        assert.strictEqual(controller.state.messages.some(m => m.id === 'm-live-1'), true);
        assert.strictEqual(mockAPI._notifications.some(n => n.title.includes('Новое сообщение')), true);
    });
});
