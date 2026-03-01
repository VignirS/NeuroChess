'use strict';

// ─── Piece definitions ────────────────────────────────────────────────────────
const GLYPHS = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

// ─── Initial board layout ─────────────────────────────────────────────────────
// board[row][col], row 0 = rank 8 (black's back rank)
const INITIAL_BOARD = [
  ['bR','bN','bB','bQ','bK','bB','bN','bR'],
  ['bP','bP','bP','bP','bP','bP','bP','bP'],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ['wP','wP','wP','wP','wP','wP','wP','wP'],
  ['wR','wN','wB','wQ','wK','wB','wN','wR'],
];

const FILES = 'abcdefgh';

// ─── Game state ───────────────────────────────────────────────────────────────
let board            = [];
let currentTurn      = 'w';
let enPassantTarget  = null;
let castlingRights   = {};
let gameOver         = false;
let dragState        = null;
let pendingPromotion = null;
let history          = [];
let moveHistory      = [];

// ─── AI state ─────────────────────────────────────────────────────────────────
let aiEnabled    = false;
let humanColor   = 'w';
let aiColor      = 'b';
let aiThinking   = false;
let isAIMove     = false;
let aiMoveToken  = 0;   // incremented on reset/undo to cancel stale callbacks

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const boardEl          = document.getElementById('board');
const dragPieceEl      = document.getElementById('dragPiece');
const promotionOverlay = document.getElementById('promotionOverlay');
const promotionChoices = document.getElementById('promotionChoices');
const undoBtn          = document.getElementById('undoBtn');
const moveListEl       = document.getElementById('moveList');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const colorOf  = p => p ? p[0] : null;
const typeOf   = p => p ? p[1] : null;
const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const deepCopy = arr => arr.map(r => [...r]);
const isLight  = (r, c) => (r + c) % 2 === 0;
const enemy    = color => color === 'w' ? 'b' : 'w';

// ─── History / snapshot ───────────────────────────────────────────────────────
function snapshotState() {
  return {
    board:           deepCopy(board),
    currentTurn,
    enPassantTarget: enPassantTarget ? [...enPassantTarget] : null,
    castlingRights:  { ...castlingRights },
    gameOver,
  };
}

function restoreSnapshot(snap) {
  board           = deepCopy(snap.board);
  currentTurn     = snap.currentTurn;
  enPassantTarget = snap.enPassantTarget ? [...snap.enPassantTarget] : null;
  castlingRights  = { ...snap.castlingRights };
  gameOver        = snap.gameOver;
}

function updateUndoButton() {
  undoBtn.disabled = history.length === 0;
}

// ─── Attack detection ─────────────────────────────────────────────────────────
function isSquareAttacked(b, row, col, byColor) {
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const r = row+dr, c = col+dc;
    if (inBounds(r,c) && b[r][c] === byColor+'N') return true;
  }
  const pr = byColor === 'w' ? row + 1 : row - 1;
  for (const dc of [-1, 1])
    if (inBounds(pr, col+dc) && b[pr][col+dc] === byColor+'P') return true;
  for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
    const r = row+dr, c = col+dc;
    if (inBounds(r,c) && b[r][c] === byColor+'K') return true;
  }
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let r = row+dr, c = col+dc;
    while (inBounds(r,c)) {
      if (b[r][c]) { if (b[r][c] === byColor+'R' || b[r][c] === byColor+'Q') return true; break; }
      r += dr; c += dc;
    }
  }
  for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    let r = row+dr, c = col+dc;
    while (inBounds(r,c)) {
      if (b[r][c]) { if (b[r][c] === byColor+'B' || b[r][c] === byColor+'Q') return true; break; }
      r += dr; c += dc;
    }
  }
  return false;
}

function findKing(b, color) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (b[r][c] === color+'K') return [r, c];
  return null;
}

function isInCheck(b, color) {
  const king = findKing(b, color);
  if (!king) return false;
  return isSquareAttacked(b, king[0], king[1], enemy(color));
}

