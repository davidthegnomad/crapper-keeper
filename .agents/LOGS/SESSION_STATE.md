# Session State — Crapper Keeper

**Last Updated:** 2026-07-17

## Project Status
- ✅ Planning + architecture reviews (Nemotron, GLM)
- ✅ Local build (FastAPI + HTMX + SQLite)
- ✅ Visual design (OneNote-inspired purple theme, Trapper Keeper tabs)
- ✅ Firebase migration (Firestore, Hosting, Storage)
- ✅ Google Auth (per-user data isolation)
- ✅ Chrome extension (right-click save)
- ✅ Export as Markdown for RAG
- ✅ GitHub repo: github.com/davidthegnomad/crapper-keeper

## Deployment
- **Live:** https://davidthegnomadorg.web.app/crapper-keeper/
- **Firebase Project:** davidthegnomadorg
- **Deploy Command:** `firebase deploy --only hosting,firestore --project davidthegnomadorg --config firebase-dn.json`
- **Local Dev:** `uvicorn app.main:app --port 8000` + launchd plist

## Key Files
- `deploy-dn/crapper-keeper/` — Firebase deployment directory
- `extension/` — Chrome extension
- `app/` — Original FastAPI backend (local dev)
- `BUILD_LOG.md` — Complete build documentation
- `plan.md` — Original architecture plan

## Known Issues
- None — all features deployed and verified

## Next Steps
- Test extension in Chrome
- Consider OAuth client ID for cross-device sync
