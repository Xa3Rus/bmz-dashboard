const fs = require('fs');
const path = require('path');
const { test, describe } = require('node:test');
const assert = require('node:assert');

describe('Project Configuration & Schema', () => {
    test('config.json exists and contains required Supabase properties', () => {
        const configPath = path.join(__dirname, '..', 'config.json');
        assert.ok(fs.existsSync(configPath), 'config.json must exist');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        assert.ok(typeof config.supabaseUrl === 'string', 'supabaseUrl must be string');
        assert.ok(typeof config.supabaseAnonKey === 'string', 'supabaseAnonKey must be string');
    });

    test('schema.sql contains required tables and constraints', () => {
        const schemaPath = path.join(__dirname, '..', 'schema.sql');
        assert.ok(fs.existsSync(schemaPath), 'schema.sql must exist');
        const sql = fs.readFileSync(schemaPath, 'utf8');
        assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS profiles'), 'profiles table missing');
        assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS channels'), 'channels table missing');
        assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS direct_chats'), 'direct_chats table missing');
        assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS messages'), 'messages table missing');
        assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS tasks'), 'tasks table missing');
        assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS task_reports'), 'task_reports table missing');
        assert.ok(sql.includes("'chief'"), 'chief role missing');
        assert.ok(sql.includes("'lead_engineer'"), 'lead_engineer role missing');
        assert.ok(sql.includes("'developer'"), 'developer role missing');
        assert.ok(sql.includes("'todo'"), 'todo status missing');
        assert.ok(sql.includes("'in_progress'"), 'in_progress status missing');
        assert.ok(sql.includes("'review'"), 'review status missing');
        assert.ok(sql.includes("'done'"), 'done status missing');
        assert.ok(sql.includes('direct_chats_users_distinct'), 'direct_chats_users_distinct check missing');
        assert.ok(sql.includes('idx_direct_chats_pair'), 'idx_direct_chats_pair index missing');
        assert.ok(sql.includes('set_updated_at'), 'set_updated_at trigger missing');
    });
});
