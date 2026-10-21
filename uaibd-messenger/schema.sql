-- =============================================================================
-- BMZ UA&BD Task Messenger Database Schema
-- Target: Supabase (PostgreSQL 15+)
-- Department: Управление автоматизации и баз данных (УАиБД) БМЗ
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('chief', 'lead_engineer', 'developer')),
    status_text TEXT DEFAULT 'На смене',
    avatar_color TEXT DEFAULT '#4f545c',
    is_online BOOLEAN DEFAULT false,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Channels Table
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    topic TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Direct Chats Table
CREATE TABLE IF NOT EXISTS direct_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_1 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user_2 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT direct_chats_users_distinct CHECK (user_1 <> user_2)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_direct_chats_pair ON direct_chats (LEAST(user_1, user_2), GREATEST(user_1, user_2));

-- 4. Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    direct_chat_id UUID REFERENCES direct_chats(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT msg_target_check CHECK (
        (channel_id IS NOT NULL AND direct_chat_id IS NULL) OR
        (channel_id IS NULL AND direct_chat_id IS NOT NULL)
    )
);

-- 5. Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    assignee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    priority TEXT NOT NULL CHECK (priority IN ('urgent', 'high', 'normal')),
    status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'review', 'done')) DEFAULT 'todo',
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Task Reports Table
CREATE TABLE IF NOT EXISTS task_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    report_text TEXT NOT NULL,
    attachments JSONB DEFAULT '[]'::jsonb,
    review_comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Indexes for High Performance Queries
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_direct ON messages(direct_chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creator_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE INDEX IF NOT EXISTS idx_task_reports_task ON task_reports(task_id);

-- =============================================================================
-- Automatic Timestamp Updates
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_set_updated_at ON tasks;
CREATE TRIGGER trg_tasks_set_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Row Level Security (RLS) & Policies
-- =============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_reports ENABLE ROW LEVEL SECURITY;

-- Intranet / Public access policies for internal BMZ application
DO $$
BEGIN
    -- Profiles policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read profiles') THEN
        CREATE POLICY "Allow public read profiles" ON profiles FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public insert profiles') THEN
        CREATE POLICY "Allow public insert profiles" ON profiles FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public update profiles') THEN
        CREATE POLICY "Allow public update profiles" ON profiles FOR UPDATE USING (true);
    END IF;

    -- Channels policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read channels') THEN
        CREATE POLICY "Allow public read channels" ON channels FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public insert channels') THEN
        CREATE POLICY "Allow public insert channels" ON channels FOR INSERT WITH CHECK (true);
    END IF;

    -- Direct chats policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read direct_chats') THEN
        CREATE POLICY "Allow public read direct_chats" ON direct_chats FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public insert direct_chats') THEN
        CREATE POLICY "Allow public insert direct_chats" ON direct_chats FOR INSERT WITH CHECK (true);
    END IF;

    -- Messages policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read messages') THEN
        CREATE POLICY "Allow public read messages" ON messages FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public insert messages') THEN
        CREATE POLICY "Allow public insert messages" ON messages FOR INSERT WITH CHECK (true);
    END IF;

    -- Tasks policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read tasks') THEN
        CREATE POLICY "Allow public read tasks" ON tasks FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public insert tasks') THEN
        CREATE POLICY "Allow public insert tasks" ON tasks FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public update tasks') THEN
        CREATE POLICY "Allow public update tasks" ON tasks FOR UPDATE USING (true);
    END IF;

    -- Task reports policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read task_reports') THEN
        CREATE POLICY "Allow public read task_reports" ON task_reports FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public insert task_reports') THEN
        CREATE POLICY "Allow public insert task_reports" ON task_reports FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public update task_reports') THEN
        CREATE POLICY "Allow public update task_reports" ON task_reports FOR UPDATE USING (true);
    END IF;
END $$;

-- =============================================================================
-- Supabase Storage Bucket Setup for Engineering Reports & Attachments
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('uaibd-files', 'uaibd-files', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read uaibd-files') THEN
        CREATE POLICY "Allow public read uaibd-files" ON storage.objects
        FOR SELECT USING (bucket_id = 'uaibd-files');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public upload uaibd-files') THEN
        CREATE POLICY "Allow public upload uaibd-files" ON storage.objects
        FOR INSERT WITH CHECK (bucket_id = 'uaibd-files');
    END IF;
END $$;

-- =============================================================================
-- Seed Initial Data for BMZ UA&BD Department Testing & Defense
-- =============================================================================

-- Seed General Channel
INSERT INTO channels (id, slug, name, topic) 
VALUES 
    ('00000000-0000-0000-0000-000000000010', 'general', 'общий-чат', 'Оперативная координация дежурных смен и объявления УАиБД')
ON CONFLICT (slug) DO UPDATE 
SET name = EXCLUDED.name, topic = EXCLUDED.topic;

-- Seed Profiles:
-- 1. Иванов А.С. — Начальник УАиБД ('chief')
-- 2. Петров В.И. — Ведущий инженер ('lead_engineer')
-- 3. Сидоров М.К. — Программист АСУ ТП ('developer')
-- 4. Ковалев Д.А. — Программист баз данных ('developer')
INSERT INTO profiles (id, email, full_name, role, status_text, avatar_color, is_online)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'ivanov@bmz.by', 'Иванов А.С.', 'chief', 'Начальник УАиБД • В сети', '#e53935', true),
    ('00000000-0000-0000-0000-000000000002', 'petrov@bmz.by', 'Петров В.И.', 'lead_engineer', 'Ведущий инженер • ДСП-1', '#f57c00', true),
    ('00000000-0000-0000-0000-000000000003', 'sidorov@bmz.by', 'Сидоров М.К.', 'developer', 'Программист АСУ ТП • На смене', '#2e7d32', true),
    ('00000000-0000-0000-0000-000000000004', 'kovalev@bmz.by', 'Ковалев Д.А.', 'developer', 'Программист • Базы данных', '#1976d2', false)
ON CONFLICT (email) DO UPDATE 
SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, status_text = EXCLUDED.status_text;

-- Seed Initial Engineering Tasks
INSERT INTO tasks (id, title, description, creator_id, assignee_id, priority, status, due_date)
VALUES
    (
        '00000000-0000-0000-0000-000000000101',
        'Настройка связи ПЛК печи ДСП-1 с сервером SCADA',
        'Необходимо устранить периодические обрывы пакетов Profinet на контроллере S7-1500 (стойка АСУ ТП печи ДСП-1) и выгрузить диагностический лог.',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
        'urgent',
        'in_progress',
        CURRENT_DATE + INTERVAL '1 day'
    ),
    (
        '00000000-0000-0000-0000-000000000102',
        'Оптимизация SQL-индексов таблицы плавок сталеплавильного цеха',
        'Замедлилась выборка истории энергопотребления за квартал в MES-системе. Проанализировать план запроса и добавить составной индекс.',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000004',
        'normal',
        'todo',
        CURRENT_DATE + INTERVAL '3 days'
    )
ON CONFLICT (id) DO NOTHING;
