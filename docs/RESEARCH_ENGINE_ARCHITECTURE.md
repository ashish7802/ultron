# ULTRON Research & Verification Engine
## Batch 01: Research Foundation, Planning, Discovery & Evidence Extraction Architecture

**System**: ULTRON — Advanced AI Co-Founder  
**Subsystem**: Autonomous Knowledge & Research Intelligence  
**Implementation Date**: November 11, 2026  
**Status**: Batch 01 Implemented (Modules 01, 02, 03 Operational; Modules 04–12 Deferred to Subsequent Batches)

---

## 1. Executive Overview

Batch 01 delivers the production foundation for ULTRON's **Research & Verification Engine**, as outlined in the *ULTRON Advanced AI Co-Founder Blueprint*.

Prior to Batch 01, ULTRON had single-pass keyword search through DuckDuckGo and simple HTML text scraping. Batch 01 establishes a multi-tier, structured research pipeline that:
1. **Understands and plans research before searching**: Analyzes intent, topics, problem statements, expected outcomes, scope, and resource budgets.
2. **Conducts multi-provider information discovery**: Concurrently discovers sources across public web, GitHub repositories, arXiv academic papers, workspace internal documentation, and ULTRON's persistent memory vault.
3. **Extracts traceable evidence**: Ingests accessible sources, identifies atomic claims, extracts structured facts and technical specifications, preserves exact verbatim supporting passages with character offsets, and creates explicit relational links between claims and evidence.

---

## 2. Core Architecture & Implemented Modules

```
                                USER RESEARCH REQUEST
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                     MODULE 01: RESEARCH PLANNING ENGINE                           |
|  - Research Intent Detection (11 categories)                                      |
|  - Topic, Problem Statement & Expected Outcome Formulation                        |
|  - Explicit Requirements vs Inferred Assumptions Separation                       |
|  - Research Scope Definition (Included / Excluded Subtopics)                      |
|  - Question Decomposition & Dependency Mapping                                    |
|  - Required Evidence Categorization (Official Docs, Specs, Papers, Benchmarks)    |
|  - Research Depth Selection (Quick, Standard, Deep, Comprehensive)                |
|  - Executable Search Strategy Generation (Primary & Alternative Queries, Domains) |
|  - Measurable Completion Criteria Formulation                                     |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
                                STRUCTURED RESEARCH PLAN
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                    MODULE 02: INFORMATION DISCOVERY ENGINE                        |
|  - 6-Tier Credibility Priority Policy (Official Docs > Papers > GitHub > ...)     |
|  - Modular Provider Adapters:                                                     |
|      1. LiveWebSearchAdapter (Public DuckDuckGo API)                              |
|      2. GitHubDiscoveryAdapter (Public GitHub REST Search)                        |
|      3. AcademicDiscoveryAdapter (arXiv Public XML/Atom API)                      |
|      4. InternalDocumentAdapter (Local Workspace Docs & Specs)                   |
|      5. AdvancedMemoryAdapter (Persistent AES-256-GCM Memory Vault)              |
|  - URL Normalization & SHA-256 Deduplication Hashing                              |
|  - Failure Isolation & Timeout Safety                                             |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
                              NORMALIZED DISCOVERY RESULTS
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                MODULE 03: EVIDENCE COLLECTION & EXTRACTION ENGINE                 |
|  - Content Ingestion (HTML, Markdown, Plain-Text, Memory Records)                 |
|  - SSRF Protection & Resource Bounding (2MB cap, private subnet blocking)         |
|  - Duplicate Detection (Canonical URL & Text Hash Comparison)                     |
|  - Atomic Claim Identification (Subject, Predicate, Object, Qualifier)            |
|  - Structured Fact Extraction (Versions, Latency Metrics, Ports)                  |
|  - Technical Specification Extraction (RAM, Hardware, OS, Protocol)              |
|  - Temporal & Version Date Tracking (Publication Date vs Access Timestamp)        |
|  - Verbatim Supporting Passage Storage (Exact text, offsets, headings)            |
|  - Many-to-Many Evidence-to-Claim Mapping                                         |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
                         TRANSACTIONAL DATA PERSISTENCE
             (PostgreSQL/Supabase Migration + Local Encrypted Vault)
                                          |
                                          v
                        STRUCTURED RESEARCH DOSSIER
                  [Clean Boundary for Module 04 & Module 05]
```

