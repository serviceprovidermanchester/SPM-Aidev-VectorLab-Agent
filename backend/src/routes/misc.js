"use strict";
// Workspace profile + lab settings, the vocabulary explorer, the dashboard
// roll-up and notifications.
const { getDb } = require("../db");
const { ok, fail } = require("../utils/respond");
const { requireAuth, requireOwner, myWorkspace } = require("../middleware/auth");
const engine = require("../ai/engine");
const { buildFor } = require("../seed");

function workspaceShape(db, ws) {
  const settings = db.prepare("SELECT * FROM workspace_settings WHERE workspace_id = ?").get(ws.id)
    || { default_method: "tfidf", default_top_k: 5, default_k: 3, hash_dimensions: 64 };
  return { id: ws.id, name: ws.name, slug: ws.slug, team: ws.team, location: ws.location,
    settings: { defaultMethod: settings.default_method, defaultTopK: settings.default_top_k,
      defaultK: settings.default_k, hashDimensions: settings.hash_dimensions } };
}

module.exports = [
  ["GET", "/api/v1/workspace", requireAuth, async (req, res) => {
    const ws = myWorkspace(req); if (!ws) return fail(res, 404, "NO_WORKSPACE", "No workspace is attached to this account");
    return ok(res, { workspace: workspaceShape(getDb(), ws) });
  }],
  ["PUT", "/api/v1/workspace", requireOwner, async (req, res) => {
    const ws = myWorkspace(req); if (!ws) return fail(res, 404, "NO_WORKSPACE", "No workspace is attached to this account");
    const db = getDb();
    db.prepare("UPDATE workspaces SET name = ?, team = ?, location = ? WHERE id = ?")
      .run(req.body.name || ws.name, req.body.team ?? ws.team, req.body.location ?? ws.location, ws.id);
    if (req.body.settings) {
      const s = req.body.settings;
      const method = s.defaultMethod === "hashed" ? "hashed" : "tfidf";
      db.prepare(`UPDATE workspace_settings SET default_method = ?, default_top_k = ?, default_k = ? WHERE workspace_id = ?`)
        .run(method, Math.max(1, Math.min(Number(s.defaultTopK) || 5, 50)),
          Math.max(2, Math.min(Number(s.defaultK) || 3, 8)), ws.id);
    }
    return ok(res, { workspace: workspaceShape(db, db.prepare("SELECT * FROM workspaces WHERE id = ?").get(ws.id)) });
  }],
  ["GET", "/api/v1/vocabulary", requireAuth, async (req, res) => {
    const ws = myWorkspace(req); const db = getDb();
    const c = db.prepare("SELECT * FROM collections WHERE id = ? AND workspace_id = ?")
      .get(Number(req.query.collectionId), ws ? ws.id : -1);
    if (!c) return fail(res, 404, "NOT_FOUND", "Collection not found");
    const method = req.query.method === "hashed" ? "hashed" : "tfidf";
    const { rows, index } = buildFor(db, c.id, method);
    return ok(res, { collectionId: c.id, method, documentCount: rows.length,
      dimensions: index.dims, terms: engine.vocabulary(index) });
  }],
  ["GET", "/api/v1/dashboard", requireAuth, async (req, res) => {
    const ws = myWorkspace(req); if (!ws) return fail(res, 404, "NO_WORKSPACE", "No workspace is attached to this account");
    const db = getDb();
    const latestSearch = db.prepare("SELECT * FROM search_runs WHERE workspace_id = ? ORDER BY id DESC LIMIT 1").get(ws.id);
    const latestCluster = db.prepare("SELECT * FROM cluster_runs WHERE workspace_id = ? ORDER BY id DESC LIMIT 1").get(ws.id);
    return ok(res, {
      workspace: workspaceShape(db, ws),
      stats: {
        collections: db.prepare("SELECT COUNT(*) AS n FROM collections WHERE workspace_id = ?").get(ws.id).n,
        documents: db.prepare(`SELECT COUNT(*) AS n FROM documents d JOIN collections c ON c.id = d.collection_id WHERE c.workspace_id = ?`).get(ws.id).n,
        searches: db.prepare("SELECT COUNT(*) AS n FROM search_runs WHERE workspace_id = ?").get(ws.id).n,
        clusterRuns: db.prepare("SELECT COUNT(*) AS n FROM cluster_runs WHERE workspace_id = ?").get(ws.id).n,
        comparisons: db.prepare("SELECT COUNT(*) AS n FROM comparisons WHERE workspace_id = ?").get(ws.id).n,
      },
      latestSearch: latestSearch ? { id: latestSearch.id, reference: latestSearch.reference,
        query: latestSearch.query_text, method: latestSearch.method, hitCount: latestSearch.hit_count,
        topHit: (JSON.parse(latestSearch.hits || "[]")[0] || null) } : null,
      latestCluster: latestCluster ? { id: latestCluster.id, reference: latestCluster.reference,
        method: latestCluster.method, k: latestCluster.k, inertia: latestCluster.inertia,
        silhouette: latestCluster.silhouette, purity: latestCluster.purity } : null,
      recentSearches: db.prepare("SELECT id, reference, query_text, method, hit_count, created_at FROM search_runs WHERE workspace_id = ? ORDER BY id DESC LIMIT 5").all(ws.id)
        .map((r) => ({ id: r.id, reference: r.reference, query: r.query_text, method: r.method, hitCount: r.hit_count, createdAt: r.created_at })),
      recentClusters: db.prepare("SELECT id, reference, method, k, silhouette, purity, created_at FROM cluster_runs WHERE workspace_id = ? ORDER BY id DESC LIMIT 5").all(ws.id)
        .map((r) => ({ id: r.id, reference: r.reference, method: r.method, k: r.k, silhouette: r.silhouette, purity: r.purity, createdAt: r.created_at })),
    });
  }],
  ["GET", "/api/v1/notifications", requireAuth, async (req, res) =>
    ok(res, { notifications: getDb().prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50").all(req.user.id) })],
  ["PATCH", "/api/v1/notifications/read", requireAuth, async (req, res) => {
    getDb().prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.user.id);
    return ok(res, { markedRead: true });
  }],
];
