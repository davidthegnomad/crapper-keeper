# Crapper Keeper — Brand Assets

**Tagline:** Get your 💩 together.

Gnomad Studio vaporwave pack for the webapp + Chrome extension. Motifs: **gnomes, mushrooms, llamas** on neon magenta / cyan / violet (matched to `.google/vaporwave_mac_wallpaper.png`).

> Store listing copy tip: use the tagline in the short description; images already say “Notes for gnomads” / similar — leave art as-is.

## Palette

| Token | Hex (approx) | Use |
|-------|--------------|-----|
| Magenta neon | `#ff2bd6` | Titles, glow |
| Cyan grid | `#00e5ff` | Accents, outlines |
| Deep violet | `#2a0a4a` / `#4b1d7a` | Backgrounds |
| Striped sun | `#ff7a3d` → `#ff4db8` | Horizon accents |
| Brand purple (app UI) | `#80397b` | Existing webapp chrome |

## Folder map

```
brand/
├── source/          # Master generated art (keep these)
│   ├── icon-gnome-notebook.png   # Primary character icon
│   ├── icon-mushroom.png         # Simple mushroom (tiny sizes)
│   ├── promo-marquee.png
│   ├── promo-tile.png
│   ├── feature-graphic.png
│   └── og-share.png
├── icons/           # Extension toolbar sizes (16 / 48 / 128)
├── store/           # Chrome Web Store + Play/App sizes
└── webapp/          # Favicon, PWA, OG share
```

## Store checklist (Chrome Web Store)

| Asset | File | Size |
|-------|------|------|
| Store icon | `store/chrome-store-icon-128.png` | 128×128 |
| Small promo | `store/chrome-small-promo-440x280.png` | 440×280 |
| Large promo | `store/chrome-large-promo-920x680.png` | 920×680 |
| Marquee | `store/chrome-marquee-1400x560.png` | 1400×560 |

Also ready: `store/app-icon-1024.png`, `store/play-icon-512.png`, `store/play-feature-graphic.png`.

## Wired into product

- Extension icons → `extension/icons/` (reload unpacked extension to see them)
- Webapp icons → `deploy-dn/crapper-keeper/icons/` (+ favicon / OG meta in `index.html`)

## Regen notes

Generated with Cursor image gen from the vaporwave wallpaper reference (`agy` / FA.AI / gnomadgaming FLUX were unavailable on this Mac). To regenerate later:

```bash
# Prefer local FLUX when gnomadgaming is up:
ssh gnomad@gnomadgaming 'cd /mnt/SteamDrive/ORGANIZATION && python3 scripts/context-stack/image-gen.py --profile flux --width 1024 --height 1024 "…"'

# Or add FAL_KEY to .env and use fal.ai when configured.
```
