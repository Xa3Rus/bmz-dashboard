/**
 * UA&BD Task Messenger - Supabase Data Access Client Module
 * Department: Управление автоматизации и баз данных (УАиБД) БМЗ
 * Handles profiles, channels, direct chats, tasks, reports, file storage, and realtime subscriptions.
 */

let supabasePkg = null;
try {
    supabasePkg = require('@supabase/supabase-js');
} catch (_) {
    // @supabase/supabase-js may not be installed in test/offline environments
}

class SupabaseService {
    constructor() {
        this.config = null;
        this.supabaseUrl = '';
        this.supabaseAnonKey = '';
        this.client = null;
    }

    /**
     * Initializes Supabase client with given credentials or custom client
     * @param {Object} config - { supabaseUrl, supabaseAnonKey }
     * @param {Object} [customClient] - Optional mock/custom client instance
     */
    init(config = {}, customClient = null) {
        this.config = config || {};
        this.supabaseUrl = (config && config.supabaseUrl) ? String(config.supabaseUrl).trim() : '';
        this.supabaseAnonKey = (config && config.supabaseAnonKey) ? String(config.supabaseAnonKey).trim() : '';

        if (customClient) {
            this.client = customClient;
        } else if (supabasePkg && typeof supabasePkg.createClient === 'function' && this.isConfigured()) {
            try {
                this.client = supabasePkg.createClient(this.supabaseUrl, this.supabaseAnonKey, {
                    auth: {
                        persistSession: false
                    }
                });
            } catch (err) {
                console.warn('[SupabaseService] Failed to initialize client:', err.message);
                this.client = null;
            }
        } else {
            this.client = null;
        }

        return this.client;
    }

    /**
     * Returns true if URL and Anon key are valid and not default placeholders
     * @returns {boolean}
     */
    isConfigured() {
        if (!this.supabaseUrl || !this.supabaseAnonKey) {
            return false;
        }
        if (this.supabaseUrl.includes('your-project') || this.supabaseAnonKey === 'your-anon-key-here') {
            return false;
        }
        return true;
    }

    /**
     * Permission check: can role create tasks
     * Only chief (Начальник УАиБД) and lead_engineer (Ведущий инженер)
     * @param {string} role
     * @returns {boolean}
     */
    canCreateTask(role) {
        return role === 'chief' || role === 'lead_engineer';
    }

    /**
     * Permission check: can role review and approve task reports
     * Only chief (Начальник УАиБД) and lead_engineer (Ведущий инженер)
     * @param {string} role
     * @returns {boolean}
     */
    canReviewReport(role) {
        return role === 'chief' || role === 'lead_engineer';
    }

