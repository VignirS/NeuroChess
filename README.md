# NeuroChess

A fully featured browser-based chess game — no dependencies, no build step, just open `index.html`.

## Features

- **Drag & drop** — pick up pieces with the mouse and drop them on any legal square
- **Full move validation** — all FIDE rules enforced: pins, checks, en passant, castling
- **Pawn promotion dialog** — choose Queen, Rook, Bishop, or Knight on reaching the back rank
- **Algebraic notation panel** — every move recorded in standard SAN (e.g. `Nf3`, `exd5`, `O-O`, `e8=Q+`)
- **Take back** — undo moves at any time (undoes a full round when playing vs AI)
- **AI opponent** — minimax search with alpha-beta pruning and piece-square tables
  - Easy (depth 2) · Medium (depth 3) · Hard (depth 4)
  - Choose to play as White or Black
- **Check / checkmate / stalemate** detection with status messages
- **No frameworks, no bundler** — plain HTML + CSS + JavaScript

## Quick Start

```bash
git clone https://github.com/VignirS/NeuroChess.git
cd NeuroChess
open index.html        # macOS
# xdg-open index.html  # Linux
# start index.html     # Windows
```

Or just double-click `index.html` in Finder / Explorer.

## How to Play

| Action | How |
|---|---|
| Move a piece | Click and drag, release on the destination |
| See legal moves | Dots appear on empty squares, rings on capturable pieces |
| Promote a pawn | Drag to the back rank — a dialog appears to pick the piece |
| Take back a move | Click **Take Back** in the header |
| Play vs AI | Click **Play vs AI**, choose your colour and difficulty, then reset |
| Reset the game | Click **Reset Board** |

## Project Structure

```
NeuroChess/
├── index.html   — markup and layout
├── style.css    — all visual styles (board, pieces, panels, dialogs)
└── script.js    — chess engine, AI, drag-and-drop, SAN generation
```

## AI Details

The AI uses **minimax with alpha-beta pruning**:

- Evaluation = material balance + piece-square table bonuses
- Move ordering (captures first) to maximise pruning efficiency
- Equal-scoring moves are selected randomly to add variety
- Depth 4 (Hard) may take 1–3 seconds in complex positions

## License

MIT
