"use strict";
// Seeds VectorLab on first start (idempotent): the showcase workspace
// (Manchester Business Help Centre), its owner and staff accounts, three
// seeded collections with their documents, one search run and one cluster
// run produced by the real engine over the seeded articles, one saved
// comparison and notifications. createWorkspace() is also used by
// registration, so a new account gets its own empty workspace with default
// lab settings. runSearch()/runCluster()/runComparison() are shared by the
// seed and the API routes, so a stored run is always the engine's own
// output over the stored documents.
const { getDb } = require("./db");
const { PRODUCT, WORKSPACE, COLLECTIONS } = require("./seed-data");
const engine = require("./ai/engine");
const { hashPassword, refCode } = require("./utils/tokens");

function slugify(s) {
  return String(s || "my-workspace").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "my-workspace";
}
function uniqueSlug(db, base) {
  let slug = base, n = 2;
  while (db.prepare("SELECT id FROM workspaces WHERE slug = ?").get(slug)) slug = base + "-" + (n++);
  return slug;
}
function createWorkspace(db, ownerUserId, fields) {
  const info = db.prepare(`INSERT INTO workspaces (owner_user_id, name, slug, team, location)
    VALUES (?, ?, ?, ?, ?)`)
    .run(ownerUserId, fields.name, uniqueSlug(db, slugify(fields.slug || fields.name)),
      fields.team || "", fields.location || "");
  const workspaceId = info.lastInsertRowid;
  db.prepare("UPDATE users SET workspace_id = ? WHERE id = ?").run(workspaceId, ownerUserId);
  db.prepare("INSERT INTO workspace_settings (workspace_id) VALUES (?)").run(workspaceId);
  return db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId);
}
function insertDocument(db, collectionId, doc) {
  const info = db.prepare(`INSERT INTO documents (collection_id, title, body, topic, source)
    VALUES (?, ?, ?, ?, ?)`)
    .run(collectionId, doc.title, doc.body, doc.topic || "", doc.source || "Seeded collection");
  return info.lastInsertRowid;
}
function collectionDocs(db, collectionId) {
  return db.prepare("SELECT * FROM documents WHERE collection_id = ? ORDER BY id").all(collectionId);
}
function buildFor(db, collectionId, method) {
  const rows = collectionDocs(db, collectionId);
  const index = engine.buildIndex(rows.map((r) => ({ id: r.id, text: r.body })), method);
  return { rows, index };
}
function runSearch(db, workspaceId, collection, opts, createdBy) {
  const { rows, index } = buildFor(db, collection.id, opts.method);
  const result = engine.search(index, opts.query, opts.topK);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const hits = result.hits.map((h) => ({ docId: h.docId,
    title: byId.get(h.docId) ? byId.get(h.docId).title : "",
    topic: byId.get(h.docId) ? byId.get(h.docId).topic : "",
    score: h.score, explanation: h.explanation }));
  const reference = refCode("SRC");
  const info = db.prepare(`INSERT INTO search_runs (workspace_id, collection_id, reference,
      query_text, method, top_k, hit_count, zero_score_count, out_of_vocabulary, hits, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(workspaceId, collection.id, reference, opts.query, opts.method, opts.topK,
      hits.length, result.zeroScoreCount, JSON.stringify(result.outOfVocabulary),
      JSON.stringify(hits), createdBy || "");
  return db.prepare("SELECT * FROM search_runs WHERE id = ?").get(info.lastInsertRowid);
}
function runCluster(db, workspaceId, collection, opts, createdBy) {
  const { rows, index } = buildFor(db, collection.id, opts.method);
  const labels = rows.map((r) => r.topic || null);
  const result = engine.kmeans(index, opts.k, labels);
  const reference = refCode("CLU");
  const info = db.prepare(`INSERT INTO cluster_runs (workspace_id, collection_id, reference,
      method, k, iterations, inertia, silhouette, purity, trace, clusters, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(workspaceId, collection.id, reference, opts.method, result.k, result.iterations,
      result.inertia, result.silhouette, result.purity, JSON.stringify(result.trace),
      JSON.stringify(result.clusters), createdBy || "");
  const runId = info.lastInsertRowid;
  const ins = db.prepare(`INSERT INTO cluster_assignments (run_id, document_id, cluster_index, distance)
    VALUES (?, ?, ?, ?)`);
  for (const a of result.assignments) ins.run(runId, a.docId, a.cluster, a.distance);
  return db.prepare("SELECT * FROM cluster_runs WHERE id = ?").get(runId);
}
function runComparison(db, workspaceId, collection, docA, docB, method, createdBy) {
  const { rows, index } = buildFor(db, collection.id, method);
  const idxA = rows.findIndex((r) => r.id === docA.id);
  const idxB = rows.findIndex((r) => r.id === docB.id);
  const result = engine.comparePair(index, idxA, idxB);
  const info = db.prepare(`INSERT INTO comparisons (workspace_id, collection_id,
      document_a_id, document_b_id, method, score, shared_terms, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(workspaceId, collection.id, docA.id, docB.id, method, result.score,
      JSON.stringify(result.sharedTerms), createdBy || "");
  const row = db.prepare("SELECT * FROM comparisons WHERE id = ?").get(info.lastInsertRowid);
  return { row, result };
}
function seed() {
  const db = getDb();
  if (db.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0) return;
  const owner = db.prepare("INSERT INTO users (full_name, email, role, password_hash) VALUES (?, ?, 'owner', ?)")
    .run(PRODUCT.ownerName, PRODUCT.ownerEmail, hashPassword(PRODUCT.ownerPassword));
  const ownerId = owner.lastInsertRowid;
  const ws = createWorkspace(db, ownerId, WORKSPACE);
  const wid = ws.id;
  db.prepare("INSERT INTO users (full_name, email, role, workspace_id, password_hash) VALUES (?, ?, 'staff', ?, ?)")
    .run(PRODUCT.staffName, PRODUCT.staffEmail, wid, hashPassword(PRODUCT.staffPassword));
  const created = [];
  for (const c of COLLECTIONS) {
    const info = db.prepare("INSERT INTO collections (workspace_id, name, description) VALUES (?, ?, ?)")
      .run(wid, c.name, c.description);
    const cid = info.lastInsertRowid;
    for (const d of c.docs) insertDocument(db, cid, d);
    created.push(db.prepare("SELECT * FROM collections WHERE id = ?").get(cid));
  }
  const main = created[0];
  const search = runSearch(db, wid, main,
    { query: "dental check-up appointment", method: "tfidf", topK: 5 }, PRODUCT.ownerName);
  const cluster = runCluster(db, wid, main, { method: "tfidf", k: 4 }, PRODUCT.ownerName);
  const docs = collectionDocs(db, main.id);
  runComparison(db, wid, main, docs[0], docs[4], "tfidf", PRODUCT.ownerName);
  db.prepare("INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'search', ?, ?)")
    .run(ownerId, "Search " + search.reference + " complete",
      "Query \u201Cdental check-up appointment\u201D returned " + search.hit_count +
      " scored matches in " + main.name + ".");
  db.prepare("INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'cluster', ?, ?)")
    .run(ownerId, "Cluster run " + cluster.reference + " complete",
      main.name + " grouped into " + cluster.k + " clusters with silhouette " +
      Number(cluster.silhouette).toFixed(3) + " and purity " +
      (cluster.purity === null ? "n/a" : Number(cluster.purity).toFixed(2)) + ".");
  db.prepare("INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'system', ?, ?)")
    .run(ownerId, "Welcome to VectorLab", "Three seeded collections are ready: search them, compare documents and run clustering.");
}
module.exports = { seed, createWorkspace, slugify, insertDocument, collectionDocs,
  buildFor, runSearch, runCluster, runComparison };
