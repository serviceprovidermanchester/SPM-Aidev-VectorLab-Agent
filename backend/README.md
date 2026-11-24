# Backend — VectorLab

Zero-dependency Node.js API for VectorLab, the vector search and clustering playground by SPManchester. Uses only `node:http`, `node:sqlite` and `node:crypto`. It also serves the web console in `../web`.

Run: `node src/server.js` (PORT env, default 4000). Health: `GET /health`. The database is created and seeded automatically on first start from `src/seed-data.js`; set `DB_PATH` to use a different SQLite file. The vector engine lives in `src/ai/engine.js` — TF-IDF vectors (idf = ln((1+N)/(1+df))+1, L2-normalised) and 64-dimension FNV-1a hashed bag-of-words vectors, cosine search with per-term/per-bucket score explanations, and deterministic k-means with an inertia trace and silhouette score; no network calls and no API keys. See `../TRD.md` for the full architecture, the exact formulas and the endpoint reference.

Seeded accounts (for the showcase workspace, Manchester Business Help Centre): owner `owner@manchesterbusinesshelp.co.uk` / `Owner2026!`, staff `team@manchesterbusinesshelp.co.uk` / `Team2026!`.
