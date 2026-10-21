/**
 * UA&BD Task Messenger - Real-Time Chat Engine & File Attachment Renderer
 * Department: Управление автоматизации и баз данных (УАиБД) БМЗ
 * Handles HTML escaping, markdown formatting, attachment preview cards,
 * date grouping, message rendering and chat DOM event binding.
 */

(function (root, factory) {
    if (typeof exports === 'object' && typeof module !== 'undefined') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else {
        const exportsObj = factory();
        root.ChatModule = exportsObj;
        if (typeof window !== 'undefined') {
            window.ChatModule = exportsObj;
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
     * Formats message content with markdown support:
     * - Multi-line and single-line code blocks: ```lang\ncode\n``` -> <pre><code class="language-lang">code</code></pre>
     * - Inline code: `code` -> <code>code</code>
     * - Bold text: **text** -> <strong>text</strong>
     * - Web links: https://... -> <a href="..." target="_blank" rel="noopener noreferrer">...</a>
     * - Newlines outside code blocks -> <br>
     * All input is safely HTML-escaped.
     * @param {string} text
     * @returns {string}
     */
    function formatMessageContent(text) {
        if (!text) return '';
        let escaped = escapeHtml(text);

        // 1. Extract and replace code blocks with temporary placeholders
        const codeBlocks = [];
        escaped = escaped.replace(/```(?:([a-zA-Z0-9_-]+)\r?\n)?([\s\S]*?)```/g, (match, lang, code) => {
            const token = `__CODE_BLOCK_${codeBlocks.length}__`;
            const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
            const cleanCode = (code || '').replace(/^\r?\n/, '').replace(/\r?\n$/, '');
            codeBlocks.push(`<pre><code${langClass}>${cleanCode}</code></pre>`);
            return token;
        });

        // 2. Extract and replace inline code with temporary placeholders
        const inlineCodes = [];
        escaped = escaped.replace(/`([^`\r\n]+)`/g, (match, inlineCode) => {
            const token = `__INLINE_CODE_${inlineCodes.length}__`;
            inlineCodes.push(`<code>${inlineCode}</code>`);
            return token;
        });

        // 3. Format bold text: **text**
        escaped = escaped.replace(/\*\*([^*\r\n]+)\*\*/g, '<strong>$1</strong>');

        // 4. Convert URLs to safe clickable links
        escaped = escaped.replace(/(https?:\/\/[^\s<>"']+)/g, (url) => {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${url}</a>`;
        });

        // 5. Convert newlines outside code blocks to <br>
        escaped = escaped.replace(/\r?\n/g, '<br>');

        // 6. Restore inline codes and code blocks
        escaped = escaped.replace(/__INLINE_CODE_(\d+)__/g, (_, idx) => inlineCodes[Number(idx)] || '');
        escaped = escaped.replace(/__CODE_BLOCK_(\d+)__/g, (_, idx) => codeBlocks[Number(idx)] || '');

        return escaped;
    }

    /**
     * Determines file icon glyph based on attachment metadata
     * @param {string} iconType
     * @param {string} fileName
     * @returns {string}
     */
    function getAttachmentIconGlyph(iconType, fileName = '') {
        const ext = (fileName.includes('.') ? fileName.split('.').pop() : '').toLowerCase();
        const icon = (iconType || '').toLowerCase();

        if (icon === 'image' || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
            return '🖼️';
        }
        if (icon === 'pdf' || ext === 'pdf') {
            return '📕';
        }
        if (icon === 'doc' || ['doc', 'docx', 'rtf'].includes(ext)) {
            return '📘';
        }
        if (icon === 'sheet' || ['xls', 'xlsx', 'csv'].includes(ext)) {
            return '📊';
        }
        if (icon === 'archive' || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
            return '📦';
        }
        if (icon === 'text' || ['txt', 'log', 'json', 'sql', 'xml'].includes(ext)) {
            return '📄';
        }
        return '📎';
    }

    /**
     * Renders HTML card for file attachment
     * @param {Object} attachment - { name, sizeFormatted, url, icon, type }
     * @returns {string}
     */
    function renderAttachmentCard(attachment) {
        if (!attachment || typeof attachment !== 'object') return '';

        const name = String(attachment.name || 'unnamed_file');
        const url = String(attachment.url || '#');
        const sizeFormatted = String(attachment.sizeFormatted || '');
        const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
        const isImage = (attachment.icon === 'image') ||
            (attachment.type && String(attachment.type).startsWith('image/')) ||
            ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext);

        const safeName = escapeHtml(name);
        const safeUrl = escapeHtml(url);
        const safeSize = escapeHtml(sizeFormatted);
        const iconGlyph = getAttachmentIconGlyph(attachment.icon, name);

        if (isImage) {
            return `
<div class="attachment-card attachment-card-image" data-filename="${safeName}">
    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="attachment-preview-link">
        <img src="${safeUrl}" alt="${safeName}" class="attachment-thumb" loading="lazy">
    </a>
    <div class="attachment-info">
        <div class="attachment-name" title="${safeName}">${safeName}</div>
        <div class="attachment-size">${safeSize}</div>
        <a href="${safeUrl}" class="attachment-download-link" download="${safeName}" target="_blank" rel="noopener noreferrer">Скачать</a>
    </div>
</div>`.trim();
        }

        return `
<div class="attachment-card" data-filename="${safeName}">
    <div class="attachment-icon">${iconGlyph}</div>
    <div class="attachment-info">
        <div class="attachment-name" title="${safeName}">${safeName}</div>
        <div class="attachment-size">${safeSize}</div>
        <a href="${safeUrl}" class="attachment-download-link" download="${safeName}" target="_blank" rel="noopener noreferrer">Скачать</a>
    </div>
</div>`.trim();
    }

    /**
     * Returns initials from employee full name (e.g. 'Иванов А.С.' -> 'ИА')
     * @param {string} name
     * @returns {string}
     */
    function getEmployeeInitials(name) {
        if (!name || typeof name !== 'string') return 'УА';
        const trimmed = name.trim();
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
            const first = parts[0][0] || '';
            const second = parts[1][0] || '';
            return (first + second).toUpperCase();
        }
        return trimmed.slice(0, 2).toUpperCase() || 'УА';
    }

    /**
     * Returns role badge metadata strictly conforming to departmental roles:
     * - chief: Начальник УАиБД -> '[Начальник]'
     * - lead_engineer: Ведущий инженер -> '[Вед. инж.]'
     * - developer: Программист -> '[Программист]'
     * @param {string} role
     * @returns {{ text: string, label: string, className: string, avatarClass: string }}
     */
    function getRoleBadge(role) {
        switch (role) {
            case 'chief':
                return {
                    text: '[Начальник]',
                    label: 'Начальник УАиБД',
                    className: 'badge-role-chief',
                    avatarClass: 'avatar-chief'
                };
            case 'lead_engineer':
                return {
                    text: '[Вед. инж.]',
                    label: 'Ведущий инженер',
                    className: 'badge-role-lead',
                    avatarClass: 'avatar-lead'
                };
            case 'developer':
            default:
                return {
                    text: '[Программист]',
                    label: 'Программист',
                    className: 'badge-role-dev',
                    avatarClass: 'avatar-dev'
                };
        }
    }

    /**
     * Formats timestamp to HH:MM (24-hour)
     * @param {string|Date} dateVal
     * @returns {string}
     */
    function formatTime(dateVal) {
        if (!dateVal) return '';
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return '';
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${mins}`;
    }

    /**
     * Returns human-readable date label for divider: 'Сегодня', 'Вчера', or 'DD.MM.YYYY'
     * @param {Date} date
     * @returns {string}
     */
    function getDateLabel(date) {
        if (!date || isNaN(date.getTime())) return '';
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return 'Сегодня';
        } else if (diffDays === 1) {
            return 'Вчера';
        } else {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}.${month}.${year}`;
        }
    }

    /**
     * Renders a single message item HTML
     * @param {Object} message - Message record
     * @param {string} [currentUserId] - ID of current user (for self-styling)
     * @param {boolean} [showHeader=true] - Whether to render full header (avatar, author, badge)
     * @returns {string}
     */
    function renderSingleMessageHtml(message, currentUserId = null, showHeader = true) {
        if (!message) return '';

        const sender = message.sender || message.profiles || message.profile || {};
        const fullName = message.author_name || message.full_name || sender.full_name || 'Сотрудник УАиБД';
        const role = message.role || sender.role || 'developer';
        const senderId = message.sender_id || sender.id || message.user_id || '';
        const isOwn = Boolean(currentUserId && senderId && String(senderId) === String(currentUserId));

        const roleInfo = getRoleBadge(role);
        const initials = getEmployeeInitials(fullName);
        const timeFormatted = formatTime(message.created_at);

        const safeFullName = escapeHtml(fullName);
        const safeSenderId = escapeHtml(senderId);
        const safeMessageId = escapeHtml(message.id || '');
        const safeIsoDate = escapeHtml(message.created_at || '');

        const contentHtml = formatMessageContent(message.content || '');

        let attachmentsHtml = '';
        if (Array.isArray(message.attachments) && message.attachments.length > 0) {
            const cards = message.attachments.map(att => renderAttachmentCard(att)).filter(Boolean).join('\n');
            if (cards) {
                attachmentsHtml = `<div class="message-attachments">${cards}</div>`;
            }
        }

        if (!showHeader) {
            return `
<div class="message-item message-compact ${isOwn ? 'message-own' : ''}" data-message-id="${safeMessageId}" data-sender-id="${safeSenderId}">
    <div class="message-compact-gutter">
        <span class="compact-timestamp" title="${safeIsoDate}">${timeFormatted}</span>
    </div>
    <div class="message-body">
        <div class="message-text">${contentHtml}</div>
        ${attachmentsHtml}
    </div>
</div>`.trim();
        }

        return `
<div class="message-item ${isOwn ? 'message-own' : ''}" data-message-id="${safeMessageId}" data-sender-id="${safeSenderId}">
    <div class="message-avatar ${roleInfo.avatarClass}" title="${safeFullName} (${roleInfo.label})">${initials}</div>
    <div class="message-body">
        <div class="message-meta">
            <span class="message-author">${safeFullName}</span>
            <span class="message-role ${roleInfo.className}">${roleInfo.text}</span>
            <span class="message-timestamp" title="${safeIsoDate}">${timeFormatted}</span>
        </div>
        <div class="message-text">${contentHtml}</div>
        ${attachmentsHtml}
    </div>
</div>`.trim();
    }

    /**
     * Groups messages list into day partitions with labels ('Сегодня', 'Вчера', 'DD.MM.YYYY')
     * @param {Array} messagesList
     * @returns {Array<{ date: string, label: string, messages: Array }>}
     */
    function groupMessagesByDay(messagesList = []) {
        if (!Array.isArray(messagesList) || messagesList.length === 0) return [];

        const groups = [];
        const groupMap = new Map();

        for (const msg of messagesList) {
            const d = msg.created_at ? new Date(msg.created_at) : new Date();
            const dateKey = !isNaN(d.getTime())
                ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                : 'other';

            if (!groupMap.has(dateKey)) {
                const label = getDateLabel(d);
                const group = {
                    date: dateKey,
                    label: label,
                    messages: []
                };
                groupMap.set(dateKey, group);
                groups.push(group);
            }
            groupMap.get(dateKey).messages.push(msg);
        }

        return groups;
    }

    /**
     * Renders messages list into container element, auto-scrolling to bottom
     * Supports both renderMessages(container, messages, currentUserId) and renderMessages(messages, currentUserId)
     * @param {HTMLElement|Array} containerOrMessages
     * @param {Array|string} [messagesOrUserId]
     * @param {string} [currentUserId]
     */
    function renderMessages(containerOrMessages, messagesOrUserId, currentUserId) {
        let container, messages, userId;
        if (Array.isArray(containerOrMessages)) {
            messages = containerOrMessages;
            userId = messagesOrUserId;
            container = (typeof document !== 'undefined') ? document.getElementById('messagesContainer') : null;
        } else {
            container = containerOrMessages;
            messages = messagesOrUserId || [];
            userId = currentUserId;
        }

        if (!container) return;

        if (!Array.isArray(messages) || messages.length === 0) {
            container.innerHTML = `
<div class="chat-welcome-banner">
    <div class="welcome-icon">💬</div>
    <h3 class="welcome-title">Добро пожаловать в рабочий чат УАиБД БМЗ!</h3>
    <p class="welcome-desc">Здесь осуществляется оперативная передача смен, обсуждение показаний датчиков, ПЛК и регламентов печей ДСП.</p>
</div>`;
            return;
        }

        const dayGroups = groupMessagesByDay(messages);
        const htmlParts = [];

        for (const group of dayGroups) {
            htmlParts.push(`<div class="chat-date-divider" role="separator"><span>${escapeHtml(group.label)}</span></div>`);
            let lastSenderId = null;
            let lastTime = null;

            for (const msg of group.messages) {
                const senderId = msg.sender_id || (msg.sender && msg.sender.id) || msg.user_id;
                const msgTime = msg.created_at ? new Date(msg.created_at).getTime() : 0;
                // Show header if sender changes or message is more than 5 minutes apart
                const showHeader = (senderId !== lastSenderId) || (lastTime === null) || (msgTime - lastTime > 5 * 60 * 1000);
                htmlParts.push(renderSingleMessageHtml(msg, userId, showHeader));
                lastSenderId = senderId;
                lastTime = msgTime;
            }
        }

        container.innerHTML = htmlParts.join('\n');
        if (typeof container.scrollTop !== 'undefined' && typeof container.scrollHeight !== 'undefined') {
            container.scrollTop = container.scrollHeight;
        }
    }

    /**
     * Appends a single message to container without full re-render and scrolls down
     * Supports both appendSingleMessage(container, message, currentUserId) and appendSingleMessage(message, currentUserId)
     * @param {HTMLElement|Object} containerOrMessage
     * @param {Object|string} [messageOrUserId]
     * @param {string} [currentUserId]
     * @returns {string|null}
     */
    function appendSingleMessage(containerOrMessage, messageOrUserId, currentUserId) {
        let container, message, userId;
        if (containerOrMessage && (containerOrMessage.id || containerOrMessage.content !== undefined)) {
            message = containerOrMessage;
            userId = messageOrUserId;
            container = (typeof document !== 'undefined') ? document.getElementById('messagesContainer') : null;
        } else {
            container = containerOrMessage;
            message = messageOrUserId;
            userId = currentUserId;
        }

        if (!container || !message) return null;

        // If welcome banner is shown, clean it before first real message
        if (container.querySelector && container.querySelector('.chat-welcome-banner')) {
            const banner = container.querySelector('.chat-welcome-banner');
            if (banner && banner.parentNode) {
                banner.parentNode.removeChild(banner);
            }
        }

        const html = renderSingleMessageHtml(message, userId, true);
        if (typeof container.insertAdjacentHTML === 'function') {
            container.insertAdjacentHTML('beforeend', html);
        } else if (typeof container.innerHTML === 'string') {
            container.innerHTML += '\n' + html;
        }

        if (typeof container.scrollTop !== 'undefined' && typeof container.scrollHeight !== 'undefined') {
            container.scrollTop = container.scrollHeight;
        }

        return html;
    }

    /**
     * Binds DOM events for chat input, send button, attachment button, and auto-growing textarea
     * @param {Object} domElements - { messageInput, btnSendMessage, btnAttachFile, fileInput, attachmentPreviews, attachmentList }
     * @param {Object} callbacks - { onSendMessage, onFilesSelected, onRemoveFile }
     */
    function bindChatEvents(domElements = {}, callbacks = {}) {
        const {
            messageInput,
            btnSendMessage,
            btnAttachFile,
            fileInput
        } = domElements;

        let pendingAttachments = [];

        function triggerSend() {
            if (!messageInput) return;
            const text = (messageInput.value || '').trim();
            if (!text && pendingAttachments.length === 0) return;

            if (typeof callbacks.onSendMessage === 'function') {
                callbacks.onSendMessage(text, [...pendingAttachments]);
            }

            messageInput.value = '';
            messageInput.style.height = 'auto';
            pendingAttachments = [];
            if (domElements.attachmentPreviews) {
                domElements.attachmentPreviews.classList.add('hidden');
            }
            if (domElements.attachmentList) {
                domElements.attachmentList.innerHTML = '';
            }
            messageInput.focus();
        }

        if (messageInput) {
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    triggerSend();
                }
            });

            messageInput.addEventListener('input', () => {
                messageInput.style.height = 'auto';
                messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
            });
        }

        if (btnSendMessage) {
            btnSendMessage.addEventListener('click', (e) => {
                e.preventDefault();
                triggerSend();
            });
        }

        if (btnAttachFile && fileInput) {
            btnAttachFile.addEventListener('click', (e) => {
                e.preventDefault();
                fileInput.click();
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', () => {
                if (fileInput.files && fileInput.files.length > 0) {
                    if (typeof callbacks.onFilesSelected === 'function') {
                        callbacks.onFilesSelected(fileInput.files);
                    }
                }
            });
        }

        return {
            triggerSend,
            setPendingAttachments(attachments) {
                pendingAttachments = attachments || [];
            }
        };
    }

    const ChatModule = {
        escapeHtml,
        formatMessageContent,
        renderAttachmentCard,
        renderSingleMessageHtml,
        groupMessagesByDay,
        renderMessages,
        appendSingleMessage,
        bindChatEvents,
        getAttachmentIconGlyph,
        getEmployeeInitials,
        getRoleBadge,
        getDateLabel,
        formatTime
    };

    return Object.assign(ChatModule, { ChatModule });
});
