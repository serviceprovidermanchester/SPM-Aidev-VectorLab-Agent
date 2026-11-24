"use strict";
// VectorLab AI engine — vector search and clustering machinery, implemented
// locally and deterministically in plain JavaScript. No network calls, no
// API keys, no hosted embedding service: both vectorisers below are exact,
// documented mathematics over the seeded text collections, so every score
// the API returns can be recomputed by hand from the formulas stated here
// (and in TRD.md).
//
// TOKENISATION (shared by both vectorisers)
//   text -> lowercase -> split on any run of non [a-z0-9] characters ->
//   keep tokens of length >= 2. No stemming, no stopword list: what you
//   see in the text is exactly what enters the vector. A document's vector
//   is built from its body text only; titles and topic labels are metadata
//   and never enter a vector.
//
// VECTORISER A — TF-IDF
//   For a collection of N documents, df(t) = number of documents containing
//   term t at least once, and
//       idf(t) = ln( (1 + N) / (1 + df(t)) ) + 1
//   A document's raw weight for t is tf(t) * idf(t), where tf(t) is the raw
//   count of t in the document. The vector is then L2-normalised (divided
//   by its Euclidean norm); an empty document stays the zero vector.
//   A query is vectorised with the collection's own idf values; query terms
//   that never occur in the collection (out of vocabulary) are ignored and
//   reported back to the caller. Cosine similarity between two L2-normalised
//   vectors is their dot product, and the per-term explanation is exact:
//   each shared term contributes qWeight * dWeight and the contributions
//   sum to the score.
//
// VECTORISER B — HASHED BAG OF WORDS (64 dimensions)
//   Each token is hashed with FNV-1a (32-bit): h starts at 2166136261 and
//   for each character code c, h = (h XOR c) * 16777619 (mod 2^32, via
//   Math.imul). The token's bucket is h mod 64. A document's raw vector is
//   the per-bucket token counts, L2-normalised. There is no idf weighting,
//   so frequent terms dominate. Distinct tokens can land in the same bucket
//   (a collision): bucket weights then mix those tokens, which is why the
//   hashed explanation is reported per bucket, listing the tokens from each
//   side that fell into it, instead of pretending terms stay separable.
//
// CLUSTERING — DETERMINISTIC K-MEANS (Lloyd's algorithm)
//   Initial centroids are the vectors of the FIRST k documents of the
//   collection, in stored (id ascending) order — there is no random seed
//   anywhere, so the same collection and k always produce the same run.
//   Each iteration assigns every document to its nearest centroid by
//   Euclidean distance (ties go to the lowest cluster index), records the
//   inertia (sum of squared Euclidean distances to the assigned centroid),
//   then moves each centroid to the plain arithmetic mean of its members
//   (centroids are NOT renormalised after the first step — renormalising
//   would break the guarantee below). A cluster that receives no members
//   keeps its previous centroid. The loop stops when assignments stop
//   changing, or after 50 iterations. Because assignment and mean-update
//   each minimise the same objective, the recorded inertia trace is
//   non-increasing — the test suite asserts this on every run.
//   Cluster quality: silhouette score uses the standard formula with
//   Euclidean distances between document vectors: for point i, a(i) is the
//   mean distance to the other points in its own cluster, b(i) is the
//   smallest mean distance to the points of any other cluster, and
//   s(i) = (b(i) - a(i)) / max(a(i), b(i)); singleton clusters score 0.
//   The reported silhouette is the mean of s(i); it is 0 when k = 1 or
//   when there are no more documents than clusters. When documents carry
//   topic labels, purity = (sum over clusters of the largest single-label
//   count in that cluster) / N is also reported.

const HASH_DIMS = 64;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const MAX_ITERATIONS = 50;

