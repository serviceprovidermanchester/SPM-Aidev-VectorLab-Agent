"use strict";
// Lab routes: collections, documents, vector search, pairwise comparison
// and clustering. Every read is scoped to the signed-in workspace through
// its collections; another workspace's data returns 404.
const { getDb } = require("../db");
const { ok, fail } = require("../utils/respond");
const { requireAuth, requireOwner, myWorkspace } = require("../middleware/auth");
const { requireFields } = require("../middleware/validate");
const engine = require("../ai/engine");
const { collectionDocs, buildFor, runSearch, runCluster, runComparison } = require("../seed");

const METHODS = ["tfidf", "hashed"];
function checkMethod(m) {
  if (!METHODS.includes(m)) { const e = new Error("method must be tfidf or hashed"); e.status = 400; e.code = "BAD_METHOD"; throw e; }
  return m;
}
function myCollection(db, ws, id) {
  if (!ws) return null;
  return db.prepare("SELECT * FROM collections WHERE id = ? AND workspace_id = ?").get(Number(id), ws.id) || null;
}
const collectionShape = (db) => (c) => ({ id: c.id, name: c.name, description: c.description,
  documentCount: db.prepare("SELECT COUNT(*) AS n FROM documents WHERE collection_id = ?").get(c.id).n,
  topics: db.prepare("SELECT DISTINCT topic FROM documents WHERE collection_id = ? AND topic != '' ORDER BY topic").all(c.id).map((r) => r.topic),
  createdAt: c.created_at, updatedAt: c.updated_at });
const docShape = (d) => ({ id: d.id, collectionId: d.collection_id, title: d.title, body: d.body,
  topic: d.topic, source: d.source, tokenCount: engine.tokenize(d.body).length,
  createdAt: d.created_at, updatedAt: d.updated_at });
function searchShape(r) {
  return { id: r.id, reference: r.reference, collectionId: r.collection_id,
    query: r.query_text, method: r.method, topK: r.top_k, hitCount: r.hit_count,
    zeroScoreCount: r.zero_score_count,
    outOfVocabulary: JSON.parse(r.out_of_vocabulary || "[]"),
    hits: JSON.parse(r.hits || "[]"), createdBy: r.created_by, createdAt: r.created_at };
}
function clusterShape(db, r, withAssignments) {
  const shape = { id: r.id, reference: r.reference, collectionId: r.collection_id,
    method: r.method, k: r.k, iterations: r.iterations, inertia: r.inertia,
    silhouette: r.silhouette, purity: r.purity,
    trace: JSON.parse(r.trace || "[]"), clusters: JSON.parse(r.clusters || "[]"),
    createdBy: r.created_by, createdAt: r.created_at };
  if (withAssignments) {
    const docs = new Map(db.prepare("SELECT id, title, topic FROM documents").all().map((d) => [d.id, d]));
    shape.assignments = db.prepare("SELECT * FROM cluster_assignments WHERE run_id = ? ORDER BY cluster_index, document_id").all(r.id)
      .map((a) => ({ documentId: a.document_id, cluster: a.cluster_index, distance: a.distance,
        title: docs.get(a.document_id) ? docs.get(a.document_id).title : "",
        topic: docs.get(a.document_id) ? docs.get(a.document_id).topic : "" }));
  }
  return shape;
}
const comparisonShape = (db) => (c) => {
  const title = (id) => { const d = db.prepare("SELECT title FROM documents WHERE id = ?").get(id); return d ? d.title : ""; };
  return { id: c.id, collectionId: c.collection_id, documentAId: c.document_a_id,
    documentBId: c.document_b_id, documentATitle: title(c.document_a_id),
    documentBTitle: title(c.document_b_id), method: c.method, score: c.score,
    sharedTerms: JSON.parse(c.shared_terms || "[]"), createdBy: c.created_by, createdAt: c.created_at };
};

