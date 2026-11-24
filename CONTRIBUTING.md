# Contributing to VectorLab

Thank you for your interest in contributing to **VectorLab**, an open-source transparent vector search and deterministic clustering playground designed and maintained by **SPManchester Private Limited**.

We welcome contributions from machine learning practitioners, search engineers, educators, and software architects worldwide.

---

## 1. Guiding Principles & Architectural Philosophy

Before writing code or opening a pull request, please review our core architectural invariants:

1. **Zero External Runtime Dependencies:** The core product runs exclusively on Node.js built-ins (`node:http`, `node:sqlite`, `node:crypto`). Do not introduce external npm runtime packages.
2. **Deterministic Vector Mathematics:** The engine is purely deterministic. Given an identical collection, vectoriser, and parameters, it must always produce the exact same scores, rankings, cluster assignments, and inertia traces. Random seeds or stochastic centroid updates are strictly forbidden.
3. **Exact Explainability:** Similarity scores must be completely transparent. Every cosine score must reconcile with its component sum (term-level contributions for TF-IDF, bucket-level token mappings for hashed representations).
4. **Offline Verifiability:** The test suite and fixtures must remain operable offline without external API connections or hosted embeddings.

---

## 2. Getting Started & Development Setup

### Prerequisites
- **Node.js**: Version 22.5.0 or later (uses native `node:sqlite`).
- **Git**: Version 2.30+.

### Local Setup
```bash
# Clone the repository
git clone https://github.com/serviceprovidermanchester/SPM-Aidev-VectorLab-Agent.git
cd SPM-Aidev-VectorLab-Agent

# Verify code syntax
npm run check

# Start the local development server (port 4000)
npm start

# Run the 42-check deterministic test suite in a separate terminal
npm test
```

---

## 3. Contribution Workflow

### Branch Naming Conventions
Create a dedicated feature branch from `main`:
- `feat/vectoriser-name` — New vectorisation techniques or representations
- `fix/clustering-stability` — Algorithmic bug fixes or edge case handling
- `docs/clarify-idf-formula` — Documentation, guides, or tutorials
- `perf/engine-tokenisation` — Algorithmic performance enhancements without breaking determinism
- `test/fixture-expansion` — Additional hand-verifiable test fixtures

### Commit Message Guidelines
We follow standard Conventional Commits:
- `feat: add sublinear tf scaling option`
- `fix: resolve tie-breaking edge case in silhouette computation`
- `docs: update API documentation for cluster detail endpoint`
- `test: introduce 12-document cross-validation fixture`
- `perf: optimize sparse vector dot product calculation`

---

## 4. Testing & Quality Requirements

Every pull request must pass the automated verification suite before being considered for merge:

```bash
node tests/run-tests.js
```

### Verification Criteria:
- **100% Pass Rate:** All 42 checks must pass cleanly.
- **Fixture Invariants:** Labelled fixture outputs (VL-01 through VL-14) must retain their exact mathematical outputs (e.g. TF-IDF "dentist implant" score of `0.798218`, k-means inertia trace `4.857128 -> 3.140236`, silhouette `0.285154`).
- **Cross-Platform Compatibility:** Logic must work consistently across Linux, macOS, and Windows.

---

## 5. Submitting a Pull Request (PR)

1. Ensure your local branch is rebased on the latest `main`.
2. Verify all tests pass locally.
3. Open a pull request using the provided PR template.
4. Provide a clear technical explanation of changes, algorithmic rationale, and mathematical proofs if introducing formula updates.
5. Our engineering team at **SPManchester Private Limited** will review your PR within 2–3 business days.

---

## 6. Questions & Contact

For questions about technical roadmaps, architecture, or commercial customisations, reach out to the SPManchester engineering team:
- **Lead Maintainer:** Sayed Mudassar Akbar
- **Corporate Website:** [spmanchester.com](https://www.spmanchester.com)
- **Email Inquiries:** [info@spmanchester.com](mailto:info@spmanchester.com)
