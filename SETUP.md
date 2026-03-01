# Setup Guide — NeuroChess

## Requirements

| Requirement | Notes |
|---|---|
| Modern browser | Chrome 90+, Firefox 88+, Safari 14+, Edge 90+ |
| Git | For cloning the repository |
| GitHub CLI (`gh`) | Optional — only needed to push changes |

No Node.js, no npm, no build tools required.

## Local Development

### 1. Clone the repository

```bash
git clone https://github.com/VignirS/NeuroChess.git
cd NeuroChess
```

### 2. Open in the browser

```bash
# macOS
open index.html

# Linux
xdg-open index.html

# Windows (PowerShell)
start index.html
```

Or drag `index.html` onto any browser window.

### 3. Edit and refresh

The project has no build step. Edit any of the three files, save, and reload the browser tab (`Cmd+R` / `Ctrl+R`).

```
index.html   ← layout and DOM structure
style.css    ← all visual styling
script.js    ← chess logic, AI, UI behaviour
```

### 4. Recommended editor setup

Any editor works. For the best experience with VS Code:

```bash
code .
```

Useful extensions:
- **ESLint** — catches JavaScript issues
- **Prettier** — consistent formatting
- **Live Server** — auto-reloads the browser on save (eliminates manual refreshes)

With Live Server installed, right-click `index.html` → *Open with Live Server*.

## Running a Local HTTP Server (optional)

Opening `index.html` directly as a `file://` URL works fine for this project. If you ever need a proper HTTP server (e.g. for testing `fetch` calls or service workers):

```bash
# Python 3
python3 -m http.server 8080

# Node.js (npx, no install required)
npx serve .

# PHP
php -S localhost:8080
```

Then visit `http://localhost:8080`.

## Making Changes

### Branching

```bash
git checkout -b feature/my-change
# make edits
git add index.html style.css script.js   # stage only the relevant files
git commit -m "describe what changed and why"
git push -u origin feature/my-change
```

### Opening a pull request

```bash
gh pr create --title "Short title" --body "Description of changes"
```

### Pushing directly to main

```bash
git add .
git commit -m "describe change"
git push
```

## File Reference

| File | Size (approx) | Purpose |
|---|---|---|
| `index.html` | ~60 lines | HTML skeleton, board grid, dialogs, AI controls |
| `style.css` | ~310 lines | CSS custom properties, board, pieces, panels, animations |
| `script.js` | ~530 lines | Full chess engine + AI + drag-and-drop + SAN notation |
| `README.md` | — | Project overview and feature list |
| `CLAUDE.md` | — | Architecture notes for AI-assisted development |
| `SETUP.md` | — | This file |

## Troubleshooting

**Pieces don't respond to drag**
Ensure JavaScript is enabled. Open the browser console (`F12`) and check for errors.

**AI takes too long on Hard**
Hard mode searches to depth 4, which can take 1–3 seconds in complex positions. Switch to Medium (depth 3) for faster responses.

**Board looks broken / unstyled**
Make sure `style.css` is in the same directory as `index.html` and the filename capitalisation matches.

**Moves aren't being recorded in the history panel**
This is a known symptom of running from a `file://` URL on some older browsers with strict security settings. Use a local HTTP server as described above.