---

## 3. Detailed Module Specifications

### Module 01: Research Planning Engine (`lib/research/planningEngine.ts`)
- **Intent Detection**: Analyzes natural language inquiries and classifies them into 11 categories:
  - `technical_research`, `product_research`, `technology_comparison`, `architecture_research`, `market_research`, `academic_research`, `problem_investigation`, `business_decision_research`, `documentation_research`, `current_information_research`, `general_knowledge_research`.
- **Topic & Problem Understanding**: Extracts core subject, formats professional title, formulates explicit problem statements, and articulates expected deliverables.
- **Scope & Assumptions**: Distinguishes user's explicit non-negotiables (e.g. "zero cost", "offline", "no paid cloud") from AI-inferred assumptions.
- **Decomposition**: Decomposes inquiries into orthogonal sub-questions with assigned priorities (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), prerequisite dependencies, and flags for `requiresCurrentInfo` and `requiresOfficialDocs`.
- **Search Strategy**: For every sub-question, generates targeted primary queries, boolean/synonym alternatives, authoritative official domains (e.g., `postgresql.org`, `nextjs.org`, `python.org`), and date bounds.
- **Completion Criteria**: Formulates verifiable criteria to prevent premature termination or scope creep.

### Module 02: Information Discovery Engine (`lib/research/discoveryEngine.ts`)
- **Source Priority Policy**: Strictly enforces the blueprint's 6-tier credibility hierarchy:
  1. *Tier 1*: Official documentation, primary source specifications, internal documents, local memory.
  2. *Tier 2*: Original research papers (arXiv) and technical standards (RFCs, W3C, IEEE).
  3. *Tier 3*: Official GitHub repositories, release tags, and API schemas.
  4. *Tier 4*: Reputable engineering publications and news releases.
  5. *Tier 5*: Credible independent analysis and benchmarks.
  6. *Tier 6*: Community discussions and forums (signals only, not facts).
- **Pluggable Adapter Interface**: `SearchProviderAdapter` allows modular addition of discovery backends with health checks, error isolation, and standardized schemas.
- **Canonical Normalization**: Cleans URLs by stripping UTM telemetry parameters, session tokens, and fragments to compute stable SHA-256 hashes.

### Module 03: Evidence Collection & Extraction Engine (`lib/research/evidenceEngine.ts`)
- **Content Collection**: Retrieves accessible content across HTML pages, Markdown files, and memory records. Cleans HTML DOM by stripping scripts, styles, navigation bars, headers, footers, and active tags.
- **Atomic Claim Extraction**: Extracts testable, verifiable statements with extracted `subject`, `predicate`, `objectValue`, and `contextQualifier`.
- **Structured Fact Extraction**: Parses version numbers (`v1.2.3`), performance timings (`0.4ms`), hardware requirements (`16GB RAM`), and network ports.
- **Verbatim Passage Preservation**: Preserves exact source paragraphs with character start/end offsets, section headings, and content hashes.
- **Evidence-to-Claim Mapping**: Connects claims to supporting evidence passages via `ClaimEvidenceLink` records with relevance scoring.

---

## 4. Shared Data Architecture

### Database Schema (`supabase/migrations/20261111000001_research_and_verification_foundation.sql`)
The PostgreSQL/Supabase migration implements the 6 foundational research tables with strict foreign keys, indexes, check constraints, and Row-Level Security (RLS) policies:
1. `research_projects`: Stores project metadata, objectives, intent, depth, scope, constraints, and status.
2. `research_queries`: Stores decomposed sub-questions, search objectives, queries, priorities, and execution status.
3. `sources`: Stores discovered source metadata, canonical URLs, SHA-256 URL hashes, publisher info, and retrieval status.
4. `evidence`: Stores verbatim passages, chunk indices, character offsets, section headings, and content hashes.
5. `claims`: Stores atomic factual claims, subjects, predicates, objects, and extraction confidence.
6. `claim_evidence_links`: Many-to-many junction table binding claims to evidence passages with relevance scores.

