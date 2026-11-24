"use strict";
// Database layer — SQLite via built-in node:sqlite. Schema also lives in
// ../../database/schema.sql (mirrored here so the server is self-contained).
// One workspace per owner account; every domain row is scoped through its
// workspace (directly or via its collection) and reads for another
// workspace's data return 404.
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "..", "data", "vectorlab.sqlite");
let db;
function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}
function migrate(d) {
  d.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','staff')),
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
    password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT, owner_user_id INTEGER REFERENCES users(id),
    name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, team TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS workspace_settings (
    workspace_id INTEGER PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    default_method TEXT NOT NULL DEFAULT 'tfidf' CHECK (default_method IN ('tfidf','hashed')),
    default_top_k INTEGER NOT NULL DEFAULT 5,
    default_k INTEGER NOT NULL DEFAULT 3,
    hash_dimensions INTEGER NOT NULL DEFAULT 64);
  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT, collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    title TEXT NOT NULL, body TEXT NOT NULL, topic TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS search_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
    reference TEXT NOT NULL UNIQUE, query_text TEXT NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('tfidf','hashed')),
    top_k INTEGER NOT NULL DEFAULT 5, hit_count INTEGER NOT NULL DEFAULT 0,
    zero_score_count INTEGER NOT NULL DEFAULT 0,
    out_of_vocabulary TEXT NOT NULL DEFAULT '[]', hits TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS cluster_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
    reference TEXT NOT NULL UNIQUE,
    method TEXT NOT NULL CHECK (method IN ('tfidf','hashed')),
    k INTEGER NOT NULL, iterations INTEGER NOT NULL DEFAULT 0,
    inertia REAL NOT NULL DEFAULT 0, silhouette REAL NOT NULL DEFAULT 0,
    purity REAL, trace TEXT NOT NULL DEFAULT '[]', clusters TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS cluster_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL REFERENCES cluster_runs(id) ON DELETE CASCADE,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    cluster_index INTEGER NOT NULL, distance REAL NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS comparisons (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
    document_a_id INTEGER NOT NULL, document_b_id INTEGER NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('tfidf','hashed')),
    score REAL NOT NULL DEFAULT 0, shared_terms TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE INDEX IF NOT EXISTS idx_docs_collection ON documents(collection_id, id);
  CREATE INDEX IF NOT EXISTS idx_search_ws ON search_runs(workspace_id, id);
  CREATE INDEX IF NOT EXISTS idx_cluster_ws ON cluster_runs(workspace_id, id);
  CREATE INDEX IF NOT EXISTS idx_assign_run ON cluster_assignments(run_id, cluster_index);
  `);
}
module.exports = { getDb, DB_PATH };
