# PRD — VectorLab, Vector Search & Clustering Playground

**Product:** VectorLab — see what similarity really means · **Built by:** SPManchester · **Status:** Complete product, live-verified (see VERIFICATION.md) · **Showcase workspace:** Manchester Business Help Centre, Northern Quarter, Manchester

## 1. Problem

Engineering teams choose embedding approaches — hosted models, hashing tricks, classic TF-IDF — with no intuition for how similarity actually behaves in each. Rankings cannot be explained, clustering quality is judged by eyeballing, and representation artefacts (hash collisions, vocabulary gaps, frequency domination) surface only after a design is baked into a product. Teams need a small, honest playground where similarity is computed transparently, every score can be taken apart, and a clustering can be graded against known topics.

## 2. Target customers

- **AI/ML engineers and technical leads** evaluating retrieval and clustering approaches for a product, who need explainable similarity behaviour before committing to a hosted embedding stack.
- **Search and content-platform teams** who want to sanity-check ranking intuition (rare-term dominance, frequency effects, collision effects) on collections shaped like their own.
- **Technical educators and hiring teams** who need clustering and retrieval behaviour that can be verified by hand, on fixtures small enough to recompute with a pencil.

## 3. Product summary

A lab workspace per team. Text collections (documents with body text and optional topic labels) are stored in the product. Two vectorisers — TF-IDF and 64-bucket hashed bag-of-words — index any collection; engineers run cosine searches with per-term/per-bucket score explanations, compare document pairs, and run deterministic k-means clustering with an inertia trace, silhouette score and label purity. Runs are stored, so history and repeatability are built in. The showcase workspace ships with seeded collections for a fictional Manchester content team (31 documents across three collections), including a nine-document fixture set whose every score is hand-verifiable.

## 4. Functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-1 | Workspace onboarding | Registering creates the owner account, a workspace with a unique slug, and default lab settings |
| FR-2 | Collections & documents | Collections can be created and removed (delete is owner-only); documents carry title, body and topic label; a document's vector is built from its body only |
| FR-3 | Two vectorisers | TF-IDF (idf = ln((1+N)/(1+df))+1, raw-count tf, L2-normalised) and hashed bag-of-words (FNV-1a token hash into 64 buckets, counts, L2-normalised), selectable per run |
| FR-4 | Cosine search | Ranked hits with scores; every hit's explanation contributions sum to its score; out-of-vocabulary query terms are reported (TF-IDF); zero-score documents are counted, not silently dropped |
| FR-5 | Pairwise comparison | Any two documents in one collection can be compared under either vectoriser, with shared terms listed; cross-collection comparison is refused with a stated reason |
| FR-6 | Deterministic k-means | Initial centroids are the first k stored documents; the run records an inertia trace (non-increasing), final inertia, silhouette score and, for labelled collections, purity |
| FR-7 | Run history | Searches, cluster runs (with per-document assignments) and comparisons are persisted per workspace and re-readable; repeating a run reproduces its numbers exactly |
| FR-8 | Vocabulary explorer | Per collection and vectoriser: terms with document frequency and idf, or terms with their hash bucket |
| FR-9 | Lab settings | Default vectoriser, top-K and k are editable per workspace (owner only) and apply to subsequent runs |
| FR-10 | Roles & scoping | Staff can search, compare and cluster but not change settings or delete content (403); every read is scoped to the signed-in workspace (other workspaces' data is 404) |

## 5. Engine behaviour requirements

- The engine is local and deterministic: the same collection, vectoriser and parameters always produce the same scores, rankings and clusters (verified by repeat runs reproducing inertia and purity exactly).
- TF-IDF idf uses the smoothed formula ln((1+N)/(1+df))+1, so a term present in every document has idf exactly 1.0 and no term's idf reaches 0.
- Hashed-vector explanations are reported per bucket, naming the tokens from each side that fell into the bucket — never as if colliding terms stayed separable.
- K-means centroids are not renormalised after the mean update (renormalising would break the non-increasing inertia guarantee); an empty cluster keeps its previous centroid; ties in assignment go to the lowest cluster index.
- Silhouette uses the standard formula with Euclidean distances between document vectors; singleton clusters score 0, and the score is reported as 0 when k = 1 or documents ≤ clusters.
- **Accuracy targets (labelled cases in VERIFICATION.md):** 100% of the 14 labelled expected-output cases pass — fixture idf values, the provable "dentist implant" ranking (0.798218 / 0.745710 / 0.321041), contribution sums, orthogonal 0 and identical 1.0 under both vectorisers, hashed collision effects (tie at 0.816497; cross-topic 0.408248 via bucket 36), and k-means recovering the three fixture topics at purity 1.0 with inertia 3.140236 (TF-IDF) and 2.666667 (hashed). Achieved: 14/14 within the 42-check suite.

## 6. Non-functional requirements

- Zero runtime dependencies (Node.js built-ins only); runs anywhere Node 22.5+ runs, no install step.
- Passwords stored as salted scrypt hashes; 32-byte session tokens, 30-day expiry; all SQL parameterised.
- Every console view calls the live API; there are no placeholder pages.
- **Honesty:** all collections are seeded local data for fictional Manchester businesses. The product never claims a live hosted embedding model, a hosted vector database or real client corpora; the local TF-IDF/hashing/k-means machinery is real and is described exactly as implemented.

## 7. Success measures (KPIs)

- An engineer can go from sign-up to an explained search result and a graded clustering in under 10 minutes.
- Every score shown in the console can be reconciled by hand from the breakdown shown next to it.
- The fixture set's labelled cases keep passing at 100% across releases — the playground's own correctness is its credibility.

## 8. Backlog

- Production integrations behind the same interfaces: hosted embedding APIs (OpenAI, Anthropic, Google, Azure OpenAI, open-weight model hosts) as additional vectorisers, and vector databases (pgvector, Pinecone, Qdrant, Weaviate) as index backends, with side-by-side agreement metrics against the local vectorisers.
- Larger-corpus tooling: chunking pipelines over imported documents, approximate-nearest-neighbour indexes, dimensionality reduction plots (PCA/UMAP-style projections) for cluster visualisation, and per-cluster exemplar export.