// ─── Pseudo-legal move generation ────────────────────────────────────────────
function getPseudoMoves(b, row, col, ep, cr) {
  const piece = b[row][col];
  if (!piece) return [];
  const color = colorOf(piece);
  const type  = typeOf(piece);
  const opp   = enemy(color);
  const moves = [];

  const push  = (r, c) => { if (inBounds(r,c) && colorOf(b[r][c]) !== color) moves.push([r, c]); };
  const slide = (dr, dc) => {
    let r = row+dr, c = col+dc;
    while (inBounds(r,c)) {
      if (b[r][c]) { if (colorOf(b[r][c]) === opp) moves.push([r, c]); break; }
      moves.push([r, c]);
      r += dr; c += dc;
    }
  };

  switch (type) {
    case 'P': {
      const dir      = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      if (inBounds(row+dir, col) && !b[row+dir][col]) {
        moves.push([row+dir, col]);
        if (row === startRow && !b[row+2*dir][col])
          moves.push([row+2*dir, col]);
      }
      for (const dc of [-1, 1]) {
        const r = row+dir, c = col+dc;
        if (inBounds(r, c)) {
          if (colorOf(b[r][c]) === opp) moves.push([r, c]);
          if (ep && ep[0] === r && ep[1] === c) moves.push([r, c]);
        }
      }
      break;
    }
    case 'N':
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
        push(row+dr, col+dc);
      break;
    case 'B': for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) slide(dr, dc); break;
    case 'R': for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) slide(dr, dc); break;
    case 'Q':
      for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]])
        slide(dr, dc);
      break;
    case 'K': {
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
        push(row+dr, col+dc);
      const backRow = color === 'w' ? 7 : 0;
      if (row === backRow && col === 4) {
        if (cr[color+'K'] && !b[backRow][5] && !b[backRow][6]) moves.push([backRow, 6]);
        if (cr[color+'Q'] && !b[backRow][3] && !b[backRow][2] && !b[backRow][1]) moves.push([backRow, 2]);
      }
      break;
    }
  }
  return moves;
}

// ─── Apply move to a board copy ───────────────────────────────────────────────
function applyMove(b, fromRow, fromCol, toRow, toCol, ep, promotionPiece = 'Q') {
  const nb    = deepCopy(b);
  const piece = nb[fromRow][fromCol];
  const color = colorOf(piece);
  const type  = typeOf(piece);

  nb[toRow][toCol]     = piece;
  nb[fromRow][fromCol] = null;

  if (type === 'P' && ep && toRow === ep[0] && toCol === ep[1]) {
    nb[color === 'w' ? toRow + 1 : toRow - 1][toCol] = null;
  }
  if (type === 'P' && (toRow === 0 || toRow === 7))
    nb[toRow][toCol] = color + promotionPiece;

  if (type === 'K' && Math.abs(toCol - fromCol) === 2) {
    const br = color === 'w' ? 7 : 0;
    if (toCol === 6) { nb[br][5] = nb[br][7]; nb[br][7] = null; }
    else             { nb[br][3] = nb[br][0]; nb[br][0] = null; }
  }
  return nb;
}

// ─── Legal move generation ────────────────────────────────────────────────────
function getLegalMoves(b, row, col, ep, cr) {
  const piece = b[row][col];
  if (!piece) return [];
  const color = colorOf(piece);
  const type  = typeOf(piece);
  const opp   = enemy(color);

  return getPseudoMoves(b, row, col, ep, cr).filter(([toRow, toCol]) => {
    if (type === 'K' && Math.abs(toCol - col) === 2) {
      if (isInCheck(b, color)) return false;
      if (isSquareAttacked(b, row, toCol === 6 ? 5 : 3, opp)) return false;
    }
    return !isInCheck(applyMove(b, row, col, toRow, toCol, ep, 'Q'), color);
  });
}

