# Chronicler Protocol — Crapper Keeper

## Purpose
Automatically record session activity, decisions, and state changes for the Crapper Keeper project. The agent reads this file at session start and appends at session end.

## Session State
- **Current Phase:** Native configuration + device testing
- **Last Deploy:** 2026-08-14 — davidthegnomadorg.web.app/crapper-keeper/ (v1.2.0 Markdown + HTML/HTMX)
- **Open Issues:** Apple provider config, Android signing SHAs/toolchain, iOS runtime
- **Next Steps:** Complete native config, run device matrix, submit TestFlight and Play internal builds

## How to Use
The agent should:
1. At session start: read `SESSION_STATE.md` for context
2. During session: note significant decisions, errors fixed, files changed
3. At session end: update SESSION_STATE.md + append to LEARNING_LOG.md

## File Structure
```
.agents/
├── CHRONICLER.md        # This file — protocol definition
├── LOGS/
│   ├── SESSION_STATE.md  # Current state (read at start, updated at end)
│   └── LEARNING_LOG.md   # Discoveries, fixes, patterns worth preserving
└── SKILLS/              # Reusable patterns extracted from sessions
```

## Commit Convention
```
feat: description       # New feature
fix: description        # Bug fix
docs: description       # Documentation
deploy: description     # Deployment
refactor: description   # Code restructuring
```
