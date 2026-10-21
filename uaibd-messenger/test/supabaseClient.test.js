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

    test('formats image attachments with img icon', () => {
        const service = new SupabaseService();
        const record = service.formatAttachment('screen.png', 2048576, 'image/png', 'https://storage/screen.png');
        assert.strictEqual(record.icon, 'image');
        assert.strictEqual(record.sizeFormatted, '2.0 MB');
    });

    test('formats pdf, word, excel, archive and generic attachments', () => {
        const service = new SupabaseService();
        assert.strictEqual(service.formatAttachment('manual.pdf', 500, 'application/pdf').icon, 'pdf');
        assert.strictEqual(service.formatAttachment('spec.docx', 500, '').icon, 'doc');
        assert.strictEqual(service.formatAttachment('data.xlsx', 500, '').icon, 'sheet');
        assert.strictEqual(service.formatAttachment('backup.zip', 500, '').icon, 'archive');
        assert.strictEqual(service.formatAttachment('binary.bin', 500, '').icon, 'file');
        assert.strictEqual(service.formatAttachment('small.dat', 120, '').sizeFormatted, '120 B');
    });

    test('handles mock client for data queries and mutations', async () => {
        const mockDb = {
            profiles: [{ id: 'u1', full_name: 'Иванов А.С.', role: 'chief' }],
            tasks: [],
            task_reports: [],
            messages: []
        };

        const mockClient = {
            from: (table) => {
                return {
                    select: () => ({
                        order: () => Promise.resolve({ data: mockDb[table] || [], error: null }),
                        eq: (col, val) => ({
                            order: () => Promise.resolve({
                                data: (mockDb[table] || []).filter(item => item[col] === val),
                                error: null
                            })
                        }),
                        or: () => Promise.resolve({ data: mockDb[table] || [], error: null })
                    }),
                    insert: (rows) => ({
                        select: () => {
                            const inserted = rows.map((r, i) => ({ id: `gen-${i}`, ...r }));
                            mockDb[table].push(...inserted);
                            return Promise.resolve({ data: inserted, error: null });
                        }
                    }),
                    update: (updates) => ({
                        eq: (col, val) => ({
                            select: () => {
                                const found = mockDb[table].find(item => item[col] === val);
                                if (found) Object.assign(found, updates);
                                return Promise.resolve({ data: found ? [found] : [], error: null });
                            }
                        })
                    })
                };
            },
            storage: {
                from: () => ({
                    upload: (filePath) => Promise.resolve({ data: { path: filePath }, error: null }),
                    getPublicUrl: (filePath) => ({ data: { publicUrl: `https://storage.mock/${filePath}` } })
                })
            },
            channel: (channelName) => ({
                on: () => ({
                    subscribe: () => ({
                        unsubscribe: () => {}
                    })
                })
            })
        };

        const service = new SupabaseService();
        service.init({
            supabaseUrl: 'https://test.supabase.co',
            supabaseAnonKey: 'test-key'
        }, mockClient);

        // Test profiles query
        const profiles = await service.getProfiles();
        assert.strictEqual(profiles.length, 1);
        assert.strictEqual(profiles[0].full_name, 'Иванов А.С.');

        // Test task creation
        const task = await service.createTask('Ремонт ДСП', 'Описание', 'u1', 'u2', 'urgent', '2026-10-22');
        assert.strictEqual(task.title, 'Ремонт ДСП');
        assert.strictEqual(task.status, 'todo');

        // Test task status update
        const updated = await service.updateTaskStatus(task.id, 'in_progress');
        assert.strictEqual(updated.status, 'in_progress');

        // Test submit report
        const report = await service.submitTaskReport(task.id, 'u2', 'Готово', []);
        assert.strictEqual(report.task_id, task.id);
        assert.strictEqual(report.report_text, 'Готово');

        // Test review report
        const review = await service.reviewTaskReport(task.id, true, 'Принято без замечаний');
        assert.strictEqual(review.status, 'done');

        // Test upload file
        const uploadResult = await service.uploadFile('uaibd-files', 'reports/test.txt', Buffer.from('data'), 'text/plain');
        assert.strictEqual(uploadResult.publicUrl, 'https://storage.mock/reports/test.txt');

        // Test subscriptions
        const subMsg = service.subscribeToMessages(() => {});
        assert.ok(subMsg);
        const subTasks = service.subscribeToTasks(() => {});
        assert.ok(subTasks);
    });
});