function hasAnyLegalMove(b, color, ep, cr) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (colorOf(b[r][c]) === color && getLegalMoves(b, r, c, ep, cr).length > 0)
        return true;
  return false;
}

// ─── Castling-rights helper (pure — used in game and AI search) ───────────────
function computeNewCastlingRights(piece, fromRow, fromCol, toRow, toCol, cr) {
  const color = colorOf(piece);
  const type  = typeOf(piece);
  const n     = { ...cr };
  if (type === 'K') { n[color+'K'] = false; n[color+'Q'] = false; }
  if (type === 'R' && fromRow === (color === 'w' ? 7 : 0)) {
    if (fromCol === 7) n[color+'K'] = false;
    if (fromCol === 0) n[color+'Q'] = false;
  }
  if (toRow === 0 && toCol === 7) n.bK = false;
  if (toRow === 0 && toCol === 0) n.bQ = false;
  if (toRow === 7 && toCol === 7) n.wK = false;
  if (toRow === 7 && toCol === 0) n.wQ = false;
  return n;
}

// Wrapper that reads global castlingRights (used in executeMove)
function computeNewCR(piece, fromRow, fromCol, toRow, toCol) {
  return computeNewCastlingRights(piece, fromRow, fromCol, toRow, toCol, castlingRights);
}

function computeEP(piece, fromRow, toRow, toCol) {
  return typeOf(piece) === 'P' && Math.abs(toRow - fromRow) === 2
    ? [(fromRow + toRow) / 2, toCol] : null;
}

// ─── AI: evaluation tables & constants ───────────────────────────────────────
// Row 0 = rank 8, row 7 = rank 1 (white home).
// For black pieces we mirror vertically: PST[type][7-row][col].
const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

const PST = {
  P: [
    [  0,  0,  0,  0,  0,  0,  0,  0],
    [ 50, 50, 50, 50, 50, 50, 50, 50],
    [ 10, 10, 20, 30, 30, 20, 10, 10],
    [  5,  5, 10, 25, 25, 10,  5,  5],
    [  0,  0,  0, 20, 20,  0,  0,  0],
    [  5, -5,-10,  0,  0,-10, -5,  5],
    [  5, 10, 10,-20,-20, 10, 10,  5],
    [  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  N: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
  ],
  B: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
  ],
  R: [
    [  0,  0,  0,  0,  0,  0,  0,  0],
    [  5, 10, 10, 10, 10, 10, 10,  5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [  0,  0,  0,  5,  5,  0,  0,  0],
  ],
  Q: [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [ -5,  0,  5,  5,  5,  5,  0, -5],
    [  0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20],
  ],
  K: [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [ 20, 20,  0,  0,  0,  0, 20, 20],
    [ 20, 30, 10,  0,  0, 10, 30, 20],
  ],
};

// ─── AI: board evaluation ─────────────────────────────────────────────────────
// Returns score from White's perspective (positive = White winning).
function evaluateBoard(b) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p) continue;
      const color   = colorOf(p);
      const type    = typeOf(p);
      const pstRow  = color === 'w' ? r : 7 - r;
      const val     = PIECE_VALUES[type] + PST[type][pstRow][c];
      score += color === 'w' ? val : -val;
    }
  }
  return score;
}

// ─── AI: move helpers ─────────────────────────────────────────────────────────
function getAllMovesForColor(b, color, ep, cr) {
  const moves = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (colorOf(b[r][c]) === color)
        for (const [tr, tc] of getLegalMoves(b, r, c, ep, cr))
          moves.push([r, c, tr, tc]);
  return moves;
}

// Puts captures first to improve alpha-beta cutoffs.
function orderMoves(b, moves) {
  return [...moves].sort((m1, m2) => {
    const v1 = b[m1[2]][m1[3]] ? PIECE_VALUES[typeOf(b[m1[2]][m1[3]])] : 0;
    const v2 = b[m2[2]][m2[3]] ? PIECE_VALUES[typeOf(b[m2[2]][m2[3]])] : 0;
    return v2 - v1;
  });
}