### Dual-Mode Persistence Layer (`lib/research/repository.ts`)
- **Cloud / Production Mode**: Direct schema compliance with PostgreSQL / Supabase.
- **Local Desktop Offline Mode**: Transactional, atomic disk-persisted vault (`ultron_research_vault.json`) using authenticated AES-256-GCM encryption with platform CSPRNG keys, backup rotation, and crash resilience.

---

## 5. API Contracts & Service Integration

### 1. `POST /api/research/plan`
Generates and persists a structured Research Plan.
- **Input**:
  ```json
  {
    "query": "Research the best memory architecture for ULTRON",
    "depth": "standard",
    "constraints": ["Must run locally on Windows 11", "Zero cloud subscription cost"],
    "exclusions": ["Paid hosted SaaS memory APIs"]
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "research_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "plan": { ... }
  }
  ```

### 2. `POST /api/research/discover`
Executes multi-source discovery across configured adapters for a given plan.
- **Input**:
  ```json
  {
    "plan": { ... }
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "research_id": "...",
    "sourcesCount": 12,
    "sources": [ ... ]
  }
  ```

### 3. `POST /api/research/extract`
Collects content from discovered sources and extracts claims, facts, specs, and evidence links.
- **Input**:
  ```json
  {
    "projectId": "...",
    "sources": [ ... ]
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "projectId": "...",
    "sourcesProcessed": 12,
    "evidencePassagesCount": 38,
    "claimsCount": 24,
    "linksCount": 24
  }
  ```

### 4. `GET /api/research/project/[id]`
Retrieves the complete relational dossier (project, queries, sources, evidence, claims, links) by UUID.

### 5. `POST /api/research`
Unified entrypoint supporting both:
- **Batch 01 V2 Pipeline Mode**: Triggered when `engine: "v2"`, `pipeline: true`, or `depth` is passed. Executes Planning -> Discovery -> Extraction -> Persistence in one atomic run. Supports both JSON and SSE streaming (`stream: true`).
- **Legacy Quantum Mode**: Fully backward-compatible for existing CLI and test callers.

---

## 6. Implementation Checklist & Status

