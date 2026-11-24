"use strict";
/* Live end-to-end tests for VectorLab. Starts the real server against a
   FRESH temporary database and exercises the product over HTTP: accounts,
   the seeded showcase workspace, and labelled expected-output cases
   (VL-01...VL-14) built on a nine-document fixture set whose scores were
   computed independently from the documented formulas (idf =
   ln((1+N)/(1+df))+1 over N=9; FNV-1a buckets mod 64; Lloyd k-means from
   the first-k documents). The fixture documents use three topics with
   disjoint vocabularies:
     dental:  "dentist tooth implant" / "dentist tooth filling" / "dentist implant crown"
     recipes: "recipe bake flour" / "recipe bake sugar" / "recipe flour cake"
     fitness: "gym workout muscle" / "gym workout cardio" / "gym muscle training"
   stored interleaved so the first three documents span the three topics.
   Run: node tests/run-tests.js — non-zero exit on failure. */
const { spawn } = require("node:child_process");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const PORT = 4737;
const BASE = "http://127.0.0.1:" + PORT;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vectorlab-test-"));
const DB = path.join(tmp, "test.sqlite");
let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log("PASS  " + name + (detail ? " - " + detail : "")); }
  else { failed++; console.log("FAIL  " + name + (detail ? " - " + detail : "")); }
}
const approx = (a, b, tol) => Math.abs(Number(a) - Number(b)) <= (tol || 0.002);
async function req(method, p, token, body) {
  const res = await fetch(BASE + p, { method, headers: { "Content-Type": "application/json",
    ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FIXTURE = [
  ["Dental visit basics", "dental", "dentist tooth implant"],
  ["Baking basics", "recipes", "recipe bake flour"],
  ["Gym basics", "fitness", "gym workout muscle"],
  ["Dental filling notes", "dental", "dentist tooth filling"],
  ["Baking with sugar", "recipes", "recipe bake sugar"],
  ["Cardio notes", "fitness", "gym workout cardio"],
  ["Implant and crown notes", "dental", "dentist implant crown"],
  ["Flour and cake notes", "recipes", "recipe flour cake"],
  ["Muscle training notes", "fitness", "gym muscle training"],
];
(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, "..", "backend", "src", "server.js")],
    { env: { ...process.env, PORT: String(PORT), DB_PATH: DB }, stdio: "pipe" });
  let up = false;
  for (let i = 0; i < 50 && !up; i++) { try { const r = await fetch(BASE + "/health"); up = r.ok; } catch { await sleep(200); } }
  if (!up) { console.log("FAIL  server did not start"); server.kill(); process.exit(1); }
  try {
    // ---- Seeded showcase workspace: exact expected values ----
    const health = await req("GET", "/health");
    check("health reports the seeded workspace, 3 collections and 31 documents",
      health.json.data.workspacesLoaded === 1 && health.json.data.collectionsLoaded === 3 && health.json.data.documentsLoaded === 31,
      "workspaces=1, collections=3, documents=" + health.json.data.documentsLoaded);
    const login = await req("POST", "/api/v1/auth/login", null, { email: "owner@manchesterbusinesshelp.co.uk", password: "Owner2026!" });
    check("seeded owner can sign in", login.status === 200, "owner@manchesterbusinesshelp.co.uk");
    const T = login.json.data.token;
    check("wrong password rejected", (await req("POST", "/api/v1/auth/login", null, { email: "owner@manchesterbusinesshelp.co.uk", password: "nope" })).status === 401, "HTTP 401");
    check("collections need sign-in", (await req("GET", "/api/v1/collections")).status === 401, "HTTP 401");
    const dash = (await req("GET", "/api/v1/dashboard", T)).json.data;
    check("seeded dashboard: 3 collections, 31 documents, 1 search, 1 cluster run, 1 comparison",
      dash.stats.collections === 3 && dash.stats.documents === 31 && dash.stats.searches === 1 &&
      dash.stats.clusterRuns === 1 && dash.stats.comparisons === 1, JSON.stringify(dash.stats));
    check("seeded cluster run over the help articles has purity 0.9375 (15 of 16 on-topic)",
      approx(dash.latestCluster.purity, 0.9375, 0.0001), "purity=" + dash.latestCluster.purity);
    const staff = await req("POST", "/api/v1/auth/login", null, { email: "team@manchesterbusinesshelp.co.uk", password: "Team2026!" });
    const ST = staff.json.data.token;
    check("staff cannot update the workspace profile (owner only)",
      (await req("PUT", "/api/v1/workspace", ST, { name: "Nope" })).status === 403, "HTTP 403");
    const seededCols = (await req("GET", "/api/v1/collections", T)).json.data.collections;
    const seededDocId = (await req("GET", "/api/v1/documents?collectionId=" + seededCols[0].id, T)).json.data.documents[0].id;
    check("staff cannot delete a document (owner only)",
      (await req("DELETE", "/api/v1/documents/" + seededDocId, ST)).status === 403, "HTTP 403");

    // ---- Fresh fixture workspace ----
    const reg = await req("POST", "/api/v1/auth/register", null,
      { fullName: "Fixture Owner", email: "fixture@vectorlab.test", password: "Owner2026!", workspaceName: "Fixture Lab" });
    check("register creates an owner with an empty workspace", reg.status === 201 && !!reg.json.data.token, "HTTP 201");
    const FT = reg.json.data.token;
    check("duplicate email rejected", (await req("POST", "/api/v1/auth/register", null,
      { fullName: "Copy", email: "fixture@vectorlab.test", password: "Owner2026!", workspaceName: "Copy Lab" })).status === 409, "HTTP 409");
    check("another workspace cannot read the seeded workspace's collection",
      (await req("GET", "/api/v1/collections/" + seededCols[0].id, FT)).status === 404, "HTTP 404");
    const colRes = await req("POST", "/api/v1/collections", FT, { name: "Fixture Set", description: "Nine-document hand-verifiable set" });
    const col = colRes.json.data.collection;
    check("collection created with 201", colRes.status === 201 && col.documentCount === 0, col.name);
    const ids = [];
    for (const [title, topic, body] of FIXTURE) {
      const r = await req("POST", "/api/v1/documents", FT, { collectionId: col.id, title, topic, body });
      ids.push(r.json.data.document.id);
    }
    const [D1, R1, F1, D2, R2, F2, D3] = ids;
    check("nine fixture documents stored in interleaved topic order", ids.length === 9, "ids " + ids.join(","));
    check("document without a body is a 400",
      (await req("POST", "/api/v1/documents", FT, { collectionId: col.id, title: "No body" })).status === 400, "HTTP 400");

    // ---- VL-01: the idf table (N=9) ----
    const vocab = (await req("GET", "/api/v1/vocabulary?collectionId=" + col.id + "&method=tfidf", FT)).json.data;
    const term = Object.fromEntries(vocab.terms.map((t) => [t.term, t]));
    check("VL-01 idf values: dentist (df 3) = ln(10/4)+1 = 1.916291, tooth (df 2) = 2.203973, crown (df 1) = 2.609438; 15 terms",
      vocab.dimensions === 15 && approx(term.dentist.idf, 1.916291, 0.001) && term.dentist.docs === 3 &&
      approx(term.tooth.idf, 2.203973, 0.001) && approx(term.crown.idf, 2.609438, 0.001),
      "dentist=" + term.dentist.idf.toFixed(6) + ", crown=" + term.crown.idf.toFixed(6));

    // ---- VL-02/VL-03: TF-IDF search with provable ranking ----
    const s1 = (await req("POST", "/api/v1/search", FT, { collectionId: col.id, query: "dentist implant", method: "tfidf", topK: 5 })).json.data.search;
    check("VL-02 TF-IDF search 'dentist implant': top hit is the implant document at 0.798218, then 0.745710, then 0.321041; 3 hits, 6 zero scores",
      s1.hitCount === 3 && s1.zeroScoreCount === 6 && s1.hits[0].docId === D1 && approx(s1.hits[0].score, 0.798218) &&
      approx(s1.hits[1].score, 0.745710) && approx(s1.hits[2].score, 0.321041),
      "scores=" + s1.hits.map((h) => h.score.toFixed(6)).join(","));
    const parts = Object.fromEntries(s1.hits[0].explanation.map((p) => [p.term, p.contribution]));
    const sum = s1.hits[0].explanation.reduce((a, p) => a + p.contribution, 0);
    check("VL-03 explanation reconciles: implant contributes 0.454571, dentist 0.343647, and the parts sum to the score",
      approx(parts.implant, 0.454571) && approx(parts.dentist, 0.343647) && approx(sum, s1.hits[0].score, 0.000001),
      "implant=" + parts.implant.toFixed(6) + ", dentist=" + parts.dentist.toFixed(6));

    // ---- VL-09/VL-14: out-of-vocabulary handling ----
    const s2 = (await req("POST", "/api/v1/search", FT, { collectionId: col.id, query: "dentist zebra", method: "tfidf", topK: 5 })).json.data.search;
    check("VL-09 'zebra' is reported out-of-vocabulary and the dentist-only query tops at the document's dentist weight 0.523742",
      JSON.stringify(s2.outOfVocabulary) === JSON.stringify(["zebra"]) && s2.hits[0].docId === D1 && approx(s2.hits[0].score, 0.523742),
      "oov=" + s2.outOfVocabulary.join(",") + ", top=" + s2.hits[0].score.toFixed(6));
    const s3 = (await req("POST", "/api/v1/search", FT, { collectionId: col.id, query: "zebra", method: "tfidf", topK: 5 })).json.data.search;
    check("VL-14 an all-unknown query scores nothing: 0 hits, 9 zero scores",
      s3.hitCount === 0 && s3.zeroScoreCount === 9, "hits=0");

    // ---- VL-05: identical text scores 1.0 ----
    const s4 = (await req("POST", "/api/v1/search", FT, { collectionId: col.id, query: "dentist tooth filling", method: "tfidf", topK: 3 })).json.data.search;
    check("VL-05 a query identical to a document's text scores that document exactly 1.0",
      s4.hits[0].docId === D2 && approx(s4.hits[0].score, 1.0, 0.000001), "score=" + s4.hits[0].score);
    const selfCmp = (await req("POST", "/api/v1/compare", FT, { documentAId: D1, documentBId: D1, method: "hashed" })).json.data.comparison;
    check("VL-05b a document compared with itself scores exactly 1.0 under the hashed vectoriser too",
      approx(selfCmp.score, 1.0, 0.000001), "score=" + selfCmp.score);

    // ---- VL-04/VL-06: pairwise comparisons ----
    const orthT = (await req("POST", "/api/v1/compare", FT, { documentAId: D1, documentBId: R1, method: "tfidf" })).json.data.comparison;
    const orthH = (await req("POST", "/api/v1/compare", FT, { documentAId: D1, documentBId: R1, method: "hashed" })).json.data.comparison;
    check("VL-04 the orthogonal pair (dental vs recipes, no shared tokens or hash buckets) scores cosine 0 under both vectorisers",
      orthT.score === 0 && orthH.score === 0, "tfidf=0, hashed=0");
    const cmpT = (await req("POST", "/api/v1/compare", FT, { documentAId: D1, documentBId: D2, method: "tfidf" })).json.data.comparison;
    const cmpH = (await req("POST", "/api/v1/compare", FT, { documentAId: D1, documentBId: D2, method: "hashed" })).json.data.comparison;
    check("VL-06 same-topic pair: TF-IDF cosine 0.595239 with shared terms dentist+tooth; hashed cosine 0.666667 (2 of 3 buckets shared)",
      approx(cmpT.score, 0.595239) && JSON.stringify(cmpT.sharedTerms) === JSON.stringify(["dentist", "tooth"]) &&
      approx(cmpH.score, 0.666667), "tfidf=" + cmpT.score.toFixed(6) + ", hashed=" + cmpH.score.toFixed(6));

    // ---- VL-07/VL-08: hashed search and buckets ----
    const sh = (await req("POST", "/api/v1/search", FT, { collectionId: col.id, query: "dentist implant", method: "hashed", topK: 5 })).json.data.search;
    const f1Hit = sh.hits.find((h) => h.docId === F1);
    check("VL-07 hashed search ties the two implant documents at 0.816497 (2/sqrt(6)) and a fitness document scores 0.408248 purely from the bucket-36 collision (workout vs dentist)",
      approx(sh.hits[0].score, 0.816497) && sh.hits[0].docId === D1 && !!f1Hit && approx(f1Hit.score, 0.408248) &&
      f1Hit.explanation.some((p) => p.bucket === 36 && p.docTerms.includes("workout")),
      "top=" + sh.hits[0].score.toFixed(6) + ", fitness hit=" + (f1Hit ? f1Hit.score.toFixed(6) : "none"));
    const detail = (await req("GET", "/api/v1/documents/" + D1, FT)).json.data;
    const hb = detail.vectors.hashed.terms;
    check("VL-08 the hashed vector of 'dentist tooth implant' has exactly 3 non-zero buckets {36, 48, 53}, each weighted 1/sqrt(3) = 0.577350",
      hb.length === 3 && JSON.stringify(hb.map((b) => b.bucket).sort((a, b) => a - b)) === JSON.stringify([36, 48, 53]) &&
      hb.every((b) => approx(b.weight, 0.577350, 0.001)), "buckets=" + hb.map((b) => b.bucket).join(","));
    const tt = Object.fromEntries(detail.vectors.tfidf.terms.map((t) => [t.term, t.weight]));
    check("VL-13 the TF-IDF vector is L2-normalised with implant = tooth = 0.602368 and dentist = 0.523742",
      approx(tt.implant, 0.602368, 0.001) && approx(tt.tooth, 0.602368, 0.001) && approx(tt.dentist, 0.523742, 0.001) &&
      approx(Math.sqrt(detail.vectors.tfidf.terms.reduce((a, t) => a + t.weight * t.weight, 0)), 1.0, 0.000001),
      "implant=" + tt.implant.toFixed(6));
    const hvocab = (await req("GET", "/api/v1/vocabulary?collectionId=" + col.id + "&method=hashed", FT)).json.data;
    const hterm = Object.fromEntries(hvocab.terms.map((t) => [t.term, t]));
    check("hashed vocabulary maps dentist to bucket 36 and gym/filling/bake all collide in bucket 0",
      hterm.dentist.bucket === 36 && hterm.gym.bucket === 0 && hterm.filling.bucket === 0 && hterm.bake.bucket === 0 && hvocab.dimensions === 64,
      "dentist bucket=" + hterm.dentist.bucket);

    // ---- VL-10/VL-11/VL-12: deterministic k-means ----
    const cl = (await req("POST", "/api/v1/clusters", FT, { collectionId: col.id, method: "tfidf", k: 3 })).json.data.clusterRun;
    const sizes = cl.clusters.map((c) => c.size).sort((a, b) => a - b);
    const nonIncreasing = cl.trace.every((t, i) => i === 0 || t.inertia <= cl.trace[i - 1].inertia + 1e-12);
    check("VL-10 TF-IDF k-means (k=3) recovers the three topics exactly: purity 1.0, sizes 3/3/3, inertia trace 4.857128 -> 3.140236 (non-increasing), silhouette 0.285154",
      approx(cl.purity, 1.0, 0.000001) && JSON.stringify(sizes) === JSON.stringify([3, 3, 3]) &&
      cl.trace.length === 2 && approx(cl.trace[0].inertia, 4.857128, 0.01) && approx(cl.inertia, 3.140236, 0.01) &&
      nonIncreasing && approx(cl.silhouette, 0.285154, 0.01),
      "inertia=" + cl.inertia.toFixed(6) + ", silhouette=" + cl.silhouette.toFixed(6));
    const dCluster = cl.clusters.find((c) => c.memberDocIds.includes(D1));
    check("VL-12 the dental cluster's majority label is 'dental' and its top TF-IDF term is 'dentist'; the three majority labels are the three topics",
      dCluster.majorityLabel === "dental" && dCluster.topTerms[0].term === "dentist" &&
      JSON.stringify(cl.clusters.map((c) => c.majorityLabel).sort()) === JSON.stringify(["dental", "fitness", "recipes"]),
      "labels=" + cl.clusters.map((c) => c.majorityLabel).join(","));
    const clh = (await req("POST", "/api/v1/clusters", FT, { collectionId: col.id, method: "hashed", k: 3 })).json.data.clusterRun;
    check("VL-11 hashed k-means also recovers the topics (purity 1.0) with final inertia 2.666667 and silhouette 0.189973",
      approx(clh.purity, 1.0, 0.000001) && approx(clh.inertia, 2.666667, 0.01) && approx(clh.silhouette, 0.189973, 0.01),
      "inertia=" + clh.inertia.toFixed(6) + ", silhouette=" + clh.silhouette.toFixed(6));
    const cl2 = (await req("POST", "/api/v1/clusters", FT, { collectionId: col.id, method: "tfidf", k: 3 })).json.data.clusterRun;
    check("clustering is deterministic: a repeat run reproduces inertia and purity exactly",
      cl2.inertia === cl.inertia && cl2.purity === cl.purity && cl2.iterations === cl.iterations,
      "inertia=" + cl2.inertia.toFixed(6));
    check("cluster detail returns all 9 assignments", cl.assignments.length === 9, "assignments=9");
    check("bad k is a 400", (await req("POST", "/api/v1/clusters", FT, { collectionId: col.id, method: "tfidf", k: 9 })).status === 400, "HTTP 400 BAD_K");
    check("unknown method is a 400", (await req("POST", "/api/v1/search", FT, { collectionId: col.id, query: "dentist", method: "embeddings" })).status === 400, "HTTP 400 BAD_METHOD");

    // ---- Cross-collection guard, history, settings, notifications ----
    const col2 = (await req("POST", "/api/v1/collections", FT, { name: "Other Set" })).json.data.collection;
    const other = (await req("POST", "/api/v1/documents", FT, { collectionId: col2.id, title: "Other", topic: "misc", body: "dentist tooth implant" })).json.data.document;
    check("comparing documents from different collections is a 400 (each collection has its own idf table)",
      (await req("POST", "/api/v1/compare", FT, { documentAId: D1, documentBId: other.id, method: "tfidf" })).status === 400, "HTTP 400 DIFFERENT_COLLECTIONS");
    const searches = (await req("GET", "/api/v1/searches", FT)).json.data.searches;
    check("search history holds the runs made in this workspace", searches.length >= 5, searches.length + " runs");
    const sDetail = (await req("GET", "/api/v1/searches/" + s1.id, FT)).json.data.search;
    check("search detail reproduces the stored top score", approx(sDetail.hits[0].score, 0.798218), "top=" + sDetail.hits[0].score.toFixed(6));
    const clusters = (await req("GET", "/api/v1/clusters", FT)).json.data.clusterRuns;
    check("cluster history holds the runs made in this workspace", clusters.length >= 3, clusters.length + " runs");
    const upd = await req("PUT", "/api/v1/workspace", FT, { settings: { defaultMethod: "hashed", defaultTopK: 7, defaultK: 3 } });
    check("owner can change the lab defaults (method hashed, topK 7) and they persist",
      upd.json.data.workspace.settings.defaultMethod === "hashed" && upd.json.data.workspace.settings.defaultTopK === 7,
      "topK=" + upd.json.data.workspace.settings.defaultTopK);
    const notifs = (await req("GET", "/api/v1/notifications", T)).json.data.notifications;
    check("seeded owner has run notifications recorded", notifs.length >= 3, notifs.length + " notifications");
    check("notifications can be marked read", (await req("PATCH", "/api/v1/notifications/read", T)).status === 200, "HTTP 200");
    const del = await req("DELETE", "/api/v1/collections/" + col2.id, FT);
    check("owner deletes a collection and its documents go with it",
      del.status === 200 && (await req("GET", "/api/v1/documents/" + other.id, FT)).status === 404, "HTTP 200 then 404");
  } catch (err) {
    failed++; console.log("FAIL  suite error - " + (err && err.message));
  } finally {
    server.kill();
    await new Promise((resolve) => {
      server.on("exit", resolve);
      setTimeout(resolve, 300);
    });
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (_) {}
  }
  console.log(passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