    /**
     * Format file attachment metadata with human-readable size and type icon
     * @param {string} name - File name
     * @param {number} size - File size in bytes
     * @param {string} [type] - MIME type
     * @param {string} [url] - Download/Storage URL
     * @returns {{ name: string, size: number, type: string, url: string, sizeFormatted: string, icon: string }}
     */
    formatAttachment(name, size, type = '', url = '') {
        const fileName = String(name || '');
        const bytes = Number(size) || 0;
        let sizeFormatted = '0 B';

        if (bytes <= 0) {
            sizeFormatted = '0 B';
        } else if (bytes < 1024) {
            sizeFormatted = `${bytes} B`;
        } else if (bytes < 1024 * 1024) {
            sizeFormatted = `${(bytes / 1024).toFixed(1)} KB`;
        } else if (bytes < 1024 * 1024 * 1024) {
            sizeFormatted = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        } else {
            sizeFormatted = `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
        }

        const ext = (fileName.includes('.') ? fileName.split('.').pop() : '').toLowerCase();
        const mime = String(type || '').toLowerCase();

        let icon = 'file';
        if (
            mime.startsWith('image/') ||
            ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)
        ) {
            icon = 'image';
        } else if (mime === 'application/pdf' || ext === 'pdf') {
            icon = 'pdf';
        } else if (
            mime.includes('word') ||
            mime.includes('document') ||
            ['doc', 'docx', 'rtf', 'odt'].includes(ext)
        ) {
            icon = 'doc';
        } else if (
            mime.includes('sheet') ||
            mime.includes('excel') ||
            mime === 'text/csv' ||
            ['xls', 'xlsx', 'csv', 'ods'].includes(ext)
        ) {
            icon = 'sheet';
        } else if (
            mime.includes('zip') ||
            mime.includes('compressed') ||
            mime.includes('tar') ||
            mime.includes('archive') ||
            ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)
        ) {
            icon = 'archive';
        } else if (
            mime.startsWith('text/') ||
            ['txt', 'log', 'json', 'sql', 'xml', 'md', 'js', 'ts', 'py', 'c', 'cpp', 'h'].includes(ext)
        ) {
            icon = 'text';
        }

        return {
            name: fileName,
            size: bytes,
            type: type || '',
            url: url || '',
            sizeFormatted,
            icon
        };
    }

    /**
     * Get all employee profiles
     * @returns {Promise<Array>}
     */
    async getProfiles() {
        if (!this.client) return [];
        const { data, error } = await this.client
            .from('profiles')
            .select('*')
            .order('full_name', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    /**
     * Update user online status and status text
     * @param {string} userId
     * @param {boolean} isOnline
     * @param {string} [statusText]
     * @returns {Promise<Object>}
     */
    async updateProfileStatus(userId, isOnline, statusText = null) {
        if (!this.client) return null;
        const updates = {
            is_online: Boolean(isOnline),
            last_seen: new Date().toISOString()
        };
        if (statusText !== null && statusText !== undefined) {
            updates.status_text = statusText;
        }

        const { data, error } = await this.client
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .select();
        if (error) throw error;
        return (data && data[0]) ? data[0] : null;
    }

    /**
     * Get list of public channels
     * @returns {Promise<Array>}
     */
    async getChannels() {
        if (!this.client) return [];
        const { data, error } = await this.client
            .from('channels')
            .select('*')
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    /**
     * Get message history for a channel
     * @param {string} channelId
     * @returns {Promise<Array>}
     */
    async getChannelMessages(channelId) {
        if (!this.client) return [];
        const { data, error } = await this.client
            .from('messages')
            .select('*')
            .eq('channel_id', channelId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    /**
     * Get direct chats for a specific user
     * @param {string} userId
     * @returns {Promise<Array>}
     */
    async getDirectChats(userId) {
        if (!this.client) return [];
        const { data, error } = await this.client
            .from('direct_chats')
            .select('*')
            .or(`user_1.eq.${userId},user_2.eq.${userId}`);
        if (error) throw error;
        return data || [];
    }

    /**
     * Get message history for a direct chat
     * @param {string} chatId
     * @returns {Promise<Array>}
     */
    async getDirectMessages(chatId) {
        if (!this.client) return [];
        const { data, error } = await this.client
            .from('messages')
            .select('*')
            .eq('direct_chat_id', chatId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    /**
     * Send message to channel or direct chat
     * @param {string} senderId
     * @param {'channel'|'direct'} targetType
     * @param {string} targetId
     * @param {string} text
     * @param {Array} [attachments]
     * @returns {Promise<Object>}
     */
    async sendMessage(senderId, targetType, targetId, text, attachments = []) {
        if (!this.client) return null;
        const payload = {
            sender_id: senderId,
            content: text,
            attachments: attachments || []
        };

        if (targetType === 'channel') {
            payload.channel_id = targetId;
            payload.direct_chat_id = null;
        } else if (targetType === 'direct') {
            payload.direct_chat_id = targetId;
            payload.channel_id = null;
        } else {
            payload[targetType] = targetId;
        }

        const { data, error } = await this.client
            .from('messages')
            .insert([payload])
            .select();
        if (error) throw error;
        return (data && data[0]) ? data[0] : null;
    }

    /**
     * Get tasks with optional user and role filters
     * @param {string} [filterUser]
     * @param {string} [role]
     * @returns {Promise<Array>}
     */
    async getTasks(filterUser = null, role = null) {
        if (!this.client) return [];
        let query = this.client.from('tasks').select('*');

        if (filterUser) {
            if (role === 'developer') {
                query = query.eq('assignee_id', filterUser);
            } else {
                query = query.or(`assignee_id.eq.${filterUser},creator_id.eq.${filterUser}`);
            }
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    /**
     * Create a new task (by chief or lead_engineer)
     * @param {string} title
     * @param {string} description
     * @param {string} creatorId
     * @param {string} assigneeId
     * @param {'urgent'|'high'|'normal'} [priority]
     * @param {string|null} [dueDate]
     * @returns {Promise<Object>}
     */
    async createTask(title, description, creatorId, assigneeId, priority = 'normal', dueDate = null) {
        if (!this.client) return null;
        const validPriorities = ['urgent', 'high', 'normal'];
        const taskPriority = validPriorities.includes(priority) ? priority : 'normal';

        const payload = {
            title,
            description,
            creator_id: creatorId,
            assignee_id: assigneeId,
            priority: taskPriority,
            status: 'todo',
            due_date: dueDate || null
        };

        const { data, error } = await this.client
            .from('tasks')
            .insert([payload])
            .select();
        if (error) throw error;
        return (data && data[0]) ? data[0] : null;
    }

    /**
     * Update task status: 'todo' -> 'in_progress' -> 'review' -> 'done'
     * @param {string} taskId
     * @param {'todo'|'in_progress'|'review'|'done'} newStatus
     * @returns {Promise<Object>}
     */
    async updateTaskStatus(taskId, newStatus) {
        if (!this.client) return null;
        const validStatuses = ['todo', 'in_progress', 'review', 'done'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`);
        }

