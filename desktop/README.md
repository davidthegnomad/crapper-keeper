# Crapper Keeper — Desktop

Thin Electron window around the live web app:

https://davidthegnomadorg.web.app/crapper-keeper/

Markdown / HTML-HTMX always match hosting.

## Run (this Mac)

```bash
npm run desktop
```

## Installers

| Platform | Command | Output |
|----------|---------|--------|
| macOS Apple Silicon | `npm run desktop:mac` | `dist-desktop/CrapperKeeper-*-arm64.dmg` |
| Windows x64 | `npm run desktop:win` | `dist-desktop/CrapperKeeper-Setup-*.exe` |

GitHub Actions (`.github/workflows/desktop-release.yml`) builds both on tag `v*` and attaches them to the GitHub Release.

Unsigned Mac: first launch is **right-click → Open** (Gatekeeper).