function tokenize(text) {
  return String(text || "").toLowerCase().split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

function fnv1a(token) {
  let h = FNV_OFFSET;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}
function hashBucket(token, dims) {
  return fnv1a(token) % (dims || HASH_DIMS);
}

function norm(vec) {
  let s = 0;
  for (const v of vec) s += v * v;
  return Math.sqrt(s);
}
function normalise(vec) {
  const n = norm(vec);
  if (n === 0) return vec.slice();
  return vec.map((v) => v / n);
}
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function cosine(a, b) {
  const na = norm(a), nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}
function dist2(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return s;
}

// Build an index over documents: [{ id, text }]. method: "tfidf" | "hashed".
// Returns everything the search/compare/cluster callers need, including the
// vocabulary and idf table for the TF-IDF method.
function buildIndex(documents, method) {
  const docs = documents.map((d) => ({ id: d.id, tokens: tokenize(d.text) }));
  if (method === "hashed") {
    const vectors = docs.map((d) => {
      const raw = new Array(HASH_DIMS).fill(0);
      for (const t of d.tokens) raw[hashBucket(t)] += 1;
      return normalise(raw);
    });
    return { method, dims: HASH_DIMS, docs, vectors, vocab: null, idf: null };
  }
  // tfidf
  const df = new Map();
  for (const d of docs) for (const t of new Set(d.tokens)) df.set(t, (df.get(t) || 0) + 1);
  const vocab = [...df.keys()].sort();
  const pos = new Map(vocab.map((t, i) => [t, i]));
  const N = docs.length;
  const idf = vocab.map((t) => Math.log((1 + N) / (1 + df.get(t))) + 1);
  const vectors = docs.map((d) => {
    const raw = new Array(vocab.length).fill(0);
    for (const t of d.tokens) raw[pos.get(t)] += 1;
    for (let i = 0; i < vocab.length; i++) raw[i] *= idf[i];
    return normalise(raw);
  });
  return { method, dims: vocab.length, docs, vectors, vocab, idf,
    df: vocab.map((t) => df.get(t)) };
}

// Vectorise a free-text query against a built index. Returns the normalised
// vector plus the out-of-vocabulary terms (tfidf only; hashed has none,
// because every token hashes somewhere).
function vectoriseQuery(index, queryText) {
  const tokens = tokenize(queryText);
  if (index.method === "hashed") {
    const raw = new Array(HASH_DIMS).fill(0);
    for (const t of tokens) raw[hashBucket(t)] += 1;
    return { vector: normalise(raw), tokens, outOfVocabulary: [] };
  }
  const pos = new Map(index.vocab.map((t, i) => [t, i]));
  const raw = new Array(index.vocab.length).fill(0);
  const oov = [];
  for (const t of tokens) {
    if (pos.has(t)) raw[pos.get(t)] += 1;
    else if (!oov.includes(t)) oov.push(t);
  }
  for (let i = 0; i < raw.length; i++) raw[i] *= index.idf[i];
  return { vector: normalise(raw), tokens, outOfVocabulary: oov };
}

// Per-term (tfidf) or per-bucket (hashed) explanation of a score between a
// query-side vector and a document vector. Contributions always sum to the
// cosine score (up to floating-point rounding).
function explain(index, qVector, docIdx) {
  const dVector = index.vectors[docIdx];
  const out = [];
  for (let i = 0; i < index.vocab.length; i++) {
    const contribution = qVector[i] * dVector[i];
    if (contribution > 0) out.push({ term: index.vocab[i],
      queryWeight: qVector[i], docWeight: dVector[i], contribution });
  }
  out.sort((a, b) => b.contribution - a.contribution || (a.term < b.term ? -1 : 1));
  return out;
}
function explainHashed(index, qTokens, docIdx) {
  const dVector = index.vectors[docIdx];
  // Rebuild the query vector's raw counts so bucket membership is visible.
  const qRaw = new Array(HASH_DIMS).fill(0);
  for (const t of qTokens) qRaw[hashBucket(t)] += 1;
  const qVector = normalise(qRaw);
  const byBucketQ = new Map(), byBucketD = new Map();
  for (const t of qTokens) {
    const b = hashBucket(t);
    if (!byBucketQ.has(b)) byBucketQ.set(b, []);
    if (!byBucketQ.get(b).includes(t)) byBucketQ.get(b).push(t);
  }
  for (const t of index.docs[docIdx].tokens) {
    const b = hashBucket(t);
    if (!byBucketD.has(b)) byBucketD.set(b, []);
    if (!byBucketD.get(b).includes(t)) byBucketD.get(b).push(t);
  }
  const parts = [];
  for (let b = 0; b < HASH_DIMS; b++) {
    const contribution = qVector[b] * dVector[b];
    if (contribution > 0) parts.push({ bucket: b, queryWeight: qVector[b],
      docWeight: dVector[b], contribution,
      queryTerms: byBucketQ.get(b) || [], docTerms: byBucketD.get(b) || [] });
  }
  parts.sort((a, b) => b.contribution - a.contribution || a.bucket - b.bucket);
  return parts;
}

// Ranked cosine search. documents: [{ id, ... }] aligned with the index.
// Returns up to topK entries with score > 0 plus the zero-score count, and
// an exact explanation per hit.
function search(index, queryText, topK) {
  const q = vectoriseQuery(index, queryText);
  const limit = Math.max(1, Math.min(Number(topK) || 5, 50));
  const scored = index.docs.map((d, i) => ({ docIndex: i, docId: d.id,
    score: cosine(q.vector, index.vectors[i]) }));
  scored.sort((a, b) => b.score - a.score || a.docId - b.docId);
  const hits = scored.filter((s) => s.score > 1e-12).slice(0, limit).map((s) => ({
    docId: s.docId, score: s.score,
    explanation: index.method === "hashed"
      ? explainHashed(index, q.tokens, s.docIndex)
      : explain(index, q.vector, s.docIndex),
  }));
  return { queryTokens: q.tokens, outOfVocabulary: q.outOfVocabulary,
    hits, zeroScoreCount: scored.length - scored.filter((s) => s.score > 1e-12).length,
    scoredCount: scored.length };
}

// Pairwise comparison of two indexed documents, with the same style of
// explanation as search (the first document plays the query role).
function comparePair(index, idxA, idxB) {
  const score = cosine(index.vectors[idxA], index.vectors[idxB]);
  let explanation;
  if (index.method === "hashed") {
    explanation = explainHashed(index, index.docs[idxA].tokens, idxB);
  } else {
    explanation = explain(index, index.vectors[idxA], idxB);
  }
  const sharedTerms = (index.method === "tfidf"
    ? explanation.map((p) => p.term)
    : [...new Set(explanation.flatMap((p) => p.queryTerms.filter((t) => p.docTerms.includes(t))))]).sort();
  return { score, explanation, sharedTerms };
}

// Deterministic k-means over an index. labels (optional) align with the
// index documents and enable the purity figure.
function kmeans(index, k, labels) {
  const vectors = index.vectors;
  const N = vectors.length;
  const kk = Math.max(1, Math.min(Math.floor(Number(k) || 3), N || 1));
  if (N === 0) return { k: kk, assignments: [], clusters: [], trace: [],
    inertia: 0, silhouette: 0, purity: null, iterations: 0 };
  let centroids = vectors.slice(0, kk).map((v) => v.slice());
  let assignments = new Array(N).fill(0);
  let prev = null;
  const trace = [];
  let inertia = 0;
  for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
    assignments = vectors.map((v) => {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < kk; c++) { const d = dist2(v, centroids[c]); if (d < bestD) { bestD = d; best = c; } }
      return best;
    });
    inertia = 0;
    for (let i = 0; i < N; i++) inertia += dist2(vectors[i], centroids[assignments[i]]);
    trace.push({ iteration: iter, inertia });
    const same = prev && prev.every((a, i) => a === assignments[i]);
    if (same) break;
    prev = assignments.slice();
    if (iter === MAX_ITERATIONS) break;
    const sums = centroids.map((c) => new Array(c.length).fill(0));
    const counts = new Array(kk).fill(0);
    vectors.forEach((v, i) => { const c = assignments[i]; counts[c]++;
      for (let j = 0; j < v.length; j++) sums[c][j] += v[j]; });
    centroids = centroids.map((c, ci) => counts[ci] === 0 ? c : sums[ci].map((s) => s / counts[ci]));
  }
  // Silhouette (Euclidean, standard formula; singletons score 0).
  let silhouette = 0;
  if (kk > 1 && N > kk) {
    const D = vectors.map((a) => vectors.map((b) => Math.sqrt(dist2(a, b))));
    let total = 0;
    for (let i = 0; i < N; i++) {
      const own = [], other = new Map();
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        if (assignments[j] === assignments[i]) own.push(D[i][j]);
        else { if (!other.has(assignments[j])) other.set(assignments[j], []); other.get(assignments[j]).push(D[i][j]); }
      }
      if (own.length === 0) continue; // singleton: s(i) = 0
      const a = own.reduce((s, v) => s + v, 0) / own.length;
      let b = Infinity;
      for (const arr of other.values()) b = Math.min(b, arr.reduce((s, v) => s + v, 0) / arr.length);
      if (!isFinite(b) || Math.max(a, b) === 0) continue;
      total += (b - a) / Math.max(a, b);
    }
    silhouette = total / N;
  }
  // Clusters with top terms and (when labelled) majority label + purity.
  let purity = null;
  if (labels && labels.length === N) {
    let correct = 0;
    for (let c = 0; c < kk; c++) {
      const counts = {};
      assignments.forEach((a, i) => { if (a === c && labels[i]) counts[labels[i]] = (counts[labels[i]] || 0) + 1; });
      correct += Math.max(0, ...Object.values(counts));
    }
    purity = N ? correct / N : 0;
  }
  const clusters = [];
  for (let c = 0; c < kk; c++) {
    const members = [];
    assignments.forEach((a, i) => { if (a === c) members.push(i); });
    let topTerms;
    if (index.method === "tfidf" && members.length) {
      const mean = new Array(index.vocab.length).fill(0);
      for (const i of members) for (let j = 0; j < mean.length; j++) mean[j] += index.vectors[i][j];
      topTerms = index.vocab.map((term, j) => ({ term, weight: mean[j] / members.length }))
        .filter((x) => x.weight > 0)
        .sort((a, b) => b.weight - a.weight || (a.term < b.term ? -1 : 1)).slice(0, 5);
    } else {
      const counts = new Map();
      for (const i of members) for (const t of index.docs[i].tokens) counts.set(t, (counts.get(t) || 0) + 1);
      topTerms = [...counts.entries()].map(([term, count]) => ({ term, count }))
        .sort((a, b) => b.count - a.count || (a.term < b.term ? -1 : 1)).slice(0, 5);
    }
    const labelCounts = {};
    if (labels) for (const i of members) if (labels[i]) labelCounts[labels[i]] = (labelCounts[labels[i]] || 0) + 1;
    const majorityLabel = Object.keys(labelCounts).length
      ? Object.entries(labelCounts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0] : null;
    clusters.push({ index: c, size: members.length,
      memberDocIds: members.map((i) => index.docs[i].id),
      topTerms, labelCounts, majorityLabel });
  }
  return { k: kk, assignments: index.docs.map((d, i) => ({ docId: d.id, cluster: assignments[i],
      distance: Math.sqrt(dist2(vectors[i], centroids[assignments[i]])) })),
    clusters, trace, inertia, silhouette, purity, iterations: trace.length };
}

