"use strict";
/* VectorLab console — single-page lab console wired to the VectorLab API.
   Views: dashboard, collections, collection detail, document detail,
   search lab, search results, clustering lab, cluster detail, vector
   inspector, methods & help. */
const app = document.getElementById("app");
let token = localStorage.getItem("vl_token") || "";
let me = null, myWs = null;
async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json",
    ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json.error && json.error.message) || ("HTTP " + res.status));
  return json.data;
}
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
const fmt = (n, d) => Number(n).toFixed(d === undefined ? 4 : d);
async function loadSession() {
  if (!token) return false;
  try {
    me = (await api("GET", "/api/v1/auth/me")).user;
    myWs = (await api("GET", "/api/v1/workspace")).workspace;
    document.getElementById("who").textContent = me.fullName + " · " + myWs.name;
    return true;
  } catch { token = ""; localStorage.removeItem("vl_token"); return false; }
}
document.getElementById("signout").addEventListener("click", async (e) => {
  e.preventDefault();
  try { await api("POST", "/api/v1/auth/logout"); } catch {}
  token = ""; localStorage.removeItem("vl_token"); location.hash = "#/dashboard"; route();
});
function signinView() {
  document.getElementById("mainnav").style.display = "none";
  app.innerHTML = `<h1>Sign in to VectorLab</h1>
  <div class="row"><div class="col card"><h3>Sign in</h3>
    <label>Email <input id="li-email" type="email"></label>
    <label>Password <input id="li-pass" type="password"></label>
    <p><button class="btn" onclick="doLogin()">Sign in</button></p>
    <p class="small muted">Showcase workspace owner: owner@manchesterbusinesshelp.co.uk</p></div>
  <div class="col card"><h3>Open a new lab workspace</h3>
    <label>Your name <input id="rg-name"></label>
    <label>Email <input id="rg-email" type="email"></label>
    <label>Password <input id="rg-pass" type="password"></label>
    <label>Workspace name <input id="rg-ws"></label>
    <p><button class="btn accent" onclick="doRegister()">Create account &amp; workspace</button></p>
    <p class="small muted">A new workspace starts empty — add a collection and documents, then search and cluster them.</p></div></div>`;
}
async function doLogin() {
  try {
    const d = await api("POST", "/api/v1/auth/login", { email: document.getElementById("li-email").value, password: document.getElementById("li-pass").value });
    token = d.token; localStorage.setItem("vl_token", token); await loadSession();
    document.getElementById("mainnav").style.display = ""; route();
  } catch (e) { alert(e.message); }
}
async function doRegister() {
  try {
    const d = await api("POST", "/api/v1/auth/register", { fullName: document.getElementById("rg-name").value,
      email: document.getElementById("rg-email").value, password: document.getElementById("rg-pass").value,
      workspaceName: document.getElementById("rg-ws").value });
    token = d.token; localStorage.setItem("vl_token", token); await loadSession();
    document.getElementById("mainnav").style.display = ""; route();
  } catch (e) { alert(e.message); }
}
function methodPill(m) { return `<span class="pill ${esc(m)}">${esc(m)}</span>`; }
async function collectionOptions(selId, chosen) {
  const cols = (await api("GET", "/api/v1/collections")).collections;
  return cols.map((c) => `<option value="${c.id}" ${String(c.id) === String(chosen) ? "selected" : ""}>${esc(c.name)} (${c.documentCount} docs)</option>`).join("");
}
const VIEWS = {
  async dashboard() {
    const d = await api("GET", "/api/v1/dashboard");
    const ls = d.latestSearch, lc = d.latestCluster;
    app.innerHTML = `<section class="hero"><h1>${esc(d.workspace.name)}</h1>
      <p>${esc(d.workspace.team)} · ${esc(d.workspace.location)} — how similar is similar, measured exactly.</p>
      ${lc ? `<div class="score">${fmt(lc.purity, 2)}</div>
      <p>Latest cluster purity · run <code>${esc(lc.reference)}</code> · k=${lc.k} · silhouette ${fmt(lc.silhouette, 3)} · inertia ${fmt(lc.inertia, 2)}</p>` : `<p>No cluster run yet — open the Clustering Lab.</p>`}</section>
      <div class="grid">
        <div class="card"><div class="stat">${d.stats.collections}</div><div class="muted">Collections</div></div>
        <div class="card"><div class="stat">${d.stats.documents}</div><div class="muted">Documents</div></div>
        <div class="card"><div class="stat">${d.stats.searches}</div><div class="muted">Search runs</div></div>
        <div class="card"><div class="stat">${d.stats.clusterRuns}</div><div class="muted">Cluster runs</div></div>
        <div class="card"><div class="stat">${d.stats.comparisons}</div><div class="muted">Comparisons</div></div>
      </div>
      ${ls ? `<h2>Latest search</h2><div class="card">${methodPill(ls.method)} <strong>${esc(ls.query)}</strong> — ${ls.hitCount} scored matches.
        Top hit: ${ls.topHit ? `<a href="#/search/${ls.id}">${esc(ls.topHit.title)}</a> at <span class="mono">${fmt(ls.topHit.score)}</span>` : "none"} · <a href="#/search/${ls.id}">Full results →</a></div>` : ""}
      <h2>Recent activity</h2>
      <table><tr><th>Run</th><th>Type</th><th>Detail</th><th>When</th></tr>
      ${d.recentSearches.map((r) => `<tr><td class="mono">${esc(r.reference)}</td><td>search</td><td><a href="#/search/${r.id}">${esc(r.query)}</a> · ${r.hitCount} hits</td><td>${esc(r.createdAt)}</td></tr>`).join("")}
      ${d.recentClusters.map((r) => `<tr><td class="mono">${esc(r.reference)}</td><td>cluster</td><td><a href="#/cluster/${r.id}">k=${r.k}</a> · silhouette ${fmt(r.silhouette, 3)} · purity ${r.purity === null ? "n/a" : fmt(r.purity, 2)}</td><td>${esc(r.createdAt)}</td></tr>`).join("")}</table>`;
  },
  async collections() {
    const cols = (await api("GET", "/api/v1/collections")).collections;
    app.innerHTML = `<h1>Collections</h1>
    <div class="card"><h3>New collection</h3>
      <label>Name <input id="nc-name"></label>
      <label>Description <input id="nc-desc"></label>
      <p><button class="btn accent" onclick="createCollection()">Create collection</button></p></div>
    ${cols.map((c) => `<div class="card"><h3><a href="#/collection/${c.id}">${esc(c.name)}</a></h3>
      <p class="muted">${esc(c.description)}</p>
      <p><span class="pill">${c.documentCount} documents</span> ${c.topics.map((t) => `<span class="pill">${esc(t)}</span>`).join(" ")}</p></div>`).join("")}`;
  },
  async collection(id) {
    const d = await api("GET", "/api/v1/collections/" + id);
    const c = d.collection;
    app.innerHTML = `<h1>${esc(c.name)}</h1><p class="muted">${esc(c.description)}</p>
    <div class="card"><h3>Add a document</h3>
      <label>Title <input id="nd-title"></label>
      <label>Topic label <input id="nd-topic" placeholder="e.g. dental"></label>
      <label>Body (this text is what gets vectorised) <textarea id="nd-body" rows="3"></textarea></label>
      <p><button class="btn accent" onclick="addDocument(${c.id})">Add document</button></p></div>
    <table><tr><th>Document</th><th>Topic</th><th class="num">Tokens</th><th></th></tr>
    ${d.documents.map((doc) => `<tr><td><a href="#/document/${doc.id}">${esc(doc.title)}</a></td><td>${esc(doc.topic)}</td>
      <td class="num">${doc.tokenCount}</td><td><a href="#/document/${doc.id}">Vector →</a></td></tr>`).join("")}</table>`;
  },
  async document(id) {
    const d = await api("GET", "/api/v1/documents/" + id);
    const doc = d.document, tv = d.vectors.tfidf, hv = d.vectors.hashed;
    app.innerHTML = `<h1>${esc(doc.title)}</h1>
    <p class="muted"><a href="#/collection/${doc.collectionId}">← Back to collection</a> · topic: ${esc(doc.topic)} · ${doc.tokenCount} tokens</p>
    <div class="card"><h3>Document text (the vectorised body)</h3><p>${esc(doc.body)}</p></div>
    <div class="row"><div class="col card"><h3>TF-IDF vector — ${tv.dimensions} dimensions</h3>
      <table><tr><th>Term</th><th class="num">idf</th><th class="num">Weight</th><th>Share</th></tr>
      ${tv.terms.slice(0, 14).map((t) => `<tr><td class="mono">${esc(t.term)}</td><td class="num">${fmt(t.idf, 3)}</td><td class="num">${fmt(t.weight)}</td>
        <td><div class="bar" style="width:130px"><i style="width:${Math.round(t.weight * 100)}%"></i></div></td></tr>`).join("")}</table></div>
    <div class="col card"><h3>Hashed vector — ${hv.dimensions} buckets</h3>
      <table><tr><th>Bucket</th><th>Tokens landing here</th><th class="num">Weight</th></tr>
      ${hv.terms.slice(0, 14).map((t) => `<tr><td class="mono">${t.bucket}</td><td class="mono">${t.terms.map(esc).join(", ")}</td><td class="num">${fmt(t.weight)}</td></tr>`).join("")}</table>
      <p class="small muted">Distinct tokens can share a bucket — that mixing is the hashed method's known trade-off.</p></div></div>`;
  },
  async search() {
    const searches = (await api("GET", "/api/v1/searches")).searches;
    const opts = await collectionOptions();
    app.innerHTML = `<h1>Search Lab</h1>
    <div class="card"><h3>Run a cosine search</h3>
      <label>Collection <select id="sr-col">${opts}</select></label>
      <label>Query text <input id="sr-q" placeholder="e.g. dental check-up appointment"></label>
      <div class="row"><div class="col"><label>Vectoriser <select id="sr-m"><option value="tfidf">TF-IDF</option><option value="hashed">Hashed (64 buckets)</option></select></label></div>
      <div class="col"><label>Top K <input id="sr-k" type="number" value="5" min="1" max="50"></label></div></div>
      <p><button class="btn accent" onclick="runSearch()">Search</button> <span id="sr-msg"></span></p></div>
    <h2>Search history</h2>
    <table><tr><th>Reference</th><th>Query</th><th>Method</th><th class="num">Hits</th><th>When</th><th></th></tr>
    ${searches.map((s) => `<tr><td class="mono">${esc(s.reference)}</td><td>${esc(s.query)}</td><td>${methodPill(s.method)}</td>
      <td class="num">${s.hitCount}</td><td>${esc(s.createdAt)}</td><td><a href="#/search/${s.id}">Results →</a></td></tr>`).join("")}</table>`;
  },
  async searchDetail(id) {
    const s = (await api("GET", "/api/v1/searches/" + id)).search;
    app.innerHTML = `<h1>Search Results</h1>
    <p>${methodPill(s.method)} <strong class="mono">${esc(s.query)}</strong> · run <code>${esc(s.reference)}</code> ·
    ${s.hitCount} scored matches · ${s.zeroScoreCount} documents at cosine 0${s.outOfVocabulary.length ? ` · out of vocabulary: <span class="mono">${s.outOfVocabulary.map(esc).join(", ")}</span>` : ""}</p>
    ${s.hits.map((h, i) => `<div class="card"><strong>#${i + 1} <a href="#/document/${h.docId}">${esc(h.title)}</a></strong>
      <span class="pill">${esc(h.topic)}</span> <span class="mono" style="float:right">${fmt(h.score)}</span>
      <div class="gauge" style="margin:10px 0"><i style="width:${Math.round(h.score * 100)}%"></i></div>
      <table><tr><th>${s.method === "hashed" ? "Bucket" : "Shared term"}</th><th class="num">Query weight</th><th class="num">Doc weight</th><th class="num">Contribution</th></tr>
      ${h.explanation.map((p) => `<tr><td class="mono">${s.method === "hashed" ? "bucket " + p.bucket + " (" + p.queryTerms.map(esc).join(",") + " ↔ " + p.docTerms.map(esc).join(",") + ")" : esc(p.term)}</td>
        <td class="num">${fmt(p.queryWeight)}</td><td class="num">${fmt(p.docWeight)}</td><td class="num">${fmt(p.contribution)}</td></tr>`).join("")}</table>
      <p class="small muted">The contributions sum to the score — that sum is the whole explanation.</p></div>`).join("") || `<p class="muted">No document scored above zero for this query.</p>`}`;
  },
  async clusters() {
    const runs = (await api("GET", "/api/v1/clusters")).clusterRuns;
    const opts = await collectionOptions();
    app.innerHTML = `<h1>Clustering Lab</h1>
    <div class="card"><h3>Run deterministic k-means</h3>
      <p class="muted">Initial centroids are the first k documents of the collection, in stored order — no random seed, so the same collection and k always give the same run.</p>
      <label>Collection <select id="cl-col">${opts}</select></label>
      <div class="row"><div class="col"><label>Vectoriser <select id="cl-m"><option value="tfidf">TF-IDF</option><option value="hashed">Hashed (64 buckets)</option></select></label></div>
      <div class="col"><label>k (clusters) <input id="cl-k" type="number" value="3" min="2" max="8"></label></div></div>
      <p><button class="btn accent" onclick="runCluster()">Run clustering</button> <span id="cl-msg"></span></p></div>
    <h2>Run history</h2>
    <table><tr><th>Reference</th><th>Method</th><th class="num">k</th><th class="num">Inertia</th><th class="num">Silhouette</th><th class="num">Purity</th><th></th></tr>
    ${runs.map((r) => `<tr><td class="mono">${esc(r.reference)}</td><td>${methodPill(r.method)}</td><td class="num">${r.k}</td>
      <td class="num">${fmt(r.inertia, 3)}</td><td class="num">${fmt(r.silhouette, 3)}</td><td class="num">${r.purity === null ? "n/a" : fmt(r.purity, 2)}</td>
      <td><a href="#/cluster/${r.id}">Detail →</a></td></tr>`).join("")}</table>`;
  },
  async clusterDetail(id) {
    const r = (await api("GET", "/api/v1/clusters/" + id)).clusterRun;
    app.innerHTML = `<h1>Cluster Run ${esc(r.reference)}</h1>
    <div class="grid">
      <div class="card"><div class="stat">${fmt(r.inertia, 3)}</div><div class="muted">Final inertia (sum of squared distances)</div></div>
      <div class="card"><div class="stat">${fmt(r.silhouette, 3)}</div><div class="muted">Silhouette score (Euclidean)</div></div>
      <div class="card"><div class="stat">${r.purity === null ? "n/a" : fmt(r.purity, 2)}</div><div class="muted">Purity vs topic labels</div></div>
      <div class="card"><div class="stat">${r.iterations}</div><div class="muted">Lloyd iterations</div></div>
    </div>
    <div class="card"><h3>Inertia trace — must never rise</h3>
      <p class="mono small">${r.trace.map((t) => `iteration ${t.iteration}: ${fmt(t.inertia, 4)}`).join(" → ")}</p></div>
    ${r.clusters.map((c) => `<div class="card"><h3>Cluster ${c.index} — ${c.size} documents ${c.majorityLabel ? `· majority topic: <span class="pill">${esc(c.majorityLabel)}</span>` : ""}</h3>
      <p class="small muted">Top terms: ${c.topTerms.map((t) => `<code>${esc(t.term)}</code>`).join(" ")}</p>
      <table><tr><th>Document</th><th>Topic</th><th class="num">Distance to centroid</th></tr>
      ${r.assignments.filter((a) => a.cluster === c.index).map((a) => `<tr><td><a href="#/document/${a.documentId}">${esc(a.title)}</a></td><td>${esc(a.topic)}</td><td class="num">${fmt(a.distance)}</td></tr>`).join("")}</table></div>`).join("")}`;
  },
  async compare() {
    const cols = (await api("GET", "/api/v1/collections")).collections;
    const history = (await api("GET", "/api/v1/compare")).comparisons;
    let docOpts = "";
    if (cols.length) {
      const docs = (await api("GET", "/api/v1/documents?collectionId=" + cols[0].id)).documents;
      docOpts = docs.map((d) => `<option value="${d.id}">${esc(d.title)}</option>`).join("");
    }
    app.innerHTML = `<h1>Vector Inspector</h1>
    <div class="card"><h3>Compare two documents from the first collection</h3>
      <p class="muted">Vectors are only comparable inside one collection — each collection has its own vocabulary and idf table. Cross-collection comparisons are refused by the API.</p>
      <div class="row"><div class="col"><label>Document A <select id="cp-a">${docOpts}</select></label></div>
      <div class="col"><label>Document B <select id="cp-b">${docOpts}</select></label></div>
      <div class="col"><label>Vectoriser <select id="cp-m"><option value="tfidf">TF-IDF</option><option value="hashed">Hashed</option></select></label></div></div>
      <p><button class="btn accent" onclick="runCompare()">Compare</button></p><div id="cp-out"></div></div>
    <h2>Saved comparisons</h2>
    <table><tr><th>Document A</th><th>Document B</th><th>Method</th><th class="num">Cosine</th><th>Shared terms</th></tr>
    ${history.map((c) => `<tr><td>${esc(c.documentATitle)}</td><td>${esc(c.documentBTitle)}</td><td>${methodPill(c.method)}</td>
      <td class="num">${fmt(c.score)}</td><td class="mono small">${c.sharedTerms.map(esc).join(", ")}</td></tr>`).join("")}</table>`;
  },
  async methods() {
    const ws = (await api("GET", "/api/v1/workspace")).workspace;
    const cols = (await api("GET", "/api/v1/collections")).collections;
    const notifs = (await api("GET", "/api/v1/notifications")).notifications;
    let vocabHtml = "";
    if (cols.length) {
      const v = await api("GET", "/api/v1/vocabulary?collectionId=" + cols[0].id + "&method=tfidf");
      vocabHtml = `<div class="card"><h3>Vocabulary explorer — ${esc(cols[0].name)} (TF-IDF, ${v.dimensions} terms over ${v.documentCount} documents)</h3>
      <table><tr><th>Term</th><th class="num">Documents</th><th class="num">idf</th></tr>
      ${v.terms.slice(0, 12).map((t) => `<tr><td class="mono">${esc(t.term)}</td><td class="num">${t.docs}</td><td class="num">${fmt(t.idf, 4)}</td></tr>`).join("")}</table>
      <p class="small muted">Rare terms carry the highest idf — that is why they dominate the rankings they appear in.</p></div>`;
    }
    app.innerHTML = `<h1>Methods &amp; Help</h1>
    ${vocabHtml}
    <div class="card"><h3>How TF-IDF search works</h3>
      <p>Each term's weight is its count in the document times <code>idf = ln((1+N)/(1+df)) + 1</code>, where N is the collection size and df the number of documents containing the term. Vectors are L2-normalised, so cosine similarity is a dot product — and every score breaks down into per-term contributions that sum to the score itself.</p></div>
    <div class="card"><h3>How the hashed vectoriser works</h3>
      <p>Every token is hashed with FNV-1a (32-bit) into one of 64 buckets; the vector holds per-bucket counts, L2-normalised. There is no idf, and distinct tokens can collide in a bucket — watch a fitness document score against a dental query purely because "workout" and "dentist" share bucket 36 in the Topic Check Set.</p></div>
    <div class="card"><h3>How clustering works</h3>
      <p>Deterministic k-means: the first k documents seed the centroids, Lloyd iterations alternate assignment (nearest centroid, Euclidean) and mean updates, and the inertia trace is recorded per iteration and never rises. Quality is reported as a silhouette score (standard formula, Euclidean) and, where documents carry topic labels, purity against those labels.</p></div>
    <div class="card"><h3>About the data</h3>
      <p>All collections in this workspace are seeded local data for a fictional Manchester content team. The vector mathematics is real and runs locally with no external API keys; in a production engagement the same interfaces sit in front of hosted embedding models and a vector database (see the product backlog).</p></div>
    <div class="card"><h3>Lab defaults</h3>
      <p class="muted">Default vectoriser: <span class="mono">${esc(ws.settings.defaultMethod)}</span> · default top K: <span class="mono">${ws.settings.defaultTopK}</span> · default k: <span class="mono">${ws.settings.defaultK}</span> · hash dimensions: <span class="mono">${ws.settings.hashDimensions}</span></p></div>
    <div class="card"><h3>Notifications</h3>
      ${notifs.map((n) => `<p><strong>${esc(n.title)}</strong> — <span class="muted">${esc(n.body)}</span></p>`).join("") || `<p class="muted">None yet.</p>`}</div>`;
  },
};
async function createCollection() {
  try { await api("POST", "/api/v1/collections", { name: document.getElementById("nc-name").value, description: document.getElementById("nc-desc").value }); route(); }
  catch (e) { alert(e.message); }
}
async function addDocument(cid) {
  try { await api("POST", "/api/v1/documents", { collectionId: cid, title: document.getElementById("nd-title").value,
    topic: document.getElementById("nd-topic").value, body: document.getElementById("nd-body").value }); route(); }
  catch (e) { alert(e.message); }
}
async function runSearch() {
  try {
    const d = await api("POST", "/api/v1/search", { collectionId: Number(document.getElementById("sr-col").value),
      query: document.getElementById("sr-q").value, method: document.getElementById("sr-m").value,
      topK: Number(document.getElementById("sr-k").value) || 5 });
    location.hash = "#/search/" + d.search.id;
  } catch (e) { document.getElementById("sr-msg").textContent = e.message; }
}
async function runCluster() {
  try {
    const d = await api("POST", "/api/v1/clusters", { collectionId: Number(document.getElementById("cl-col").value),
      method: document.getElementById("cl-m").value, k: Number(document.getElementById("cl-k").value) || 3 });
    location.hash = "#/cluster/" + d.clusterRun.id;
  } catch (e) { document.getElementById("cl-msg").textContent = e.message; }
}
async function runCompare() {
  try {
    const d = await api("POST", "/api/v1/compare", { documentAId: Number(document.getElementById("cp-a").value),
      documentBId: Number(document.getElementById("cp-b").value), method: document.getElementById("cp-m").value });
    const c = d.comparison;
    document.getElementById("cp-out").innerHTML = `<div class="notice">Cosine similarity: <strong class="mono">${fmt(c.score)}</strong> ·
      shared terms: <span class="mono">${c.sharedTerms.map(esc).join(", ") || "none"}</span></div>`;
  } catch (e) { document.getElementById("cp-out").innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}
async function route() {
  if (!(await loadSession())) { signinView(); return; }
  document.getElementById("mainnav").style.display = "";
  const parts = location.hash.replace(/^#\//, "").split("/");
  try {
    if (parts[0] === "collections") await VIEWS.collections();
    else if (parts[0] === "collection" && parts[1]) await VIEWS.collection(parts[1]);
    else if (parts[0] === "document" && parts[1]) await VIEWS.document(parts[1]);
    else if (parts[0] === "search" && parts[1]) await VIEWS.searchDetail(parts[1]);
    else if (parts[0] === "search") await VIEWS.search();
    else if (parts[0] === "cluster" && parts[1]) await VIEWS.clusterDetail(parts[1]);
    else if (parts[0] === "clusters") await VIEWS.clusters();
    else if (parts[0] === "compare") await VIEWS.compare();
    else if (parts[0] === "methods") await VIEWS.methods();
    else await VIEWS.dashboard();
  } catch (e) { app.innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}
window.addEventListener("hashchange", route);
route();