// ─── AI: minimax with alpha-beta pruning ──────────────────────────────────────
// colorToMove alternates each ply. Evaluation is always from White's perspective.
function minimax(b, depth, alpha, beta, colorToMove, ep, cr) {
  if (depth === 0) return evaluateBoard(b);

  const maximizing = colorToMove === 'w';
  const moves = getAllMovesForColor(b, colorToMove, ep, cr);

  if (moves.length === 0)
    return isInCheck(b, colorToMove) ? (maximizing ? -99999 : 99999) : 0;

  if (maximizing) {
    let best = -Infinity;
    for (const [fr, fc, tr, tc] of orderMoves(b, moves)) {
      const piece = b[fr][fc];
      const nb    = applyMove(b, fr, fc, tr, tc, ep, 'Q');
      const val   = minimax(nb, depth - 1, alpha, beta, 'b',
                            computeEP(piece, fr, tr, tc),
                            computeNewCastlingRights(piece, fr, fc, tr, tc, cr));
      if (val > best)  best  = val;
      if (val > alpha) alpha = val;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const [fr, fc, tr, tc] of orderMoves(b, moves)) {
      const piece = b[fr][fc];
      const nb    = applyMove(b, fr, fc, tr, tc, ep, 'Q');
      const val   = minimax(nb, depth - 1, alpha, beta, 'w',
                            computeEP(piece, fr, tr, tc),
                            computeNewCastlingRights(piece, fr, fc, tr, tc, cr));
      if (val < best) best = val;
      if (val < beta) beta = val;
      if (beta <= alpha) break;
    }
    return best;
  }
}

// ─── AI: find and play best move ──────────────────────────────────────────────
function triggerAI() {
  if (!aiEnabled || gameOver || currentTurn !== aiColor || aiThinking) return;
  aiThinking = true;
  setStatus('AI is thinking…');
  const token = aiMoveToken;
  setTimeout(() => makeAIMove(token), 250);
}

function makeAIMove(token) {
  if (token !== aiMoveToken) return;   // stale — cancelled by reset/undo

  const depth = parseInt(document.getElementById('aiLevel').value);
  const moves = getAllMovesForColor(board, aiColor, enPassantTarget, castlingRights);

  if (moves.length === 0 || gameOver) { aiThinking = false; return; }

  const aiMaximizes = aiColor === 'w';
  let bestVal   = aiMaximizes ? -Infinity : Infinity;
  let bestMoves = [];

  for (const move of orderMoves(board, moves)) {
    const [fr, fc, tr, tc] = move;
    const piece = board[fr][fc];
    const nb    = applyMove(board, fr, fc, tr, tc, enPassantTarget, 'Q');
    const val   = minimax(nb, depth - 1, -Infinity, Infinity,
                          enemy(aiColor),
                          computeEP(piece, fr, tr, tc),
                          computeNewCastlingRights(piece, fr, fc, tr, tc, castlingRights));

    if ((aiMaximizes && val > bestVal) || (!aiMaximizes && val < bestVal)) {
      bestVal   = val;
      bestMoves = [move];
    } else if (val === bestVal) {
      bestMoves.push(move);   // collect ties for random selection
    }
  }

  aiThinking = false;

  if (bestMoves.length > 0 && !gameOver) {
    const best = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    isAIMove = true;
    executeMove(...best);
    isAIMove = false;
  }
}