// Term table for one index: term, document frequency and idf (tfidf), or
// bucket and document frequency (hashed).
function vocabulary(index) {
  if (index.method === "hashed") {
    const per = new Map();
    for (const d of index.docs) {
      const seen = new Set();
      for (const t of d.tokens) {
        const b = hashBucket(t);
        if (!per.has(t)) per.set(t, { term: t, bucket: b, docs: 0 });
        if (!seen.has(t)) { per.get(t).docs++; seen.add(t); }
      }
    }
    return [...per.values()].sort((a, b) => b.docs - a.docs || (a.term < b.term ? -1 : 1));
  }
  return index.vocab.map((term, i) => ({ term, docs: index.df[i], idf: index.idf[i] }))
    .sort((a, b) => b.idf - a.idf || (a.term < b.term ? -1 : 1));
}

// Non-zero terms of one document's vector, strongest first (detail views).
function documentTerms(index, docIdx) {
  if (index.method === "hashed") {
    const v = index.vectors[docIdx];
    const byBucket = new Map();
    for (const t of index.docs[docIdx].tokens) {
      const b = hashBucket(t);
      if (!byBucket.has(b)) byBucket.set(b, []);
      if (!byBucket.get(b).includes(t)) byBucket.get(b).push(t);
    }
    return [...byBucket.entries()]
      .map(([bucket, terms]) => ({ bucket, terms, weight: v[bucket] }))
      .filter((x) => x.weight > 0)
      .sort((a, b) => b.weight - a.weight || a.bucket - b.bucket);
  }
  const v = index.vectors[docIdx];
  return index.vocab.map((term, i) => ({ term, weight: v[i], idf: index.idf[i] }))
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.weight - a.weight || (a.term < b.term ? -1 : 1));
}

module.exports = { tokenize, fnv1a, hashBucket, buildIndex, vectoriseQuery,
  search, comparePair, kmeans, vocabulary, documentTerms, cosine,
  HASH_DIMS, MAX_ITERATIONS };
