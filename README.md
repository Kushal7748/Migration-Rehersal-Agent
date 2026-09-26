# MIGR8 — Autonomous Zero-Downtime Migration Rehearsal Agent

> **Zero-Risk Database Migrations powered by AI Rehearsals, Lock-Time Critic Loops & Cryptographic Guardrails.**

---

## 🚀 The Core Problem
Database migrations on high-concurrency production systems carry high operational risks: exclusive lock contention causing outages, unindexed queries, data loss, and silent verification failures. Manual reviews fail to simulate dynamic lock contention under production load.

---

## ⚡ What is MIGR8?
**MIGR8** is an autonomous AI agent system that acts as a dry-run safety barrier. Before any SQL migration touches production, MIGR8 branches your schema, runs load-simulated rehearsals on isolated Neon shadow databases, evaluates lock times via an AI Critic, dynamically rewrites unsafe migrations (e.g., chunked batching), and enforces cryptographic human-in-the-loop signoff.

---

## 🔄 End-to-End Autonomous Workflow

```
SQL DDL → Discovery → Risk Engine → AI Planner → Neon Shadow Branch Rehearsal 
                                                             │
  [ APPROVED ] ◄── Human Sign-off ◄── Evidence Pack ◄── Pass/Replan Critic Loop
       │
 Production Execution → Post-Migration AI Verification
```

1. **Schema Discovery & Inspection**: Extracts ASTs, constraints, and index graphs from live databases.
2. **Deterministic Risk Evaluation**: Static SQL analysis flags dangerous locks (`ALTER TABLE ADD COLUMN NOT NULL DEFAULT`).
3. **AI Planning & Critic Loop**: Multi-model LLM router (GPT-4o / Claude 3.5 / Ollama) generates chunked execution plans.
4. **Neon Branch Rehearsal**: Clones production schema instantaneously to run simulated write loads and measure exact lock duration (`< 2000ms` target threshold).
5. **Auto-Replanning**: If rehearsal exceeds lock boundaries, the Critic automatically rewrites queries into non-blocking batches.
6. **Evidence Pack & Cryptographic Approval**: Generates tamper-proof cryptographic tokens and risk reports for human signoff.
7. **Zero-Downtime Execution & Verification**: Executes validated SQL and verifies data consistency post-run.

---

## 🛠 Tech Stack
- **AI Infrastructure**: Unified Multi-Model LLM Router, Fastify Agent Runtime
- **Backend & Database**: TypeScript, PostgreSQL, Neon Branching API, Prisma
- **Frontend**: React, Vite, Dynamic Architecture Canvas dashboard