// ─── SAN generation ──────────────────────────────────────────────────────────
function generateSAN(b, fromRow, fromCol, toRow, toCol, promotionPiece, ep, cr, newEP, newCR) {
  const piece = b[fromRow][fromCol];
  if (!piece) return '?';
  const color = colorOf(piece);
  const type  = typeOf(piece);
  const opp   = enemy(color);

  if (type === 'K' && Math.abs(toCol - fromCol) === 2)
    return toCol === 6 ? 'O-O' : 'O-O-O';

  const isCapture = !!(b[toRow][toCol]) ||
    (type === 'P' && ep && toRow === ep[0] && toCol === ep[1]);

  let san = type === 'P' ? '' : type;

  if (type !== 'P') {
    const ambiguous = [];
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (!(r === fromRow && c === fromCol) && b[r][c] === color + type)
          if (getLegalMoves(b, r, c, ep, cr).some(([mr, mc]) => mr === toRow && mc === toCol))
            ambiguous.push([r, c]);
    if (ambiguous.length > 0) {
      const sameFile = ambiguous.some(([, c]) => c === fromCol);
      const sameRank = ambiguous.some(([r])   => r === fromRow);
      if (!sameFile)      san += FILES[fromCol];
      else if (!sameRank) san += (8 - fromRow);
      else                san += FILES[fromCol] + (8 - fromRow);
    }
  } else if (isCapture) {
    san += FILES[fromCol];
  }

  if (isCapture) san += 'x';
  san += FILES[toCol] + (8 - toRow);

  if (type === 'P' && (toRow === 0 || toRow === 7))
    san += '=' + (promotionPiece || 'Q');

  const nb = applyMove(b, fromRow, fromCol, toRow, toCol, ep, promotionPiece || 'Q');
  if (isInCheck(nb, opp))
    san += hasAnyLegalMove(nb, opp, newEP, newCR) ? '+' : '#';

  return san;
}

// ─── Move history rendering ───────────────────────────────────────────────────
function renderMoveHistory() {
  if (moveHistory.length === 0) {
    moveListEl.innerHTML = '<p class="move-list-empty">No moves yet</p>';
    return;
  }
  moveListEl.innerHTML = '';
  const last = moveHistory.length - 1;

  for (let i = 0; i < moveHistory.length; i += 2) {
    const row   = document.createElement('div');
    row.className = 'move-row';

    const numEl = document.createElement('span');
    numEl.className   = 'move-num';
    numEl.textContent = (i / 2 + 1) + '.';

    const wEl = document.createElement('span');
    wEl.className   = 'move-san' + (i === last ? ' latest' : '');
    wEl.textContent = moveHistory[i];

    const bEl = document.createElement('span');
    if (i + 1 <= last) {
      bEl.className   = 'move-san' + (i + 1 === last ? ' latest' : '');
      bEl.textContent = moveHistory[i + 1];
    }

    row.append(numEl, wEl, bEl);
    moveListEl.appendChild(row);
  }
  moveListEl.scrollTop = moveListEl.scrollHeight;
}

// ─── Board initialisation ─────────────────────────────────────────────────────
function initBoard() {
  board            = deepCopy(INITIAL_BOARD);
  currentTurn      = 'w';
  enPassantTarget  = null;
  castlingRights   = { wK: true, wQ: true, bK: true, bQ: true };
  gameOver         = false;
  dragState        = null;
  pendingPromotion = null;
  history          = [];
  moveHistory      = [];
  aiThinking       = false;
  isAIMove         = false;
  aiMoveToken++;          // cancel any pending AI setTimeout
  dragPieceEl.classList.remove('active');
  hidePromotionDialog();
  updateUndoButton();
  renderBoard();
  renderMoveHistory();
  updateTurnLabel();
  setStatus('');
  // If AI plays White, kick off the first move
  if (aiEnabled && currentTurn === aiColor) triggerAI();
}