module.exports = [
  // ---- Collections ----
  ["GET", "/api/v1/collections", requireAuth, async (req, res) => {
    const ws = myWorkspace(req); if (!ws) return fail(res, 404, "NO_WORKSPACE", "No workspace is attached to this account");
    const db = getDb();
    return ok(res, { collections: db.prepare("SELECT * FROM collections WHERE workspace_id = ? ORDER BY id").all(ws.id).map(collectionShape(db)) });
  }],
  ["POST", "/api/v1/collections", requireAuth, async (req, res) => {
    requireFields(req.body, ["name"]);
    const ws = myWorkspace(req); if (!ws) return fail(res, 404, "NO_WORKSPACE", "No workspace is attached to this account");
    const db = getDb();
    const info = db.prepare("INSERT INTO collections (workspace_id, name, description) VALUES (?, ?, ?)")
      .run(ws.id, req.body.name, req.body.description || "");
    return ok(res, { collection: collectionShape(db)(db.prepare("SELECT * FROM collections WHERE id = ?").get(info.lastInsertRowid)) }, 201);
  }],
  ["GET", "/api/v1/collections/:id", requireAuth, async (req, res, params) => {
    const ws = myWorkspace(req); const db = getDb();
    const c = myCollection(db, ws, params.id);
    if (!c) return fail(res, 404, "NOT_FOUND", "Collection not found");
    return ok(res, { collection: collectionShape(db)(c),
      documents: collectionDocs(db, c.id).map(docShape) });
  }],
  ["DELETE", "/api/v1/collections/:id", requireOwner, async (req, res, params) => {
    const ws = myWorkspace(req); const db = getDb();
    const c = myCollection(db, ws, params.id);
    if (!c) return fail(res, 404, "NOT_FOUND", "Collection not found");
    db.prepare("DELETE FROM collections WHERE id = ?").run(c.id);
    return ok(res, { deleted: true });
  }],
  // ---- Documents ----
  ["GET", "/api/v1/documents", requireAuth, async (req, res) => {
    const ws = myWorkspace(req); const db = getDb();
    const c = myCollection(db, ws, req.query.collectionId);
    if (!c) return fail(res, 404, "NOT_FOUND", "Collection not found");
    let rows = collectionDocs(db, c.id);
    if (req.query.q) { const q = String(req.query.q).toLowerCase();
      rows = rows.filter((r) => (r.title + " " + r.body + " " + r.topic).toLowerCase().includes(q)); }
    return ok(res, { documents: rows.map(docShape) });
  }],
  ["POST", "/api/v1/documents", requireAuth, async (req, res) => {
    requireFields(req.body, ["collectionId", "title", "body"]);
    const ws = myWorkspace(req); const db = getDb();
    const c = myCollection(db, ws, req.body.collectionId);
    if (!c) return fail(res, 404, "NOT_FOUND", "Collection not found");
    const info = db.prepare("INSERT INTO documents (collection_id, title, body, topic, source) VALUES (?, ?, ?, ?, ?)")
      .run(c.id, req.body.title, req.body.body, req.body.topic || "", req.body.source || "Added in the lab");
    return ok(res, { document: docShape(db.prepare("SELECT * FROM documents WHERE id = ?").get(info.lastInsertRowid)) }, 201);
  }],
  ["GET", "/api/v1/documents/:id", requireAuth, async (req, res, params) => {
    const ws = myWorkspace(req); const db = getDb();
    const d = db.prepare(`SELECT d.* FROM documents d JOIN collections c ON c.id = d.collection_id
      WHERE d.id = ? AND c.workspace_id = ?`).get(Number(params.id), ws ? ws.id : -1);
    if (!d) return fail(res, 404, "NOT_FOUND", "Document not found");
    const out = { document: docShape(d), vectors: {} };
    for (const method of METHODS) {
      const { index } = buildFor(db, d.collection_id, method);
      const idx = index.docs.findIndex((x) => x.id === d.id);
      out.vectors[method] = { dimensions: index.dims, terms: engine.documentTerms(index, idx) };
    }
    return ok(res, out);
  }],
  ["DELETE", "/api/v1/documents/:id", requireOwner, async (req, res, params) => {
    const ws = myWorkspace(req); const db = getDb();
    const d = db.prepare(`SELECT d.* FROM documents d JOIN collections c ON c.id = d.collection_id
      WHERE d.id = ? AND c.workspace_id = ?`).get(Number(params.id), ws ? ws.id : -1);
    if (!d) return fail(res, 404, "NOT_FOUND", "Document not found");
    db.prepare("DELETE FROM documents WHERE id = ?").run(d.id);
    return ok(res, { deleted: true });
  }],
  // ---- Search ----
  ["POST", "/api/v1/search", requireAuth, async (req, res) => {
    requireFields(req.body, ["collectionId", "query"]);
    const ws = myWorkspace(req); const db = getDb();
    const c = myCollection(db, ws, req.body.collectionId);
    if (!c) return fail(res, 404, "NOT_FOUND", "Collection not found");
    if (collectionDocs(db, c.id).length === 0) return fail(res, 400, "EMPTY_COLLECTION", "Add documents to the collection before searching it");
    const method = checkMethod(req.body.method || "tfidf");
    const settings = db.prepare("SELECT * FROM workspace_settings WHERE workspace_id = ?").get(ws.id);
    const topK = Math.max(1, Math.min(Number(req.body.topK) || (settings && settings.default_top_k) || 5, 50));
    const run = runSearch(db, ws.id, c, { query: String(req.body.query), method, topK }, req.user.full_name);
    return ok(res, { search: searchShape(run) }, 201);
  }],
  ["GET", "/api/v1/searches", requireAuth, async (req, res) => {
    const ws = myWorkspace(req); if (!ws) return fail(res, 404, "NO_WORKSPACE", "No workspace is attached to this account");
    const db = getDb();
    return ok(res, { searches: db.prepare("SELECT * FROM search_runs WHERE workspace_id = ? ORDER BY id DESC LIMIT 50").all(ws.id).map(searchShape) });
  }],
  ["GET", "/api/v1/searches/:id", requireAuth, async (req, res, params) => {
    const ws = myWorkspace(req); const db = getDb();
    const r = db.prepare("SELECT * FROM search_runs WHERE id = ? AND workspace_id = ?").get(Number(params.id), ws ? ws.id : -1);
    if (!r) return fail(res, 404, "NOT_FOUND", "Search run not found");
    return ok(res, { search: searchShape(r) });
  }],
  // ---- Pairwise comparison (Vector Inspector) ----
  ["POST", "/api/v1/compare", requireAuth, async (req, res) => {
    requireFields(req.body, ["documentAId", "documentBId"]);
    const ws = myWorkspace(req); const db = getDb();
    const find = (id) => db.prepare(`SELECT d.* FROM documents d JOIN collections c ON c.id = d.collection_id
      WHERE d.id = ? AND c.workspace_id = ?`).get(Number(id), ws ? ws.id : -1);
    const a = find(req.body.documentAId), b = find(req.body.documentBId);
    if (!a || !b) return fail(res, 404, "NOT_FOUND", "Document not found");
    if (a.collection_id !== b.collection_id)
      return fail(res, 400, "DIFFERENT_COLLECTIONS", "Vectors are only comparable inside one collection: each collection has its own vocabulary and idf table");
    const method = checkMethod(req.body.method || "tfidf");
    const collection = db.prepare("SELECT * FROM collections WHERE id = ?").get(a.collection_id);
    const { row, result } = runComparison(db, ws.id, collection, a, b, method, req.user.full_name);
    return ok(res, { comparison: { ...comparisonShape(db)(row), explanation: result.explanation } }, 201);
  }],
  ["GET", "/api/v1/compare", requireAuth, async (req, res) => {
    const ws = myWorkspace(req); if (!ws) return fail(res, 404, "NO_WORKSPACE", "No workspace is attached to this account");
    const db = getDb();
    return ok(res, { comparisons: db.prepare("SELECT * FROM comparisons WHERE workspace_id = ? ORDER BY id DESC LIMIT 50").all(ws.id).map(comparisonShape(db)) });
  }],
  // ---- Clustering ----
  ["POST", "/api/v1/clusters", requireAuth, async (req, res) => {
    requireFields(req.body, ["collectionId"]);
    const ws = myWorkspace(req); const db = getDb();
    const c = myCollection(db, ws, req.body.collectionId);
    if (!c) return fail(res, 404, "NOT_FOUND", "Collection not found");
    const n = collectionDocs(db, c.id).length;
    if (n < 2) return fail(res, 400, "TOO_FEW_DOCUMENTS", "Clustering needs at least two documents");
    const method = checkMethod(req.body.method || "tfidf");
    const settings = db.prepare("SELECT * FROM workspace_settings WHERE workspace_id = ?").get(ws.id);
    const k = Math.floor(Number(req.body.k) || (settings && settings.default_k) || 3);
    if (k < 2 || k > 8 || k > n) return fail(res, 400, "BAD_K", "k must be between 2 and 8 and no larger than the document count");
    const run = runCluster(db, ws.id, c, { method, k }, req.user.full_name);
    return ok(res, { clusterRun: clusterShape(db, run, true) }, 201);
  }],
  ["GET", "/api/v1/clusters", requireAuth, async (req, res) => {
    const ws = myWorkspace(req); if (!ws) return fail(res, 404, "NO_WORKSPACE", "No workspace is attached to this account");
    const db = getDb();
    return ok(res, { clusterRuns: db.prepare("SELECT * FROM cluster_runs WHERE workspace_id = ? ORDER BY id DESC LIMIT 50").all(ws.id)
      .map((r) => clusterShape(db, r, false)) });
  }],
  ["GET", "/api/v1/clusters/:id", requireAuth, async (req, res, params) => {
    const ws = myWorkspace(req); const db = getDb();
    const r = db.prepare("SELECT * FROM cluster_runs WHERE id = ? AND workspace_id = ?").get(Number(params.id), ws ? ws.id : -1);
    if (!r) return fail(res, 404, "NOT_FOUND", "Cluster run not found");
    return ok(res, { clusterRun: clusterShape(db, r, true) });
  }],
];
