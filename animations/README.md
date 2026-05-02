# MDB — Animations Reel face cam

Séquences PNG transparentes pour montage CapCut, alignées sur la palette MDB (avril 2026).

## Specs
- **Format** : 1080 × 1920 (Reel vertical)
- **FPS** : 60
- **Durée vidéo source** : 1min20s
- **Sortie** : séquences PNG numérotées avec fond transparent

## Structure
```
animations/
├── src/              # HTML + CSS + JS de chaque animation
├── renderer/         # Scripts Puppeteer pour rendre PNG
└── output/           # Frames PNG (générées, pas versionnées)
```

## Usage
```bash
npm install
npm run render -- --src=03_fil.html --out=03_fil
```

## Animations prévues
| # | Moment | Durée | Frames |
|---|---|---|---|
| 1 | Intro "ce que je vois en consultation" | 4s | 240 |
| 2 | Liste métiers (avocates, médecins…) | 5s | 300 |
| 3 | Citation "je tiens avec un fil" + "Un fil." | 5s | 300 |
| 4 | "24h/24" compteur | 5s | 300 |
| 5 | Mots effondrement (dépression, burnout…) | 5s | 300 |
| 6 | "C'est quand." | 3s | 180 |
| 7 | Punchline finale | 5s | 300 |
| 8 | Logo orbe MDB (loop) | 2s | 120 |

## Palette
- Ivoire `#F5F0E8`
- Brun-noir `#1A1410`
- Ambre `#C86030`
- Or `#C9A84C`
- Mauve `#9A8090`