// ─── Board rendering ──────────────────────────────────────────────────────────
function renderBoard() {
  boardEl.innerHTML = '';
  const checkKing = isInCheck(board, currentTurn) ? findKing(board, currentTurn) : null;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = document.createElement('div');
      sq.classList.add('square', isLight(row, col) ? 'light' : 'dark');
      sq.dataset.row = row;
      sq.dataset.col = col;

      if (checkKing && checkKing[0] === row && checkKing[1] === col)
        sq.classList.add('in-check');

      const piece = board[row][col];
      if (piece) {
        const pieceEl = document.createElement('span');
        pieceEl.classList.add('piece');
        pieceEl.textContent = GLYPHS[piece];
        pieceEl.dataset.piece = piece;
        pieceEl.dataset.row   = row;
        pieceEl.dataset.col   = col;
        sq.appendChild(pieceEl);
      }

      sq.addEventListener('mouseenter', onSquareEnter);
      sq.addEventListener('mouseleave', onSquareLeave);
      boardEl.appendChild(sq);
    }
  }
}

function getSquareEl(row, col) {
  return boardEl.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
}

function showLegalMoveHints(legalMoves) {
  for (const [r, c] of legalMoves) {
    const sq = getSquareEl(r, c);
    if (!sq) continue;
    sq.classList.add(board[r][c] ? 'can-capture' : 'legal-move');
  }
}

function clearHighlights() {
  boardEl.querySelectorAll('.drag-hover, .can-capture, .legal-move, .from-square')
    .forEach(el => el.classList.remove('drag-hover', 'can-capture', 'legal-move', 'from-square'));
}

function updateTurnLabel() {
  const wLabel = document.getElementById('whiteLabel');
  const bLabel = document.getElementById('blackLabel');
  wLabel.classList.toggle('active-turn', currentTurn === 'w');
  bLabel.classList.toggle('active-turn', currentTurn === 'b');
  wLabel.textContent = currentTurn === 'w' ? 'White  ▸' : 'White';
  bLabel.textContent = currentTurn === 'b' ? '◂  Black' : 'Black';
}

function setStatus(msg) {
  document.getElementById('statusMsg').textContent = msg;
}

// ─── Post-move game-status check ──────────────────────────────────────────────
function checkGameStatus(landRow, landCol) {
  const inCheck = isInCheck(board, currentTurn);
  if (!hasAnyLegalMove(board, currentTurn, enPassantTarget, castlingRights)) {
    gameOver = true;
    setStatus(inCheck
      ? `Checkmate! ${currentTurn === 'w' ? 'Black' : 'White'} wins!`
      : "Stalemate — it's a draw.");
    return;
  }
  setStatus(inCheck ? `${currentTurn === 'w' ? 'White' : 'Black'} is in check!` : '');

  if (landRow != null) {
    const sq = getSquareEl(landRow, landCol);
    if (sq) { sq.classList.add('highlighted'); setTimeout(() => sq.classList.remove('highlighted'), 450); }
  }
}

