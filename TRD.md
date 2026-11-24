# TRD — VectorLab, Vector Search & Clustering Playground

**Built by:** SPManchester · **Stack:** Node.js 22.5+ built-ins only (`node:http`, `node:sqlite`, `node:crypto`), SQLite, vanilla HTML/CSS/JS console, PIL for screenshot renders.

## 1. Architecture (zero level → high level)

At zero level the product is one process and one database file: `backend/src/server.js` starts an HTTP server that (a) serves the lab console from `web/` and (b) answers the JSON API. The SQLite database is created and seeded on first start. There are no external services, no npm dependencies, no network calls and no API keys.

At the high level the backend is layered:

- **Transport** — `src/app.js`: an explicit router over `node:http`. Routes are declared as `[method, pattern, ...handlers]` in `src/routes/*.js`; patterns support `:params`; JSON bodies are parsed centrally and errors funnel to `src/middleware/errors.js`.
- **Middleware** — `src/middleware/auth.js` resolves the bearer token to a user and provides `requireAuth` / `requireOwner` plus `myWorkspace(req)`, the scoping primitive every domain route uses; `validate.js` provides field validation.
- **Routes** — `auth.js` (accounts & sessions; registration also provisions a workspace), `lab.js` (collections, documents, search, comparisons, clustering), `misc.js` (workspace profile + lab settings, vocabulary explorer, dashboard, notifications).
- **AI engine** — `src/ai/engine.js` is self-contained and pure: callers pass document texts in and get indexes, rankings with explanations, comparisons and cluster runs out. It never touches the database or the network, which is what makes the labelled expected-output cases in the test suite deterministic. `src/seed.js` exposes `runSearch()` / `runCluster()` / `runComparison()`, shared by the seed and the API routes, so a stored run is always the engine's own output over the stored documents.
- **Data** — `src/db.js` owns the schema (mirrored in `database/schema.sql`); `src/seed.js` seeds the showcase workspace, its three collections and 31 documents, and one search run, one cluster run and one comparison produced by running the real engine over the seeded articles, plus notifications.
- **Console** — `web/app.js` is a hash-routed single-page console (10 views, three of them parameterised: `#/collection/:id`, `#/document/:id`, `#/search/:id`, `#/cluster/:id`); every view calls the live API (no static data). `web/styles.css` carries the design system (charcoal #111827/#1F2937, emerald #10B981, background #F2F7F4, monospace data type).

## 2. The vector engine — algorithms as implemented

**Tokenisation:** lowercase → split on any run of non-`[a-z0-9]` characters → keep tokens of length ≥ 2. No stemming, no stopword list. A document's vector is built from its **body text only**; titles and topic labels are metadata and never enter a vector.

**TF-IDF vectoriser.** For a collection of N documents, `df(t)` counts the documents containing term t, and

```
idf(t)   = ln( (1 + N) / (1 + df(t)) ) + 1
weight(t, d) = count(t, d) × idf(t),  then the vector is L2-normalised
```

A query is vectorised with the collection's idf table; terms absent from the collection are ignored and returned as `outOfVocabulary`. Cosine between L2-normalised vectors is their dot product; each hit's explanation lists every shared term with its query weight, document weight and contribution `qWeight × dWeight`, sorted by contribution — the contributions sum to the score.

**Hashed bag-of-words vectoriser (64 dimensions).** Token hash is FNV-1a 32-bit: `h = 2166136261`; per character code c, `h = (h XOR c) × 16777619 (mod 2^32)` via `Math.imul`; bucket = `h mod 64`. The raw vector holds per-bucket token counts, L2-normalised; there is no idf. Because collisions mix tokens, explanations are per bucket: bucket index, both sides' weights, the contribution, and the tokens from each side that landed in the bucket. In the fixture vocabulary, `dentist` and `workout` both hash to bucket 36, and `gym`, `bake` and `filling` all collide in bucket 0 — the suite asserts both facts.

**K-means (deterministic Lloyd).** Initial centroids are the vectors of the **first k documents** in stored (id ascending) order. Each iteration: assign every document to its nearest centroid by Euclidean distance (ties → lowest cluster index); record inertia = Σ squared distances to assigned centroids; stop if assignments are unchanged (max 50 iterations); otherwise move each centroid to the plain mean of its members — centroids are **not** renormalised after the mean update, and an empty cluster keeps its previous centroid. This is exactly the procedure whose inertia is guaranteed non-increasing, and the suite asserts the trace property on the fixture run (4.857128 → 3.140236).

**Cluster quality.** Silhouette uses the standard formula with Euclidean distances between document vectors: `a(i)` = mean distance to other members of i's cluster, `b(i)` = smallest mean distance to any other cluster, `s(i) = (b−a)/max(a,b)`; singleton clusters score 0, and the reported score (the mean of s(i)) is 0 when k = 1 or N ≤ k. Purity, when documents carry topic labels, is `(Σ over clusters of the largest single-label count) / N`. Cluster top terms: for TF-IDF, the terms with the highest mean vector weight across members; for the hashed method, the most frequent member tokens (buckets are not terms) — top 5, ties broken alphabetically.

**Ranking order.** Search hits sort by score descending, then document id ascending, so ties (for example the hashed method's two implant documents at 0.816497) have a stable, documented order.

## 3. Data model — 11 tables

`users` (owner/staff, FK to their workspace), `sessions`, `workspaces` (name, slug, team, location), `workspace_settings` (default_method, default_top_k, default_k, hash_dimensions=64), `collections` (scoped by workspace), `documents` (title, body, topic label, source; scoped via their collection), `search_runs` (reference `SRC-XXXXXX`, query, method, top-K, hit/zero-score counts, out-of-vocabulary list and hits as JSON), `cluster_runs` (reference `CLU-XXXXXX`, method, k, iterations, inertia, silhouette, purity, inertia trace and cluster summaries as JSON), `cluster_assignments` (one row per document per run, with its distance to the assigned centroid), `comparisons` (document pair, method, score, shared terms), `notifications`.

## 4. API reference — 27 endpoints under /api/v1, plus GET /health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Service health, seeded workspace, collection and document counts |
| POST | `/api/v1/auth/register` | Create an owner account + provision its workspace (201; duplicate email 409) |
| POST | `/api/v1/auth/login` | Sign in; returns a session token |
| POST | `/api/v1/auth/logout` | Sign out (auth) |
| GET | `/api/v1/auth/me` | Current account (auth) |
| PUT | `/api/v1/auth/me` | Update name/phone (auth) |
| GET | `/api/v1/workspace` | My workspace profile + lab settings (auth) |
| PUT | `/api/v1/workspace` | Update profile/settings (owner only, 403 for staff) |
| GET | `/api/v1/collections` | Collections with document counts and topic lists (auth) |
| POST | `/api/v1/collections` | Create a collection (201) (auth) |
| GET | `/api/v1/collections/:id` | One collection with its documents (404 if another workspace's) (auth) |
| DELETE | `/api/v1/collections/:id` | Delete a collection and its documents (owner only) |
| GET | `/api/v1/documents` | Documents of a collection; `?collectionId=` required, `?q=` filter (auth) |
| POST | `/api/v1/documents` | Add a document (201) (auth) |
| GET | `/api/v1/documents/:id` | One document with both of its vectors (terms/buckets + weights) (auth) |
| DELETE | `/api/v1/documents/:id` | Delete a document (owner only) |
| POST | `/api/v1/search` | Run a cosine search and store the run (201; 400 for an empty collection or unknown method) (auth) |
| GET | `/api/v1/searches` | Stored search runs for the workspace (auth) |
| GET | `/api/v1/searches/:id` | One stored search run with its explained hits (auth) |
| POST | `/api/v1/compare` | Compare two documents in one collection (201; 400 across collections) (auth) |
| GET | `/api/v1/compare` | Saved comparisons for the workspace (auth) |
| POST | `/api/v1/clusters` | Run deterministic k-means and store the run + assignments (201; 400 for bad k) (auth) |
| GET | `/api/v1/clusters` | Stored cluster runs for the workspace (auth) |
| GET | `/api/v1/clusters/:id` | One cluster run with trace, clusters and per-document assignments (auth) |
| GET | `/api/v1/vocabulary` | Term table for a collection: `?collectionId=&method=` — df + idf, or hash buckets (auth) |
| GET | `/api/v1/dashboard` | Workspace stats, latest search and cluster run, recent activity (auth) |
| GET | `/api/v1/notifications` | Account notifications (auth) |
| PATCH | `/api/v1/notifications/read` | Mark notifications read (auth) |

## 5. Views — 10 console views, one screenshot each

| View | Description | Screenshot |
|---|---|---|
| 01-dashboard | Purity hero from the latest cluster run, workspace stats, latest search, recent activity | screenshots/01-dashboard.png |
| 02-collections | The workspace's collections with document counts and topics; create form | screenshots/02-collections.png |
| 03-collection-detail | One collection's documents with topics and token counts; add-document form | screenshots/03-collection-detail.png |
| 04-document-detail | One document's TF-IDF terms and hashed buckets side by side | screenshots/04-document-detail.png |
| 05-search-lab | Search form (collection, query, vectoriser, top-K) and run history | screenshots/05-search-lab.png |
| 06-search-results | Ranked hits with score gauges and per-term contribution tables | screenshots/06-search-results.png |
| 07-clustering-lab | K-means form (collection, vectoriser, k) and run history with quality figures | screenshots/07-clustering-lab.png |
| 08-cluster-detail | Inertia, silhouette, purity, iteration trace, clusters with top terms and member distances | screenshots/08-cluster-detail.png |
| 09-vector-inspector | Pairwise comparison with shared terms, plus saved comparisons | screenshots/09-vector-inspector.png |
| 10-methods-help | Vocabulary explorer, method explainers, data note, lab defaults, notifications | screenshots/10-methods-help.png |

## 6. Security & integrity

Salted scrypt password hashes (`utils/tokens.js`); 32-byte random session tokens expiring after 30 days; all domain reads are scoped through the signed-in workspace (`myWorkspace()` and collection joins) so another workspace's data returns 404 rather than leaking existence; workspace settings edits and collection/document deletions are owner-only (staff receive 403); search and cluster runs snapshot their results at run time, so later document edits never rewrite history. All SQL is parameterised.

## 7. Testing

`tests/run-tests.js` starts the real server against a fresh temporary database (unique temp directory, cleaned up afterwards) and runs 42 live checks over HTTP, including 14 labelled expected-output cases (VL-01…VL-14) whose expected values were computed independently from the formulas in §2: fixture idf values, the "dentist implant" ranking and its contribution split, out-of-vocabulary handling, orthogonal/identical extremes under both vectorisers, hashed bucket contents and collision effects, and k-means topic recovery at purity 1.0 with the exact inertia traces and silhouette scores for both vectorisers. See VERIFICATION.md for the full output. Run it any time with `node tests/run-tests.js`.

## 8. Production notes

The engine's interfaces (build an index over a collection, search it, compare within it, cluster it) are the integration seam: a production engagement adds hosted embedding APIs (OpenAI, Anthropic, Google, Azure OpenAI, open-weight hosts) as further vectorisers and a vector database (pgvector, Pinecone, Qdrant, Weaviate) behind the same endpoints, without changing the console or the run-storage model. Those integrations are listed in the PRD backlog rather than claimed here. Hash dimensions and lab defaults already live per workspace in `workspace_settings`, so team-specific tuning needs no code change.

## 9. File inventory

| File | Size |
|---|---|
| `PRD.md` | 7031 B |
| `PROJECT-DETAILS.md` | 4032 B |
| `README.md` | 7604 B |
| `TRD.md` | this file |
| `VERIFICATION.md` | 8345 B |
| `backend/README.md` | 1049 B |
| `backend/package.json` | 651 B |
| `backend/src/ai/engine.js` | 16855 B |
| `backend/src/app.js` | 3281 B |
| `backend/src/db.js` | 5716 B |
| `backend/src/middleware/auth.js` | 1391 B |
| `backend/src/middleware/errors.js` | 441 B |
| `backend/src/middleware/validate.js` | 321 B |
| `backend/src/routes/auth.js` | 3060 B |
| `backend/src/routes/lab.js` | 12655 B |
| `backend/src/routes/misc.js` | 5499 B |
| `backend/src/seed-data.js` | 9619 B |
| `backend/src/seed.js` | 7791 B |
| `backend/src/server.js` | 767 B |
| `backend/src/utils/respond.js` | 1206 B |
| `backend/src/utils/tokens.js` | 687 B |
| `database/README.md` | 681 B |
| `database/schema.sql` | 5143 B |
| `database/seed.sql` | 10981 B |
| `preview/make_screenshots.py` | 15865 B |
| `preview/shot-config.json` | 5603 B |
| `screenshots/01-dashboard.png` | 64037 B |
| `screenshots/02-collections.png` | 46716 B |
| `screenshots/03-collection-detail.png` | 52031 B |
| `screenshots/04-document-detail.png` | 63328 B |
| `screenshots/05-search-lab.png` | 41471 B |
| `screenshots/06-search-results.png` | 61629 B |
| `screenshots/07-clustering-lab.png` | 43150 B |
| `screenshots/08-cluster-detail.png` | 76620 B |
| `screenshots/09-vector-inspector.png` | 49880 B |
| `screenshots/10-methods-help.png` | 72980 B |
| `tests/run-tests.js` | 18806 B |
| `web/app.js` | 22927 B |
| `web/index.html` | 1214 B |
| `web/styles.css` | 4230 B |
