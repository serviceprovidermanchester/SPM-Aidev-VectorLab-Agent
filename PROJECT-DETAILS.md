# VectorLab — Portfolio Entry

**Service:** AI Development (Service #10, SPManchester portfolio) · **Business:** VectorLab, built for AI engineering teams choosing retrieval and clustering approaches; showcase workspace Manchester Business Help Centre, Northern Quarter, Manchester · **Deliverable:** Complete vector search and clustering playground — lab console, TF-IDF + hashed vector engine, explained search, deterministic k-means with graded quality, live-verified.

## Portfolio summary (for spmanchester.com/projects)

VectorLab is a vector search and clustering playground built by SPManchester. Engineers load a text collection and explore similarity two ways: TF-IDF vectors (idf = ln((1+N)/(1+df))+1, L2-normalised) and 64-bucket FNV-1a hashed bag-of-words vectors. Cosine searches return ranked scores with explanations whose per-term (or per-bucket) contributions sum exactly to the score; any two documents can be compared; and deterministic k-means — seeded from the first k documents, with a recorded inertia trace — grades itself with a silhouette score and purity against topic labels.

The showcase workspace holds seeded collections for a fictional Manchester content team: 16 business help articles, six support answers, and a nine-document fixture set with disjoint topic vocabularies whose behaviour is provable by hand. On that fixture, "dentist implant" ranks first at 0.798218, an orthogonal pair scores exactly 0, identical text scores exactly 1.0, k-means recovers all three topics at purity 1.0 — and the hashed vectoriser's weakness is on full display, with a fitness document scoring 0.408248 against a dental query purely because "workout" and "dentist" collide in bucket 36. Verified by 42 live tests including 14 labelled expected-output cases computed independently from the documented formulas.

**Highlights**
- Two real vectorisers with opposite trade-offs, every score explainable to the last contribution
- Deterministic k-means: first-k centroid seeding, non-increasing inertia trace (fixture: 4.857128 → 3.140236), silhouette 0.285154, purity 1.0 on the labelled fixture set
- Hash collisions surfaced, not hidden: bucket-level explanations name the colliding tokens on both sides
- Stored search/cluster/comparison runs that reproduce exactly; per-collection idf tables with a vocabulary explorer
- 10-view lab console, 27 API endpoints, 11 database tables, zero dependencies

**Stack:** Node.js (node:http / node:sqlite / node:crypto only), SQLite, vanilla HTML/CSS/JS console, PIL screenshot renders. Technique: exact local vector mathematics — TF-IDF and FNV-1a hashed vectors, cosine similarity, Lloyd k-means — over seeded local collections; no hosted embedding model or vector database is claimed, and both are documented as the production backlog behind the same interfaces.

**GitHub:** [GitHub link] — repository `spm-aidev-vectorlab` under serviceprovidermanchester (add the live URL here once uploaded).

## LinkedIn draft

We built VectorLab — a vector search and clustering playground for AI engineering teams. See what similarity really means.

Pick a collection and search it two ways: TF-IDF, where every score breaks down into per-term contributions that sum to the score itself, and a 64-bucket hashed vectoriser, where you can watch a fitness document score 0.408 against a dental query for one reason only — "workout" and "dentist" hash into the same bucket. Then cluster the collection with deterministic k-means: first-k seeding, an inertia trace that never rises, a silhouette score, and purity graded against the topics you already know.

On the nine-document fixture set every number can be checked with a pencil — top hit 0.798218, orthogonal pair exactly 0, identical text exactly 1.0, all three topics recovered at purity 1.0 — verified by 42 live tests with 14 independently computed cases.

Full source, screenshots and documentation: [GitHub link]

#AIDevelopment #LLMOps #VectorSearch #MachineLearning #Manchester #SPManchester
