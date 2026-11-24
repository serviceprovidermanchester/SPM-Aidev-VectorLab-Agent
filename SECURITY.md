# Security Policy

At **SPManchester Private Limited**, security and data integrity are central to our software architecture. VectorLab is built with security-first engineering practices, including parameterised data operations, strict multi-tenant workspace isolation, and zero third-party runtime dependencies.

---

## 1. Supported Versions

We provide active security updates, vulnerability patches, and bug fixes for the current release series:

| Version | Status | Supported Until |
| :--- | :--- | :--- |
| **1.x** | **Active Support** | **December 2027** |
| < 1.0 | Deprecated | Not Supported |

---

## 2. Architectural Security Controls

VectorLab includes the following built-in defensive measures:
- **Zero Third-Party Dependency Risk:** Eliminates supply chain attacks, lockfile poisoning, and transitive dependency vulnerabilities by relying solely on audited Node.js standard library modules.
- **Strict Tenant Data Scoping:** Every domain query is scoped by `workspace_id`. Cross-workspace resource queries return HTTP 404 rather than disclosing existence.
- **Role-Based Access Control (RBAC):** Content deletion and system parameter configuration are restricted to owner accounts (staff receive HTTP 403).
- **Cryptographic Security:** Passwords are saved with salted `scrypt` hashing via `node:crypto`. Session authentication uses 32-byte cryptographically generated random tokens.
- **SQL Injection Prevention:** 100% of SQLite database queries use parameterized prepared statements.

---

## 3. Reporting a Vulnerability

If you discover a potential security flaw or vulnerability within VectorLab:

1. **Do NOT open a public GitHub issue.**
2. Send an email immediately to **[info@spmanchester.com](mailto:info@spmanchester.com)** with the subject:
   `[SECURITY DISCLOSURE] VectorLab Potential Vulnerability`.
3. Please include in your report:
   - A description of the vulnerability and its potential impact.
   - Step-by-step reproduction instructions or a minimal proof of concept (PoC).
   - Affected system versions, operating systems, and configurations.
   - Any proposed remediation or mitigation steps.

---

## 4. Vulnerability Response Timeline

Our security team adheres to the following service-level objectives:
- **Initial Acknowledgment:** Within **24–48 hours** of report receipt.
- **Triage & Validation:** Within **72 hours**, confirming severity and affected components.
- **Patch Development:** Within **7 to 14 days** depending on complexity.
- **Coordinated Public Advisory:** Issued following patch deployment, crediting the reporter if desired.

---

## 5. Security Inquiries

For enterprise compliance questions, security reviews, or custom secure deployment assistance:
- **Company:** SPManchester Private Limited
- **Web:** [spmanchester.com](https://www.spmanchester.com)
- **Email:** [info@spmanchester.com](mailto:info@spmanchester.com)