| Module | Feature | Implementation File | Status |
|---|---|---|---|
| **Module 01** | Research Intent Detection (11 categories) | `lib/research/planningEngine.ts` | **Implemented** |
| **Module 01** | Topic & Problem Understanding | `lib/research/planningEngine.ts` | **Implemented** |
| **Module 01** | Scope Definition & Boundary Setting | `lib/research/planningEngine.ts` | **Implemented** |
| **Module 01** | Main Question Decomposition & DAG | `lib/research/planningEngine.ts` | **Implemented** |
| **Module 01** | Sub-Question Generation & Priorities | `lib/research/planningEngine.ts` | **Implemented** |
| **Module 01** | Required Evidence Identification | `lib/research/planningEngine.ts` | **Implemented** |
| **Module 01** | Research Depth Calibration (4 tiers) | `lib/research/planningEngine.ts` | **Implemented** |
| **Module 01** | Search Strategy Generation | `lib/research/planningEngine.ts` | **Implemented** |
| **Module 01** | Resource Constraints & Zero-Cost Guardrails | `lib/research/planningEngine.ts` | **Implemented** |
| **Module 01** | Verifiable Completion Criteria | `lib/research/planningEngine.ts` | **Implemented** |
| **Module 02** | Live Web Search Adapter | `lib/research/discoveryEngine.ts` | **Implemented** |
| **Module 02** | GitHub Repository Discovery Adapter | `lib/research/discoveryEngine.ts` | **Implemented** |
| **Module 02** | Academic Paper Discovery Adapter (arXiv) | `lib/research/discoveryEngine.ts` | **Implemented** |
| **Module 02** | Internal Document Discovery Adapter | `lib/research/discoveryEngine.ts` | **Implemented** |
| **Module 02** | Advanced Memory Retrieval Adapter | `lib/research/discoveryEngine.ts` | **Implemented** |
| **Module 02** | 6-Tier Credibility Priority Policy | `lib/research/discoveryEngine.ts` | **Implemented** |
| **Module 02** | Normalized Discovery Output Schema | `lib/research/discoveryEngine.ts` | **Implemented** |
| **Module 02** | Canonical URL Normalization & Hashing | `lib/research/discoveryEngine.ts` | **Implemented** |
| **Module 03** | Relevant Content Collection & DOM Cleaning | `lib/research/evidenceEngine.ts` | **Implemented** |
| **Module 03** | Atomic Claim Identification | `lib/research/evidenceEngine.ts` | **Implemented** |
| **Module 03** | Structured Fact Extraction | `lib/research/evidenceEngine.ts` | **Implemented** |
| **Module 03** | Technical Specification Extraction | `lib/research/evidenceEngine.ts` | **Implemented** |
| **Module 03** | Temporal & Version Date Tracking | `lib/research/evidenceEngine.ts` | **Implemented** |
| **Module 03** | Exact Verbatim Passage Storage & Offsets | `lib/research/evidenceEngine.ts` | **Implemented** |
| **Module 03** | Duplicate Source & Content Hash Detection | `lib/research/evidenceEngine.ts` | **Implemented** |
| **Module 03** | Evidence-to-Claim Relational Mapping | `lib/research/evidenceEngine.ts` | **Implemented** |
| **Data Layer** | PostgreSQL / Supabase Migration (6 tables, RLS) | `supabase/migrations/*` | **Implemented** |
| **Data Layer** | Shared AES-256-GCM Repository | `lib/research/repository.ts` | **Implemented** |
| **Pipeline** | Unified Research Orchestrator | `lib/research/orchestrator.ts` | **Implemented** |
| **API Layer** | Next.js Endpoints (`plan`, `discover`, `extract`, `project`) | `app/api/research/*` | **Implemented** |

---

## 7. Security & Sandboxing Boundaries

1. **Read-Only Discovery**: All web, API, GitHub, and academic requests are strictly read-only HTTP GET requests. No state modification or write requests are issued.
2. **SSRF Filtering**: Targets resolving to `localhost`, `127.0.0.1`, RFC1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), or cloud metadata endpoints (`169.254.169.254`) are rejected before transmission.
3. **DOM Sanitization**: Ingested HTML documents have `<script>`, `<style>`, `<iframe>`, and event handlers stripped prior to parsing to prevent code injection.
4. **Data Encryption at Rest**: The local persistence vault encrypts all stored research projects, queries, sources, evidence, claims, and links using AES-256-GCM.
5. **No Hardcoded Secrets**: Adapters access public APIs without hardcoded tokens. If optional credentials (e.g. `GITHUB_TOKEN`) are configured in the environment, they are utilized; otherwise, adapters gracefully execute unauthenticated public requests.

---

## 8. Clean Boundaries for Subsequent Batches

The following modules remain strictly out of scope for Batch 01 and will be implemented in subsequent batches:
- **Module 04**: Source Reliability & Quality Engine (Evaluation of domain credibility, bias, author authority, and content freshness).
- **Module 05**: Claim Verification Engine (Epistemic stance checking, multi-source verification, contradiction detection).
- **Module 06**: Cross-Source Comparison & Contradiction Engine.
- **Module 07**: Research Analysis & Intelligence Engine.
- **Module 08**: Freshness & Revalidation Engine.
- **Module 09**: Research Report Generator.
- **Module 10**: Advanced Memory Deep Ingestion.
- **Module 11**: Research Safety & Integrity Engine.
- **Module 12**: Final Security, Testing & End-to-End Certification.

The output contract of `ResearchPipelineResult` explicitly leaves `boundaryForFutureModules.sourceReliabilityPending = true` and `boundaryForFutureModules.claimVerificationPending = true` to allow seamless integration into Module 04 and Module 05.
