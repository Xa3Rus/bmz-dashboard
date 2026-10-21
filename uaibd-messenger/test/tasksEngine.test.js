const { test, describe } = require('node:test');
const assert = require('node:assert');
const { 
    generateStatusBadge, 
    generatePriorityBadge, 
    getAvailableTaskActions,
    filterTasks,
    renderTaskCardHtml,
    renderTaskCards,
    renderReportBlock,
    renderTasks,
    bindTaskEvents,
    formatDeadline,
    TasksModule
} = require('../renderer/tasks');

describe('Task Board Logic & Role Actions', () => {
    test('renders correct status and priority badges', () => {
        const todoBadge = generateStatusBadge('todo');
        assert.ok(todoBadge.includes('Назначена'));
        const inProgressBadge = generateStatusBadge('in_progress');
        assert.ok(inProgressBadge.includes('В работе'));
        const reviewBadge = generateStatusBadge('review');
        assert.ok(reviewBadge.includes('На проверке'));
        const doneBadge = generateStatusBadge('done');
        assert.ok(doneBadge.includes('Выполнено'));

        const urgentBadge = generatePriorityBadge('urgent');
        assert.ok(urgentBadge.includes('Авария') || urgentBadge.includes('Срочно'));
        const highBadge = generatePriorityBadge('high');
        assert.ok(highBadge.includes('Высокий'));
        const normalBadge = generatePriorityBadge('normal');
        assert.ok(normalBadge.includes('Плановый'));
    });

    test('developer can take task and submit report when assigned', () => {
        const actionsTodo = getAvailableTaskActions('todo', 'developer', true);
        assert.ok(actionsTodo.includes('take_in_progress'));
        assert.ok(!actionsTodo.includes('approve'));

        const actionsInProgress = getAvailableTaskActions('in_progress', 'developer', true);
        assert.ok(actionsInProgress.includes('submit_report'));

        // Developer cannot approve or reject
        const actionsReview = getAvailableTaskActions('review', 'developer', true);
        assert.ok(!actionsReview.includes('approve'));
        assert.ok(!actionsReview.includes('reject'));
    });

    test('unassigned developer cannot take task or submit report', () => {
        const actionsTodoUnassigned = getAvailableTaskActions('todo', 'developer', false);
        assert.strictEqual(actionsTodoUnassigned.length, 0);

        const actionsInProgressUnassigned = getAvailableTaskActions('in_progress', 'developer', false);
        assert.strictEqual(actionsInProgressUnassigned.length, 0);
    });

    test('lead engineer and chief can review report or return for rework', () => {
        const actionsReviewLead = getAvailableTaskActions('review', 'lead_engineer', false);
        assert.ok(actionsReviewLead.includes('approve'));
        assert.ok(actionsReviewLead.includes('reject'));

        const actionsReviewChief = getAvailableTaskActions('review', 'chief', false);
        assert.ok(actionsReviewChief.includes('approve'));
        assert.ok(actionsReviewChief.includes('reject'));
    });

    test('filters tasks correctly by status', () => {
        const tasks = [
            { id: '1', status: 'todo' },
            { id: '2', status: 'in_progress' },
            { id: '3', status: 'done' }
        ];
        assert.strictEqual(filterTasks(tasks, 'all').length, 3);
        assert.strictEqual(filterTasks(tasks, 'todo').length, 1);
        assert.strictEqual(filterTasks(tasks, 'in_progress').length, 1);
        assert.strictEqual(filterTasks(tasks, 'done').length, 1);
        assert.strictEqual(filterTasks(null, 'all').length, 0);
    });

    test('renders task card with appropriate action buttons', () => {
        const task = {
            id: 'task-101',
            title: 'Калибровка датчиков ДСП-1',
            description: 'Проверить показания расхода воды',
            priority: 'urgent',
            status: 'todo',
            assignee_id: 'dev-1',
            creator_id: 'lead-1',
            due_date: '2026-10-25'
        };
        const html = renderTaskCardHtml(task, 'developer', 'dev-1');
        assert.ok(html.includes('Калибровка датчиков ДСП-1'));
        assert.ok(html.includes('btn-take-task'));
    });

    test('renders review action buttons for chief on task in review', () => {
        const reviewTask = {
            id: 'task-102',
            title: 'Обновление прошивки ПЛК Simatic',
            description: 'Залить новую логику аварийного сброса',
            priority: 'high',
            status: 'review',
            assignee_id: 'dev-1',
            creator_id: 'chief-1',
            due_date: '2026-10-20'
        };
        const htmlChief = renderTaskCardHtml(reviewTask, 'chief', 'chief-1');
        assert.ok(htmlChief.includes('btn-approve-task'));
        assert.ok(htmlChief.includes('btn-reject-task'));

        const htmlDev = renderTaskCardHtml(reviewTask, 'developer', 'dev-1');
        assert.ok(!htmlDev.includes('btn-approve-task'));
        assert.ok(!htmlDev.includes('btn-reject-task'));
    });

    test('renders engineering report block with text, attachments and comments', () => {
        const report = {
            id: 'rep-55',
            task_id: 'task-101',
            author_id: 'dev-1',
            report_text: 'Выполнена юстировка датчиков температуры и расхода.',
            attachments: [
                {
                    name: 'calibration_log.txt',
                    sizeFormatted: '4.2 KB',
                    url: 'https://files.bmz/calibration_log.txt',
                    icon: 'text'
                }
            ],
            review_comment: 'Замечаний нет, показания в норме.'
        };

        const reportHtml = renderReportBlock(report, 'chief');
        assert.ok(reportHtml.includes('Выполнена юстировка датчиков'));
        assert.ok(reportHtml.includes('calibration_log.txt'));
        assert.ok(reportHtml.includes('4.2 KB'));
        assert.ok(reportHtml.includes('Замечаний нет, показания в норме'));
    });

    test('renderTasks populates container and updates counters', () => {
        const container = {
            innerHTML: ''
        };

        const tasks = [
            { id: '1', title: 'Задача 1', status: 'todo', priority: 'normal', assignee_id: 'dev-1' },
            { id: '2', title: 'Задача 2', status: 'in_progress', priority: 'urgent', assignee_id: 'dev-1' },
            { id: '3', title: 'Задача 3', status: 'done', priority: 'high', assignee_id: 'dev-2' }
        ];

        renderTasks(container, tasks, 'developer', 'dev-1', 'all');
        assert.ok(container.innerHTML.includes('Задача 1'));
        assert.ok(container.innerHTML.includes('Задача 2'));
        assert.ok(container.innerHTML.includes('Задача 3'));

        renderTasks(container, tasks, 'developer', 'dev-1', 'in_progress');
        assert.ok(!container.innerHTML.includes('Задача 1'));
        assert.ok(container.innerHTML.includes('Задача 2'));
        assert.ok(!container.innerHTML.includes('Задача 3'));
    });

    test('bindTaskEvents dispatches appropriate action callbacks', () => {
        let clickedAction = null;
        let clickedTaskId = null;

        const fakeButton = {
            tagName: 'BUTTON',
            classList: {
                contains(cls) { return cls === 'btn-take-task'; }
            },
            getAttribute(attr) {
                if (attr === 'data-task-id') return 'task-999';
                if (attr === 'data-action') return 'take_in_progress';
                return null;
            },
            closest(selector) {
                if (selector === 'button') return fakeButton;
                return null;
            }
        };

        let containerClickListener = null;
        const fakeContainer = {
            addEventListener(event, listener) {
                if (event === 'click') containerClickListener = listener;
            }
        };

        bindTaskEvents({ tasksContainer: fakeContainer }, {
            onTakeTask(taskId) {
                clickedAction = 'take_in_progress';
                clickedTaskId = taskId;
            }
        });

        assert.strictEqual(typeof containerClickListener, 'function');
        containerClickListener({ target: fakeButton, preventDefault() {} });

        assert.strictEqual(clickedAction, 'take_in_progress');
        assert.strictEqual(clickedTaskId, 'task-999');
    });

    test('formatDeadline handles invalid or malformed date strings safely', () => {
        const nullHtml = formatDeadline(null);
        assert.ok(nullHtml.includes('не указан'));

        const invalidHtml = formatDeadline('not-a-valid-date');
        assert.ok(!invalidHtml.includes('NaN'));
        assert.ok(invalidHtml.includes('not-a-valid-date'));
    });

    test('renderReportBlock handles null and undefined items in report attachments safely', () => {
        const report = {
            id: 'rep-edge',
            task_id: 'task-102',
            report_text: 'Отчет с поврежденными вложениями',
            attachments: [
                null,
                undefined,
                { name: 'valid_log.txt', sizeFormatted: '1.5 KB', url: 'https://files.bmz/valid.txt', icon: 'text' }
            ]
        };
        const html = renderReportBlock(report, 'chief');
        assert.ok(html.includes('valid_log.txt'));
        assert.ok(html.includes('1.5 KB'));
    });

    test('bindTaskEvents uses fallback precedence for submit report callbacks without duplicate invocations', () => {
        let clickCalls = 0;
        let submitCalls = 0;

        const fakeButton = {
            tagName: 'BUTTON',
            classList: {
                contains(cls) { return cls === 'btn-submit-report'; }
            },
            getAttribute(attr) {
                if (attr === 'data-task-id') return 'task-555';
                if (attr === 'data-action') return 'submit_report';
                return null;
            },
            closest(selector) {
                if (selector === 'button') return fakeButton;
                return null;
            }
        };

        let containerListener = null;
        const fakeContainer = {
            addEventListener(event, listener) {
                if (event === 'click') containerListener = listener;
            }
        };

        bindTaskEvents({ tasksContainer: fakeContainer }, {
            onSubmitReportClick() { clickCalls++; },
            onSubmitReport() { submitCalls++; }
        });

        containerListener({ target: fakeButton, preventDefault() {} });
        assert.strictEqual(clickCalls, 1);
        assert.strictEqual(submitCalls, 0); // fallback precedence prevents duplicate call
    });

    test('exports TasksModule with all required interfaces', () => {
        assert.ok(TasksModule);
        assert.strictEqual(typeof TasksModule.renderTaskCards, 'function');
        assert.strictEqual(typeof TasksModule.renderTaskCardHtml, 'function');
        assert.strictEqual(typeof TasksModule.filterTasks, 'function');
        assert.strictEqual(typeof TasksModule.generateStatusBadge, 'function');
        assert.strictEqual(typeof TasksModule.generatePriorityBadge, 'function');
        assert.strictEqual(typeof TasksModule.getAvailableTaskActions, 'function');
        assert.strictEqual(typeof TasksModule.renderReportBlock, 'function');
        assert.strictEqual(typeof TasksModule.renderTasks, 'function');
        assert.strictEqual(typeof TasksModule.bindTaskEvents, 'function');
    });
});