        const { data, error } = await this.client
            .from('tasks')
            .update({
                status: newStatus,
                updated_at: new Date().toISOString()
            })
            .eq('id', taskId)
            .select();
        if (error) throw error;
        return (data && data[0]) ? data[0] : null;
    }

    /**
     * Developer submits completion report with optional attachments
     * Transitions task status to 'review'
     * @param {string} taskId
     * @param {string} authorId
     * @param {string} reportText
     * @param {Array} [attachments]
     * @returns {Promise<Object>}
     */
    async submitTaskReport(taskId, authorId, reportText, attachments = []) {
        if (!this.client) return null;
        const reportPayload = {
            task_id: taskId,
            author_id: authorId,
            report_text: reportText,
            attachments: attachments || []
        };

        const { data, error } = await this.client
            .from('task_reports')
            .insert([reportPayload])
            .select();
        if (error) throw error;

        await this.updateTaskStatus(taskId, 'review');
        return (data && data[0]) ? data[0] : null;
    }

    /**
     * Chief/Lead Engineer reviews report: approves to 'done' or returns to 'todo' with comment
     * @param {string} taskId
     * @param {boolean} isApproved
     * @param {string} [comment]
     * @returns {Promise<Object>}
     */
    async reviewTaskReport(taskId, isApproved, comment = '') {
        if (!this.client) return null;
        const newStatus = isApproved ? 'done' : 'todo';
        const updatedTask = await this.updateTaskStatus(taskId, newStatus);

        if (comment) {
            await this.client
                .from('task_reports')
                .update({ review_comment: comment })
                .eq('task_id', taskId);
        }

        return {
            taskId,
            status: newStatus,
            isApproved: Boolean(isApproved),
            review_comment: comment || '',
            task: updatedTask
        };
    }

    /**
     * Upload binary or text file to Supabase storage bucket
     * @param {string} bucket
     * @param {string} path
     * @param {Buffer|Blob|ArrayBuffer} fileBuffer
     * @param {string} [mimeType]
     * @returns {Promise<{ path: string, publicUrl: string }>}
     */
    async uploadFile(bucket = 'uaibd-files', path, fileBuffer, mimeType = 'application/octet-stream') {
        if (!this.client || !this.client.storage) {
            throw new Error('Supabase storage client not available');
        }

        const { data, error } = await this.client.storage
            .from(bucket)
            .upload(path, fileBuffer, {
                contentType: mimeType,
                upsert: true
            });
        if (error) throw error;

        const { data: publicUrlData } = this.client.storage
            .from(bucket)
            .getPublicUrl(path);

        return {
            path: (data && data.path) ? data.path : path,
            publicUrl: publicUrlData ? publicUrlData.publicUrl : ''
        };
    }

    /**
     * Subscribe to realtime message inserts/updates
     * @param {Function} callback
     * @returns {Object} subscription channel
     */
    subscribeToMessages(callback) {
        if (!this.client || typeof this.client.channel !== 'function') {
            return { unsubscribe: () => {} };
        }

        return this.client
            .channel('realtime:messages')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
                if (typeof callback === 'function') callback(payload);
            })
            .subscribe();
    }

    /**
     * Subscribe to realtime task status and assignment updates
     * @param {Function} callback
     * @returns {Object} subscription channel
     */
    subscribeToTasks(callback) {
        if (!this.client || typeof this.client.channel !== 'function') {
            return { unsubscribe: () => {} };
        }

        return this.client
            .channel('realtime:tasks')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
                if (typeof callback === 'function') callback(payload);
            })
            .subscribe();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SupabaseService };
}

if (typeof window !== 'undefined') {
    window.SupabaseService = SupabaseService;
}
