/**
 * UA&BD Task Messenger - Task Board & Engineering Report Submission Engine
 * Department: Управление автоматизации и баз данных (УАиБД) БМЗ
 * Handles task rendering, status/priority badges, filter logic,
 * role-based action determinations ('take_in_progress', 'submit_report', 'approve', 'reject'),
 * engineering report block rendering, and DOM event bindings.
 */

(function (root, factory) {
    if (typeof exports === 'object' && typeof module !== 'undefined') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else {
        const exportsObj = factory();
        root.TasksModule = exportsObj;
        if (typeof window !== 'undefined') {
            window.TasksModule = exportsObj;
        }
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /**
     * Escapes unsafe HTML characters to prevent XSS injection
     * @param {string} str
     * @returns {string}
     */
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Generates HTML status badge for tasks
     * Statuses: 'todo', 'in_progress', 'review', 'done'
     * @param {string} status
     * @returns {string}
     */
    function generateStatusBadge(status) {
        const normalized = (status || '').toLowerCase().trim();
        switch (normalized) {
            case 'todo':
                return '<span class="badge-status-todo">Назначена</span>';
            case 'in_progress':
                return '<span class="badge-status-in_progress">В работе</span>';
            case 'review':
                return '<span class="badge-status-review">На проверке</span>';
            case 'done':
                return '<span class="badge-status-done">Выполнено</span>';
            default:
                return `<span class="badge-status-todo">${escapeHtml(status || 'todo')}</span>`;
        }
    }

    /**
     * Generates HTML priority badge for tasks
     * Priorities: 'urgent', 'high', 'normal'
     * @param {string} priority
     * @returns {string}
     */
    function generatePriorityBadge(priority) {
        const normalized = (priority || '').toLowerCase().trim();
        switch (normalized) {
            case 'urgent':
                return '<span class="badge-urgent">Авария / Срочно</span>';
            case 'high':
                return '<span class="badge-high">Высокий</span>';
            case 'normal':
                return '<span class="badge-normal">Плановый</span>';
            default:
                return `<span class="badge-normal">${escapeHtml(priority || 'normal')}</span>`;
        }
    }

    /**
     * Determines role-based available action buttons for a task
     * Enforces the UA&BD industrial workflow:
     * - 'todo': Assignee can take into progress ('take_in_progress')
     * - 'in_progress': Assignee can submit completion report ('submit_report')
     * - 'review': Chief & Lead Engineer can approve ('approve') or return for rework ('reject')
     * - 'done': Final state, no actions
     * @param {string} status - 'todo' | 'in_progress' | 'review' | 'done'
     * @param {string} userRole - 'chief' | 'lead_engineer' | 'developer'
     * @param {boolean} isAssignee - true if the current user is assigned to this task
     * @returns {string[]}
     */
    function getAvailableTaskActions(status, userRole, isAssignee = false) {
        const actions = [];
        if (!status) return actions;

        const normalizedStatus = status.toLowerCase().trim();
        const normalizedRole = (userRole || '').toLowerCase().trim();

        if (normalizedStatus === 'todo') {
            if (isAssignee) {
                actions.push('take_in_progress');
            }
        } else if (normalizedStatus === 'in_progress') {
            if (isAssignee) {
                actions.push('submit_report');
            }
        } else if (normalizedStatus === 'review') {
            if (normalizedRole === 'chief' || normalizedRole === 'lead_engineer') {
                actions.push('approve', 'reject');
            }
        }

        return actions;
    }

    /**
     * Filters task array by status tab
     * @param {Array} tasks
     * @param {'all'|'todo'|'in_progress'|'review'|'done'} filter
     * @returns {Array}
     */
    function filterTasks(tasks, filter = 'all') {
        if (!Array.isArray(tasks)) return [];
        if (!filter || filter === 'all') return [...tasks];
        return tasks.filter(task => task && task.status === filter);
    }

    /**
     * Formats due date with countdown or overdue indicator
     * @param {string|null} dueDate
     * @param {boolean} isDone
     * @returns {string}
     */
    function formatDeadline(dueDate, isDone = false) {
        if (!dueDate) {
            return '<span class="task-meta-item meta-due-date">📅 Срок: не указан</span>';
        }

        const target = new Date(dueDate);
        if (isNaN(target.getTime())) {
            return `<span class="task-meta-item meta-due-date">📅 Срок: ${escapeHtml(dueDate)}</span>`;
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        target.setHours(0, 0, 0, 0);

        const diffTime = target.getTime() - now.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (isDone) {
            return `<span class="task-meta-item meta-due-date">📅 Срок: ${escapeHtml(dueDate)}</span>`;
        }

        if (diffDays < 0) {
            return `<span class="task-meta-item meta-due-date text-danger" title="Дедлайн истек">⚠️ Просрочено на ${Math.abs(diffDays)} дн. (${escapeHtml(dueDate)})</span>`;
        } else if (diffDays === 0) {
            return `<span class="task-meta-item meta-due-date text-warning" title="Дедлайн сегодня">⏳ Срок: Сегодня (${escapeHtml(dueDate)})</span>`;
        } else if (diffDays === 1) {
            return `<span class="task-meta-item meta-due-date" title="Дедлайн завтра">⏳ Срок: Завтра (${escapeHtml(dueDate)})</span>`;
        } else {
            return `<span class="task-meta-item meta-due-date">📅 Срок: ${escapeHtml(dueDate)} (осталось ${diffDays} дн.)</span>`;
        }
    }

    /**
     * Formats date string to localized Russian date
     * @param {string} isoString
     * @returns {string}
     */
    function formatCreationDate(isoString) {
        if (!isoString) return '—';
        try {
            const d = new Date(isoString);
            if (isNaN(d.getTime())) return escapeHtml(isoString);
            return d.toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } catch (_) {
            return escapeHtml(isoString);
        }
    }

    /**
     * Renders engineering report block attached to a task
     * @param {Object} report
     * @param {string} currentRole
     * @returns {string}
     */
    function renderReportBlock(report, currentRole) {
        if (!report) return '';

        const authorName = report.author?.full_name || 
            report.author_name || 
            (report.author_id ? 'Сотрудник ' + report.author_id : 'Исполнитель');

        const reportText = report.report_text || report.content || report.text || '';

        // Attachments
        let attachmentsHtml = '';
        if (Array.isArray(report.attachments) && report.attachments.length > 0) {
            const validAttachments = report.attachments.filter(Boolean);
            if (validAttachments.length > 0) {
                const items = validAttachments.map(att => {
                    const icon = att.icon === 'image' ? '🖼️' : att.icon === 'text' ? '📄' : att.icon === 'archive' ? '📦' : '📎';
                    const size = att.sizeFormatted ? ` (${escapeHtml(att.sizeFormatted)})` : '';
                    const url = escapeHtml(att.url || '#');
                    const name = escapeHtml(att.name || 'Файл');
                    return `<div class="report-attachment-item">
                        <span class="attachment-icon">${icon}</span>
                        <a href="${url}" class="attachment-download-link" target="_blank" rel="noopener noreferrer" download="${name}">${name}</a>
                        <span class="attachment-size">${size}</span>
                    </div>`;
                }).join('');

                attachmentsHtml = `<div class="report-attachments-wrapper">
                    <div class="report-attachments-heading">Прикрепленные материалы:</div>
                    <div class="report-attachments-list">${items}</div>
                </div>`;
            }
        }

        // Review comment
        let reviewCommentHtml = '';
        if (report.review_comment) {
            reviewCommentHtml = `<div class="report-review-comment">
                <span class="review-comment-label">Резолюция руководителя:</span>
                <span class="review-comment-text">${escapeHtml(report.review_comment)}</span>
            </div>`;
        }

        return `<div class="task-card-report">
            <div class="report-label">📋 Инженерный отчет (${escapeHtml(authorName)}):</div>
            <div class="report-text">${escapeHtml(reportText)}</div>
            ${attachmentsHtml}
            ${reviewCommentHtml}
        </div>`;
    }

    /**
     * Renders single task card HTML
     * @param {Object} task
     * @param {string} currentRole
     * @param {string} currentUserId
     * @returns {string}
     */
    function renderTaskCardHtml(task, currentRole, currentUserId) {
        if (!task) return '';

        const taskId = task.id || '';
        const isAssignee = Boolean(task.assignee_id && currentUserId && String(task.assignee_id) === String(currentUserId));
        const actions = getAvailableTaskActions(task.status, currentRole, isAssignee);

        const assigneeName = task.assignee?.full_name || 
            task.assignee_name || 
            (task.assignee_id ? 'Сотрудник ' + task.assignee_id : 'Не назначен');

        const creatorName = task.creator?.full_name || 
            task.creator_name || 
            (task.creator_id ? 'Сотрудник ' + task.creator_id : 'Система');

        const isDone = (task.status === 'done');
        const deadlineHtml = formatDeadline(task.due_date, isDone);
        const createdDateHtml = formatCreationDate(task.created_at);

        // Report block if task has reports
        const report = task.report || 
            (Array.isArray(task.reports) && task.reports.length > 0 ? task.reports[task.reports.length - 1] : null);
        const reportHtml = renderReportBlock(report, currentRole);

        // Action buttons
        const actionButtons = [];
        if (actions.includes('take_in_progress')) {
            actionButtons.push(`<button type="button" class="btn-primary btn-take-task" data-task-id="${escapeHtml(taskId)}" data-action="take_in_progress">▶ Взять в работу</button>`);
        }
        if (actions.includes('submit_report')) {
            actionButtons.push(`<button type="button" class="btn-primary btn-submit-report" data-task-id="${escapeHtml(taskId)}" data-action="submit_report">📝 Сдать отчет</button>`);
        }
        if (actions.includes('approve')) {
            actionButtons.push(`<button type="button" class="btn-success btn-approve-task" data-task-id="${escapeHtml(taskId)}" data-action="approve">✅ Принять отчет</button>`);
        }
        if (actions.includes('reject')) {
            actionButtons.push(`<button type="button" class="btn-danger btn-reject-task" data-task-id="${escapeHtml(taskId)}" data-action="reject">↩️ На доработку</button>`);
        }

        const actionsHtml = actionButtons.length > 0 
            ? `<div class="task-actions">${actionButtons.join(' ')}</div>` 
            : '';

        return `<div class="task-card" data-task-id="${escapeHtml(taskId)}" data-status="${escapeHtml(task.status || '')}">
    <div class="task-card-header">
        <div class="task-card-title-group">
            <h4 class="task-card-title">${escapeHtml(task.title || 'Без названия')}</h4>
            <div class="task-card-meta">
                <span class="task-meta-item">
                    <span class="meta-label">Исполнитель:</span>
                    <span class="meta-value">${escapeHtml(assigneeName)}</span>
                </span>
                <span class="task-meta-item">
                    <span class="meta-label">Постановщик:</span>
                    <span class="meta-value">${escapeHtml(creatorName)}</span>
                </span>
                ${deadlineHtml}
            </div>
        </div>
        <div class="task-card-badges">
            ${generatePriorityBadge(task.priority)}
            ${generateStatusBadge(task.status)}
        </div>
    </div>
    <div class="task-card-desc">${escapeHtml(task.description || '')}</div>
    ${reportHtml}
    <div class="task-card-footer">
        <div class="task-meta-date">
            <span class="created-at">Создано: ${createdDateHtml}</span>
        </div>
        ${actionsHtml}
    </div>
</div>`;
    }

    /**
     * Renders a list of task cards HTML
     * @param {Array} tasksList
     * @param {string} currentRole
     * @param {string} currentUserId
     * @returns {string}
     */
    function renderTaskCards(tasksList, currentRole, currentUserId) {
        if (!Array.isArray(tasksList) || tasksList.length === 0) {
            return `<div class="tasks-empty-placeholder">
    <div class="empty-icon">📋</div>
    <p class="empty-text">Нет задач в выбранной категории</p>
</div>`;
        }

        return tasksList
            .map(task => renderTaskCardHtml(task, currentRole, currentUserId))
            .join('\n');
    }

    /**
     * Renders tasks into DOM container and updates filter counters and active tabs
     * @param {HTMLElement} container - DOM element for #tasksContainer
     * @param {Array} tasks - Full list of tasks
     * @param {string} currentRole
     * @param {string} currentUserId
     * @param {string} [currentFilter='all']
     */
    function renderTasks(container, tasks, currentRole, currentUserId, currentFilter = 'all') {
        if (!container) return;

        const allTasks = Array.isArray(tasks) ? tasks : [];
        const totalCount = allTasks.length;
        const todoCount = allTasks.filter(t => t && t.status === 'todo').length;
        const inProgressCount = allTasks.filter(t => t && t.status === 'in_progress').length;
        const reviewCount = allTasks.filter(t => t && t.status === 'review').length;
        const doneCount = allTasks.filter(t => t && t.status === 'done').length;

        // Update DOM count badges if document is present
        const doc = (typeof document !== 'undefined') ? document : null;
        if (doc) {
            const elAll = doc.getElementById('filterCountAll');
            if (elAll) elAll.textContent = String(totalCount);

            const elTodo = doc.getElementById('filterCountTodo');
            if (elTodo) elTodo.textContent = String(todoCount);

            const elInProgress = doc.getElementById('filterCountInProgress');
            if (elInProgress) elInProgress.textContent = String(inProgressCount);

            const elReview = doc.getElementById('filterCountReview');
            if (elReview) elReview.textContent = String(reviewCount);

            const elDone = doc.getElementById('filterCountDone');
            if (elDone) elDone.textContent = String(doneCount);

            const elBadge = doc.getElementById('taskCountBadge');
            if (elBadge) elBadge.textContent = String(totalCount);

            // Update active state on filter buttons
            const filterBtns = doc.querySelectorAll('.filter-btn');
            if (filterBtns && filterBtns.length > 0) {
                filterBtns.forEach(btn => {
                    const status = btn.getAttribute('data-status');
                    if (status === currentFilter) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
            }
        }

        // Filter and render cards into container
        const filtered = filterTasks(allTasks, currentFilter);
        container.innerHTML = renderTaskCards(filtered, currentRole, currentUserId);
    }

    /**
     * Binds DOM events for task action buttons, filter tabs, and creation/review modals
     * @param {Object} domElements - { tasksContainer, filterButtons, btnOpenCreateTask, btnCreateTaskSubmit, btnSubmitReportSubmit, btnReviewApprove, btnReviewReject }
     * @param {Object} callbacks - { onFilterChange, onTakeTask, onSubmitReportClick, onSubmitReport, onApproveTask, onRejectTask, onOpenCreateTask, onCreateTaskSubmit, onSubmitReportSubmit, onReviewApprove, onReviewReject, onAction }
     */
    function bindTaskEvents(domElements = {}, callbacks = {}) {
        const {
            tasksContainer,
            filterButtons,
            btnOpenCreateTask,
            btnCreateTaskSubmit,
            btnSubmitReportSubmit,
            btnReviewApprove,
            btnReviewReject
        } = domElements;

        // Event delegation for task cards container
        if (tasksContainer && typeof tasksContainer.addEventListener === 'function') {
            tasksContainer.addEventListener('click', (e) => {
                const target = e.target;
                if (!target) return;

                const btn = (typeof target.closest === 'function') ? target.closest('button') : target;
                if (!btn) return;

                const taskId = btn.getAttribute('data-task-id') || 
                    (typeof btn.closest === 'function' ? btn.closest('.task-card')?.getAttribute('data-task-id') : null);
                const action = btn.getAttribute('data-action');
                const classList = btn.classList || { contains: () => false };

                if (classList.contains('btn-take-task') || action === 'take_in_progress') {
                    if (typeof callbacks.onTakeTask === 'function') callbacks.onTakeTask(taskId, btn);
                    if (typeof callbacks.onAction === 'function') callbacks.onAction('take_in_progress', taskId, btn);
                } else if (classList.contains('btn-submit-report') || action === 'submit_report') {
                    const cb = callbacks.onSubmitReportClick || callbacks.onSubmitReport;
                    if (typeof cb === 'function') cb(taskId, btn);
                    if (typeof callbacks.onAction === 'function') callbacks.onAction('submit_report', taskId, btn);
                } else if (classList.contains('btn-approve-task') || action === 'approve') {
                    if (typeof callbacks.onApproveTask === 'function') callbacks.onApproveTask(taskId, btn);
                    if (typeof callbacks.onAction === 'function') callbacks.onAction('approve', taskId, btn);
                } else if (classList.contains('btn-reject-task') || action === 'reject') {
                    if (typeof callbacks.onRejectTask === 'function') callbacks.onRejectTask(taskId, btn);
                    if (typeof callbacks.onAction === 'function') callbacks.onAction('reject', taskId, btn);
                }
            });
        }

        // Filter tabs click handling
        const resolvedFilterButtons = filterButtons || 
            (typeof document !== 'undefined' ? document.querySelectorAll('.filter-btn') : null);

        if (resolvedFilterButtons && typeof resolvedFilterButtons.forEach === 'function') {
            resolvedFilterButtons.forEach(btn => {
                if (btn && typeof btn.addEventListener === 'function') {
                    btn.addEventListener('click', (e) => {
                        if (e && typeof e.preventDefault === 'function') e.preventDefault();
                        const status = btn.getAttribute('data-status') || 'all';
                        if (typeof callbacks.onFilterChange === 'function') {
                            callbacks.onFilterChange(status, btn);
                        }
                    });
                }
            });
        }

        // Create Task modal trigger button
        if (btnOpenCreateTask && typeof btnOpenCreateTask.addEventListener === 'function') {
            btnOpenCreateTask.addEventListener('click', (e) => {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                if (typeof callbacks.onOpenCreateTask === 'function') callbacks.onOpenCreateTask();
            });
        }

        // Create Task submit button
        if (btnCreateTaskSubmit && typeof btnCreateTaskSubmit.addEventListener === 'function') {
            btnCreateTaskSubmit.addEventListener('click', (e) => {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                if (typeof callbacks.onCreateTaskSubmit === 'function') callbacks.onCreateTaskSubmit();
            });
        }

        // Submit Report submit button
        if (btnSubmitReportSubmit && typeof btnSubmitReportSubmit.addEventListener === 'function') {
            btnSubmitReportSubmit.addEventListener('click', (e) => {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                if (typeof callbacks.onSubmitReportSubmit === 'function') callbacks.onSubmitReportSubmit();
            });
        }

        // Review modal approve button
        if (btnReviewApprove && typeof btnReviewApprove.addEventListener === 'function') {
            btnReviewApprove.addEventListener('click', (e) => {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                if (typeof callbacks.onReviewApprove === 'function') callbacks.onReviewApprove();
            });
        }

        // Review modal reject button
        if (btnReviewReject && typeof btnReviewReject.addEventListener === 'function') {
            btnReviewReject.addEventListener('click', (e) => {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                if (typeof callbacks.onReviewReject === 'function') callbacks.onReviewReject();
            });
        }
    }

    const TasksModule = {
        escapeHtml,
        generateStatusBadge,
        generatePriorityBadge,
        getAvailableTaskActions,
        filterTasks,
        formatDeadline,
        formatCreationDate,
        renderReportBlock,
        renderTaskCardHtml,
        renderTaskCards,
        renderTasks,
        bindTaskEvents
    };

    return Object.assign(TasksModule, { TasksModule });
});
