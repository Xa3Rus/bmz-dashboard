const { test, describe } = require('node:test');
const assert = require('node:assert');
const { 
    formatMessageContent, 
    renderAttachmentCard, 
    renderSingleMessageHtml, 
    groupMessagesByDay,
    escapeHtml,
    renderMessages,
    appendSingleMessage,
    bindChatEvents,
    ChatModule
} = require('../renderer/chat');

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

    test('renders inline code and bold markdown', () => {
        const raw = 'Параметр `DB10.DBW4` равен **1200**';
        const formatted = formatMessageContent(raw);
        assert.ok(formatted.includes('<code>DB10.DBW4</code>'));
        assert.ok(formatted.includes('<strong>1200</strong>'));
    });

    test('renders file attachment card for pdf and txt documents', () => {
        const att = { 
            name: 'furnace_dump.txt', 
            sizeFormatted: '12.4 KB', 
            url: 'https://files/furnace_dump.txt',
            icon: 'text'
        };
        const html = renderAttachmentCard(att);
        assert.ok(html.includes('furnace_dump.txt'));
        assert.ok(html.includes('12.4 KB'));
        assert.ok(html.includes('href="https://files/furnace_dump.txt"'));
        assert.ok(html.includes('download'));
    });

    test('renders image attachment preview card', () => {
        const att = { 
            name: 'scada_view.png', 
            sizeFormatted: '1.2 MB', 
            url: 'https://files/scada_view.png',
            icon: 'image'
        };
        const html = renderAttachmentCard(att);
        assert.ok(html.includes('<img'));
        assert.ok(html.includes('scada_view.png'));
    });

    test('groups messages by date correctly', () => {
        const msg1 = { id: '1', created_at: '2026-10-21T08:00:00Z', content: 'Привет' };
        const msg2 = { id: '2', created_at: '2026-10-21T09:30:00Z', content: 'Работаем' };
        const groups = groupMessagesByDay([msg1, msg2]);
        assert.strictEqual(groups.length, 1);
        assert.strictEqual(groups[0].messages.length, 2);
    });

    test('renders single message HTML with author, role badge and timestamp', () => {
        const chiefMsg = {
            id: 'm-1',
            sender_id: 'u-chief',
            created_at: '2026-10-21T10:15:00Z',
            content: 'Провести ревизию ПЛК',
            sender: {
                id: 'u-chief',
                full_name: 'Иванов А.С.',
                role: 'chief'
            }
        };

        const html = renderSingleMessageHtml(chiefMsg, 'u-dev');
        assert.ok(html.includes('Иванов А.С.'));
        assert.ok(html.includes('[Начальник]'));
        assert.ok(html.includes('badge-role-chief'));
        assert.ok(html.includes('Провести ревизию ПЛК'));
        assert.ok(html.includes('10:15') || html.includes('13:15')); // localized or UTC minutes
    });

    test('renders lead_engineer and developer role badges correctly', () => {
        const leadMsg = {
            id: 'm-2',
            sender_id: 'u-lead',
            content: 'Сводка ДСП готова',
            sender: { full_name: 'Петров В.И.', role: 'lead_engineer' }
        };
        const devMsg = {
            id: 'm-3',
            sender_id: 'u-dev',
            content: 'Загрузил дамп',
            sender: { full_name: 'Сидоров М.К.', role: 'developer' }
        };

        const leadHtml = renderSingleMessageHtml(leadMsg, 'u-chief');
        assert.ok(leadHtml.includes('[Вед. инж.]'));
        assert.ok(leadHtml.includes('badge-role-lead'));

        const devHtml = renderSingleMessageHtml(devMsg, 'u-chief');
        assert.ok(devHtml.includes('[Программист]'));
        assert.ok(devHtml.includes('badge-role-dev'));
    });

    test('converts links to safe clickable anchors', () => {
        const raw = 'Документация по Siemens S7: https://support.industry.siemens.com/cs/document/109';
        const formatted = formatMessageContent(raw);
        assert.ok(formatted.includes('<a href="https://support.industry.siemens.com/cs/document/109"'));
        assert.ok(formatted.includes('target="_blank"'));
        assert.ok(formatted.includes('rel="noopener noreferrer"'));
    });

    test('renderMessages and appendSingleMessage handle container rendering', () => {
        const container = {
            innerHTML: '',
            scrollTop: 0,
            scrollHeight: 500,
            insertAdjacentHTML(position, html) {
                this.innerHTML += html;
            }
        };

        const messages = [
            { id: '1', created_at: '2026-10-21T08:00:00Z', content: 'Сообщение 1', sender: { full_name: 'Иванов А.С.', role: 'chief' } },
            { id: '2', created_at: '2026-10-21T09:00:00Z', content: 'Сообщение 2', sender: { full_name: 'Петров В.И.', role: 'lead_engineer' } }
        ];

        renderMessages(container, messages, '1');
        assert.ok(container.innerHTML.includes('Сообщение 1'));
        assert.ok(container.innerHTML.includes('Сообщение 2'));
        assert.strictEqual(container.scrollTop, 500);

        const newMsg = {
            id: '3',
            created_at: '2026-10-21T10:00:00Z',
            content: 'Новое сообщение онлайн',
            sender: { full_name: 'Сидоров М.К.', role: 'developer' }
        };
        appendSingleMessage(container, newMsg, '1');
        assert.ok(container.innerHTML.includes('Новое сообщение онлайн'));
    });

    test('exports ChatModule object with all required interface functions', () => {
        assert.ok(ChatModule);
        assert.strictEqual(typeof ChatModule.renderMessages, 'function');
        assert.strictEqual(typeof ChatModule.appendSingleMessage, 'function');
        assert.strictEqual(typeof ChatModule.formatMessageContent, 'function');
        assert.strictEqual(typeof ChatModule.renderAttachmentCard, 'function');
        assert.strictEqual(typeof ChatModule.groupMessagesByDay, 'function');
        assert.strictEqual(typeof ChatModule.bindChatEvents, 'function');
    });
});
