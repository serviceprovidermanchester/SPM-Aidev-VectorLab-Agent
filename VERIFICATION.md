# Verification — VectorLab

**Method:** the product's own live test suite (`tests/run-tests.js`) was run against the real server started on a fresh, temporary SQLite database (unique temp directory per run, removed afterwards). The suite exercises registration and workspace provisioning, the seeded showcase workspace with exact expected values, and 14 labelled expected-output cases (VL-01…VL-14) built on a nine-document fixture set — three topics (dental, recipes, fitness) with disjoint vocabularies, stored interleaved — whose expected values were computed independently from the documented formulas (by hand-style arithmetic reproduced in a separate calculation, not by reading the engine's output). Screenshots were rendered with `preview/make_screenshots.py` (PIL) in the product's own design system with real engine results from a live seeded instance.

**Result: 42 passed, 0 failed.** Syntax: all 16 JS files pass `node --check`. Screenshots: 10 PNGs in `screenshots/` — one for each of the 10 console views, each > 10 KB; the dashboard, search-results, document-detail, cluster-detail, vector-inspector and methods renders were visually inspected (three layout defects found — a clipped header line, cluster cards overflowing the canvas, and a vocabulary table outgrowing its card — fixed in the renderer and re-rendered).

**Expected-output accuracy: all labelled cases passed**, including:
- VL-01: the fixture idf table (N=9) — dentist (df 3) = ln(10/4)+1 = **1.916291**, tooth (df 2) = **2.203973**, crown (df 1) = **2.609438**, across a 15-term vocabulary.
- VL-02/VL-03: TF-IDF search "dentist implant" ranks **0.798218 / 0.745710 / 0.321041** with exactly 3 hits and 6 zero scores; the top score's explanation (implant **0.454571** + dentist **0.343647**) sums to the score.
- VL-04/VL-05: the orthogonal dental–recipes pair scores cosine **0** under both vectorisers; identical text scores **1.0** (query-equals-document and self-comparison).
- VL-07/VL-08: hashed search ties the two implant documents at **0.816497** and surfaces a fitness document at **0.408248** caused solely by the bucket-36 collision (workout ↔ dentist); the hashed vector of "dentist tooth implant" occupies exactly buckets **{36, 48, 53}** at 1/√3 each.
- VL-10/VL-11/VL-12: k-means at k=3 recovers the three topics with **purity 1.0** under both vectorisers — TF-IDF inertia trace **4.857128 → 3.140236** (non-increasing), silhouette **0.285154**; hashed final inertia **2.666667**, silhouette **0.189973** — and a repeat run reproduces inertia and purity exactly.
- Seeded showcase: the 16 help articles cluster at k=4 with purity **0.9375** (15 of 16 on-topic); the seeded search "dental check-up appointment" tops at **0.3197**.

## Test output

