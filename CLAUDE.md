# CLAUDE.md — NeuroChess

Instructions and context for Claude Code when working on this project.

## Project Overview

NeuroChess is a zero-dependency, single-page chess application. All logic lives in three files:

| File | Responsibility |
|---|---|
| `index.html` | DOM structure — board, panels, dialogs, controls |
| `style.css` | All styling — CSS custom properties, board colours, animations |
| `script.js` | Everything else — chess rules, AI, drag-and-drop, SAN, history |

There is no build system, no package manager, no transpilation. Changes are immediately reflected by refreshing the browser.

## Architecture

### Coordinate system
`board[row][col]` where `row 0 = rank 8` (Black's back rank) and `row 7 = rank 1` (White's back rank). File `a = col 0`, file `h = col 7`.

### Piece encoding
Two-character strings: colour prefix + type letter.
- White: `wK wQ wR wB wN wP`
- Black: `bK bQ bR bB bN bP`

### Key state variables (all in `script.js`)
| Variable | Type | Purpose |
|---|---|---|
| `board` | `string[8][8]` | Current position |
| `currentTurn` | `'w'`\|`'b'` | Whose move it is |
| `enPassantTarget` | `[row,col]`\|`null` | EP capture square |
| `castlingRights` | `{wK,wQ,bK,bQ}` | Remaining castling rights |
| `history` | `snapshot[]` | Stack for take-back |
| `moveHistory` | `string[]` | SAN strings, parallel to `history` |
| `aiEnabled` | `boolean` | AI mode toggle |
| `humanColor` | `'w'`\|`'b'` | Which colour the human plays |
| `aiMoveToken` | `number` | Incremented on reset/undo to cancel stale AI callbacks |

### Move execution flow
```
mouseup → executeMove(fr, fc, tr, tc)
  → push snapshot to history
  → if promotion: show dialog or auto-queen (AI)
  → applyMove() — returns new board copy
  → update state (EP, castling rights, turn)
  → renderBoard() + renderMoveHistory()
  → checkGameStatus()
  → triggerAI() if applicable
```

### AI pipeline
```
triggerAI() → setTimeout → makeAIMove(token)
  → getAllMovesForColor() → orderMoves() (captures first)
  → minimax(depth, alpha, beta, colorToMove, ep, cr)
      → evaluateBoard() = Σ (PIECE_VALUES[type] + PST[type][row][col])
  → pick best move (random tiebreak)
  → isAIMove = true; executeMove(); isAIMove = false
```

## Conventions

- **Pure functions for the engine** — `applyMove`, `getLegalMoves`, `minimax`, `evaluateBoard`, `generateSAN` all accept board/ep/cr as parameters and never read globals. Only rendering and event handlers touch global state.
- **`deepCopy(arr)`** must be called whenever the board is stored or passed to a function that might mutate it.
- **`computeNewCastlingRights(piece, fr, fc, tr, tc, cr)`** is the pure version; `computeNewCR(...)` is the global-reading wrapper used in `executeMove`.
- SAN is generated *before* the move is applied to global state, using the `preSnap` board.
- `history.length` always equals `moveHistory.length` **except** while a promotion dialog is open (history has one extra entry with no corresponding SAN yet).

## Common Tasks

### Add a new rule or fix a move-validation bug
Edit `getPseudoMoves` and/or `getLegalMoves` in `script.js`. Always verify that `applyMove` (used in legal-move filtering) handles the edge case too.

### Change board or piece appearance
Edit `style.css`. Board square colours are `--light-sq` and `--dark-sq` CSS variables at the top. Piece size scales from `--sq-size`.

### Adjust AI strength
- Default depth is set in the `<select id="aiLevel">` element in `index.html`.
- Evaluation weights are `PIECE_VALUES` and `PST` constants near the top of the AI section in `script.js`.

### Add a new UI panel
- Add markup in `index.html` inside `<main>`.
- Style in `style.css`.
- Wire up in `script.js`; call a render function at the end of `initBoard`, `executeMove`, `selectPromotion`, and `undoMove`.

## What to Avoid

- Do not introduce npm packages or a build step — the project is intentionally zero-dependency.
- Do not mutate the `board` array in place inside engine functions; always work on a `deepCopy`.
- Do not call `triggerAI()` after `undoMove` unless `currentTurn === aiColor` — the check is already inside `triggerAI`.
- Do not add `async/await` to `makeAIMove` without also adding a proper loading/disabled state — the current token-cancellation approach relies on synchronous execution within the setTimeout callback.