// ─── Promotion dialog ─────────────────────────────────────────────────────────
function showPromotionDialog(color) {
  promotionChoices.innerHTML = '';
  for (const type of ['Q', 'R', 'B', 'N']) {
    const btn = document.createElement('button');
    btn.className   = 'promo-btn';
    btn.textContent = GLYPHS[color + type];
    btn.title       = { Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' }[type];
    btn.addEventListener('click', () => selectPromotion(type));
    promotionChoices.appendChild(btn);
  }
  promotionOverlay.classList.remove('hidden');
}

function hidePromotionDialog() {
  promotionOverlay.classList.add('hidden');
}

function selectPromotion(pieceType) {
  if (!pendingPromotion) return;
  const { fromRow, fromCol, toRow, toCol, color, opp, newEP, newCR, preSnap } = pendingPromotion;
  pendingPromotion = null;
  hidePromotionDialog();

  board[toRow][toCol] = color + pieceType;
  enPassantTarget     = newEP;
  castlingRights      = newCR;
  currentTurn         = opp;

  const san = generateSAN(
    preSnap.board, fromRow, fromCol, toRow, toCol,
    pieceType, preSnap.enPassantTarget, preSnap.castlingRights, newEP, newCR
  );
  moveHistory.push(san);

  renderBoard();
  updateTurnLabel();
  renderMoveHistory();
  checkGameStatus(toRow, toCol);
  if (!gameOver) triggerAI();
}

// ─── Drag and drop ────────────────────────────────────────────────────────────
function onSquareEnter(e) {
  if (!dragState) return;
  const sq = e.currentTarget;
  const r  = +sq.dataset.row, c = +sq.dataset.col;
  if (dragState.legalMoves.some(([lr, lc]) => lr === r && lc === c))
    sq.classList.add('drag-hover');
}

function onSquareLeave(e) {
  if (!dragState) return;
  e.currentTarget.classList.remove('drag-hover');
}

boardEl.addEventListener('mousedown', e => {
  if (gameOver || pendingPromotion || aiThinking) return;
  if (aiEnabled && currentTurn !== humanColor) return;   // block when it's AI's turn

  const pieceEl = e.target.closest('.piece');
  if (!pieceEl) return;
  const piece = pieceEl.dataset.piece;
  if (colorOf(piece) !== currentTurn) return;

  const fromRow    = +pieceEl.dataset.row;
  const fromCol    = +pieceEl.dataset.col;
  const legalMoves = getLegalMoves(board, fromRow, fromCol, enPassantTarget, castlingRights);

  dragState = { piece, fromRow, fromCol, color: colorOf(piece), legalMoves };
  pieceEl.style.opacity = '0';
  getSquareEl(fromRow, fromCol).classList.add('from-square');
  showLegalMoveHints(legalMoves);

  dragPieceEl.textContent = GLYPHS[piece];
  dragPieceEl.classList.add('active');
  moveDragPiece(e.clientX, e.clientY);
  e.preventDefault();
});

document.addEventListener('mousemove', e => {
  if (!dragState) return;
  moveDragPiece(e.clientX, e.clientY);
});

document.addEventListener('mouseup', e => {
  if (!dragState) return;
  dragPieceEl.classList.remove('active');

  const target   = document.elementFromPoint(e.clientX, e.clientY);
  const squareEl = target ? target.closest('.square') : null;

  if (squareEl) {
    const toRow   = +squareEl.dataset.row;
    const toCol   = +squareEl.dataset.col;
    const { fromRow, fromCol, legalMoves } = dragState;
    const isLegal = legalMoves.some(([r, c]) => r === toRow && c === toCol);
    clearHighlights();
    if (isLegal) executeMove(fromRow, fromCol, toRow, toCol);
    else         restorePiece(fromRow, fromCol);
  } else {
    clearHighlights();
    restorePiece(dragState.fromRow, dragState.fromCol);
  }
  dragState = null;
});

function moveDragPiece(x, y) {
  dragPieceEl.style.left = x + 'px';
  dragPieceEl.style.top  = y + 'px';
}

function restorePiece(row, col) {
  const sq = getSquareEl(row, col);
  if (sq) {
    sq.classList.remove('from-square');
    const p = sq.querySelector('.piece');
    if (p) p.style.opacity = '1';
  }
}

// ─── Execute a validated move ─────────────────────────────────────────────────
function executeMove(fromRow, fromCol, toRow, toCol) {
  const piece = board[fromRow][fromCol];
  const color = colorOf(piece);
  const type  = typeOf(piece);
  const opp   = enemy(color);

  const newEP = computeEP(piece, fromRow, toRow, toCol);
  const newCR = computeNewCR(piece, fromRow, fromCol, toRow, toCol);

  // Save snapshot before mutating state
  const preSnap = snapshotState();
  history.push(preSnap);
  updateUndoButton();

  // ── Pawn promotion ────────────────────────────────────────────────────────
  if (type === 'P' && (toRow === 0 || toRow === 7)) {
    if (isAIMove) {
      // AI always promotes to queen — no dialog
      const san = generateSAN(
        preSnap.board, fromRow, fromCol, toRow, toCol,
        'Q', preSnap.enPassantTarget, preSnap.castlingRights, newEP, newCR
      );
      moveHistory.push(san);
      board           = applyMove(board, fromRow, fromCol, toRow, toCol, enPassantTarget, 'Q');
      enPassantTarget = newEP;
      castlingRights  = newCR;
      currentTurn     = opp;
      renderBoard();
      updateTurnLabel();
      renderMoveHistory();
      checkGameStatus(toRow, toCol);
      // AI just moved → now human's turn, no triggerAI needed
    } else {
      // Human promotion: show dialog
      const tempBoard = deepCopy(board);
      tempBoard[toRow][toCol]     = piece;
      tempBoard[fromRow][fromCol] = null;
      board = tempBoard;
      pendingPromotion = { fromRow, fromCol, toRow, toCol, color, opp, newEP, newCR, preSnap };
      renderBoard();
      showPromotionDialog(color);
    }
    return;
  }

  // ── Normal move ───────────────────────────────────────────────────────────
  const san = generateSAN(
    preSnap.board, fromRow, fromCol, toRow, toCol,
    null, preSnap.enPassantTarget, preSnap.castlingRights, newEP, newCR
  );
  moveHistory.push(san);

  board           = applyMove(board, fromRow, fromCol, toRow, toCol, enPassantTarget);
  enPassantTarget = newEP;
  castlingRights  = newCR;
  currentTurn     = opp;

  renderBoard();
  updateTurnLabel();
  renderMoveHistory();
  checkGameStatus(toRow, toCol);
  if (!gameOver) triggerAI();
}

// ─── Take back ────────────────────────────────────────────────────────────────
function undoMove() {
  if (history.length === 0) return;

  aiMoveToken++;        // cancel any in-flight AI setTimeout
  aiThinking = false;

  if (pendingPromotion) {
    // Promotion dialog is open: undo the pawn move (no SAN was pushed yet)
    pendingPromotion = null;
    hidePromotionDialog();
    restoreSnapshot(history.pop());
    // When vs AI, also undo the preceding AI move
    if (aiEnabled && history.length > 0 && moveHistory.length > 0) {
      restoreSnapshot(history.pop());
      moveHistory.pop();
    }
  } else if (aiEnabled) {
    // Undo 2 half-moves so it returns to the human's turn
    const count = Math.min(2, history.length);
    for (let i = 0; i < count; i++) {
      restoreSnapshot(history.pop());
      if (moveHistory.length > 0) moveHistory.pop();
    }
  } else {
    restoreSnapshot(history.pop());
    moveHistory.pop();
  }

  dragState = null;
  dragPieceEl.classList.remove('active');
  updateUndoButton();
  renderBoard();
  updateTurnLabel();
  renderMoveHistory();
  setStatus(isInCheck(board, currentTurn)
    ? `${currentTurn === 'w' ? 'White' : 'Black'} is in check!` : '');

  // If AI's turn after undo (e.g. only 1 entry existed), re-trigger
  if (aiEnabled && currentTurn === aiColor && !gameOver) triggerAI();
}

undoBtn.addEventListener('click', undoMove);

// ─── AI controls ──────────────────────────────────────────────────────────────
document.getElementById('aiToggleBtn').addEventListener('click', () => {
  aiEnabled = !aiEnabled;
  const btn  = document.getElementById('aiToggleBtn');
  const opts = document.getElementById('aiOptions');
  btn.textContent = aiEnabled ? 'Play vs Human' : 'Play vs AI';
  btn.classList.toggle('active', aiEnabled);
  opts.classList.toggle('hidden', !aiEnabled);
  initBoard();
});

document.getElementById('humanColor').addEventListener('change', e => {
  humanColor = e.target.value;
  aiColor    = enemy(humanColor);
  if (aiEnabled) initBoard();
});

document.getElementById('aiLevel').addEventListener('change', () => {
  if (aiEnabled) initBoard();
});

// ─── Reset ────────────────────────────────────────────────────────────────────
document.getElementById('resetBtn').addEventListener('click', initBoard);

// ─── Start ────────────────────────────────────────────────────────────────────
initBoard();