```
PASS  health reports the seeded workspace, 3 collections and 31 documents - workspaces=1, collections=3, documents=31
PASS  seeded owner can sign in - owner@manchesterbusinesshelp.co.uk
PASS  wrong password rejected - HTTP 401
PASS  collections need sign-in - HTTP 401
PASS  seeded dashboard: 3 collections, 31 documents, 1 search, 1 cluster run, 1 comparison - {"collections":3,"documents":31,"searches":1,"clusterRuns":1,"comparisons":1}
PASS  seeded cluster run over the help articles has purity 0.9375 (15 of 16 on-topic) - purity=0.9375
PASS  staff cannot update the workspace profile (owner only) - HTTP 403
PASS  staff cannot delete a document (owner only) - HTTP 403
PASS  register creates an owner with an empty workspace - HTTP 201
PASS  duplicate email rejected - HTTP 409
PASS  another workspace cannot read the seeded workspace's collection - HTTP 404
PASS  collection created with 201 - Fixture Set
PASS  nine fixture documents stored in interleaved topic order - ids 32,33,34,35,36,37,38,39,40
PASS  document without a body is a 400 - HTTP 400
PASS  VL-01 idf values: dentist (df 3) = ln(10/4)+1 = 1.916291, tooth (df 2) = 2.203973, crown (df 1) = 2.609438; 15 terms - dentist=1.916291, crown=2.609438
PASS  VL-02 TF-IDF search 'dentist implant': top hit is the implant document at 0.798218, then 0.745710, then 0.321041; 3 hits, 6 zero scores - scores=0.798218,0.745710,0.321041
PASS  VL-03 explanation reconciles: implant contributes 0.454571, dentist 0.343647, and the parts sum to the score - implant=0.454571, dentist=0.343647
PASS  VL-09 'zebra' is reported out-of-vocabulary and the dentist-only query tops at the document's dentist weight 0.523742 - oov=zebra, top=0.523742
PASS  VL-14 an all-unknown query scores nothing: 0 hits, 9 zero scores - hits=0
PASS  VL-05 a query identical to a document's text scores that document exactly 1.0 - score=1.0000000000000002
PASS  VL-05b a document compared with itself scores exactly 1.0 under the hashed vectoriser too - score=1.0000000000000002
PASS  VL-04 the orthogonal pair (dental vs recipes, no shared tokens or hash buckets) scores cosine 0 under both vectorisers - tfidf=0, hashed=0
PASS  VL-06 same-topic pair: TF-IDF cosine 0.595239 with shared terms dentist+tooth; hashed cosine 0.666667 (2 of 3 buckets shared) - tfidf=0.595239, hashed=0.666667
PASS  VL-07 hashed search ties the two implant documents at 0.816497 (2/sqrt(6)) and a fitness document scores 0.408248 purely from the bucket-36 collision (workout vs dentist) - top=0.816497, fitness hit=0.408248
PASS  VL-08 the hashed vector of 'dentist tooth implant' has exactly 3 non-zero buckets {36, 48, 53}, each weighted 1/sqrt(3) = 0.577350 - buckets=36,48,53
PASS  VL-13 the TF-IDF vector is L2-normalised with implant = tooth = 0.602368 and dentist = 0.523742 - implant=0.602368
PASS  hashed vocabulary maps dentist to bucket 36 and gym/filling/bake all collide in bucket 0 - dentist bucket=36
PASS  VL-10 TF-IDF k-means (k=3) recovers the three topics exactly: purity 1.0, sizes 3/3/3, inertia trace 4.857128 -> 3.140236 (non-increasing), silhouette 0.285154 - inertia=3.140236, silhouette=0.285154
PASS  VL-12 the dental cluster's majority label is 'dental' and its top TF-IDF term is 'dentist'; the three majority labels are the three topics - labels=dental,recipes,fitness
PASS  VL-11 hashed k-means also recovers the topics (purity 1.0) with final inertia 2.666667 and silhouette 0.189973 - inertia=2.666667, silhouette=0.189973
PASS  clustering is deterministic: a repeat run reproduces inertia and purity exactly - inertia=3.140236
PASS  cluster detail returns all 9 assignments - assignments=9
PASS  bad k is a 400 - HTTP 400 BAD_K
PASS  unknown method is a 400 - HTTP 400 BAD_METHOD
PASS  comparing documents from different collections is a 400 (each collection has its own idf table) - HTTP 400 DIFFERENT_COLLECTIONS
PASS  search history holds the runs made in this workspace - 5 runs
PASS  search detail reproduces the stored top score - top=0.798218
PASS  cluster history holds the runs made in this workspace - 3 runs
PASS  owner can change the lab defaults (method hashed, topK 7) and they persist - topK=7
PASS  seeded owner has run notifications recorded - 3 notifications
PASS  notifications can be marked read - HTTP 200
PASS  owner deletes a collection and its documents go with it - HTTP 200 then 404

42 passed, 0 failed
```

## Honest caveats

- The collections are **seeded local data** for a fictional client team (Manchester Business Help Centre): the 31 documents' texts and topic labels were written for this product and stored as seed data. No hosted embedding model, hosted vector database or real client corpus is used or claimed; PRD.md lists those integrations as backlog, behind the same search/compare/cluster interfaces.
- The silhouette score is the standard formula (Euclidean distances between document vectors, singletons scoring 0), implemented in the engine and stated as such — not a simplified variant.
- The console JavaScript is syntax-checked and structurally verified; the behaviour that matters — vectorisation, rankings, explanations, clustering, scoping — lives in the backend, which is what the live suite tests over HTTP.
- Screenshots are faithful PIL renders of the console's design system and real engine results (the same approach as the earlier SPManchester series), not browser captures. Run references in the renders come from one live seeded instance; references are generated per database, so a fresh instance shows different reference codes with identical scores.
