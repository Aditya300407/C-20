'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const COLS = 10;
const ROWS = 20;

const COLORS = [
  null,
  '#00d4ff', // I – cyan
  '#f7c948', // O – yellow
  '#a020f0', // T – purple
  '#00e676', // S – green
  '#ff1744', // Z – red
  '#1e90ff', // J – blue
  '#ff6d00', // L – orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                   // T
  [[0,4,4],[4,4,0],[0,0,0]],                   // S
  [[5,5,0],[0,5,5],[0,0,0]],                   // Z
  [[6,0,0],[6,6,6],[0,0,0]],                   // J
  [[0,0,7],[7,7,7],[0,0,0]],                   // L
];

const SCORE_TABLE = [0, 100, 300, 500, 800]; // 0–4 lines cleared

const BASE_SPEED = 800; // ms per drop at level 1
const SPEED_FACTOR = 0.85; // multiplied each level

// ─── State ───────────────────────────────────────────────────────────────────

let canvas, ctx, nextCanvas, nextCtx;
let CELL; // cell size in px, computed from canvas height

let board = [];
let current = null;
let next = null;
let score = 0;
let level = 1;
let linesCleared = 0;
let gameRunning = false;
let gamePaused = false;
let animId = null;
let dropTimer = 0;
let lastTime = 0;

// Touch state
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
const SWIPE_THRESHOLD = 30;
const TAP_MAX_DIST = 15;
const TAP_MAX_TIME = 200;

// ─── Initialisation ───────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  nextCanvas = document.getElementById('next-canvas');
  nextCtx = nextCanvas.getContext('2d');

  sizeCanvas();
  window.addEventListener('resize', sizeCanvas);

  drawIdleBoard();

  // Overlay button
  document.getElementById('overlay-btn').addEventListener('click', startGame);
  document.getElementById('pause-btn').addEventListener('click', togglePause);

  // Keyboard
  window.addEventListener('keydown', onKeyDown);

  // Touch on game canvas
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchend', onTouchEnd, { passive: true });

  // On-screen buttons
  setupBtn('btn-left',   () => move(-1));
  setupBtn('btn-right',  () => move(1));
  setupBtn('btn-down',   () => softDrop());
  setupBtn('btn-rotate', () => rotate());
  setupBtn('btn-drop',   () => hardDrop());
});

function sizeCanvas() {
  const wrapper = document.getElementById('game-wrapper');
  const availH = wrapper.clientHeight - 16;
  const availW = window.innerWidth - 200; // leave room for sidebars
  CELL = Math.floor(Math.min(availH / ROWS, availW / COLS));
  if (CELL < 18) CELL = 18;
  canvas.width = CELL * COLS;
  canvas.height = CELL * ROWS;

  const nc = Math.floor(CELL * 4.5);
  nextCanvas.width = nc;
  nextCanvas.height = nc;
  document.getElementById('next-canvas').style.width = nc + 'px';
  document.getElementById('next-canvas').style.height = nc + 'px';

  if (gameRunning) render();
  else drawIdleBoard();
}

function setupBtn(id, action) {
  const btn = document.getElementById(id);
  // Use pointerdown for fast response + repeat on hold for movement buttons
  let interval = null;
  const start = (e) => {
    e.preventDefault();
    action();
    if (id === 'btn-left' || id === 'btn-right' || id === 'btn-down') {
      interval = setInterval(action, 120);
    }
  };
  const stop = () => { clearInterval(interval); interval = null; };
  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointerleave', stop);
  btn.addEventListener('pointercancel', stop);
}

// ─── Game Logic ───────────────────────────────────────────────────────────────

function startGame() {
  board = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  score = 0;
  level = 1;
  linesCleared = 0;
  updateUI();
  next = randomPiece();
  spawnPiece();
  document.getElementById('overlay').classList.add('hidden');
  gameRunning = true;
  gamePaused = false;
  lastTime = performance.now();
  dropTimer = 0;
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(gameLoop);
}

function togglePause() {
  if (!gameRunning) return;
  gamePaused = !gamePaused;
  document.getElementById('pause-btn').textContent = gamePaused ? 'RESUME' : 'PAUSE';
  if (!gamePaused) {
    lastTime = performance.now();
    animId = requestAnimationFrame(gameLoop);
  }
}

function gameLoop(timestamp) {
  if (gamePaused) return;
  const delta = timestamp - lastTime;
  lastTime = timestamp;
  dropTimer += delta;
  const speed = BASE_SPEED * Math.pow(SPEED_FACTOR, level - 1);
  if (dropTimer >= speed) {
    dropTimer = 0;
    if (!stepDown()) {
      lockPiece();
      const cleared = clearLines();
      addScore(cleared);
      spawnPiece();
      if (!isValid(current)) {
        gameOver();
        return;
      }
    }
  }
  render();
  animId = requestAnimationFrame(gameLoop);
}

function randomPiece() {
  const id = Math.floor(Math.random() * 7) + 1;
  const matrix = PIECES[id].map(row => [...row]);
  return { id, matrix, x: 3, y: 0 };
}

function spawnPiece() {
  current = next;
  current.x = Math.floor((COLS - current.matrix[0].length) / 2);
  current.y = 0;
  next = randomPiece();
  drawNext();
}

function isValid(piece, offsetX = 0, offsetY = 0, matrix = null) {
  const m = matrix || piece.matrix;
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      const nx = piece.x + c + offsetX;
      const ny = piece.y + r + offsetY;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
      if (ny >= 0 && board[ny][nx]) return false;
    }
  }
  return true;
}

function stepDown() {
  if (isValid(current, 0, 1)) {
    current.y++;
    return true;
  }
  return false;
}

function move(dir) {
  if (!gameRunning || gamePaused) return;
  if (isValid(current, dir, 0)) current.x += dir;
  render();
}

function softDrop() {
  if (!gameRunning || gamePaused) return;
  if (!stepDown()) {
    lockPiece();
    const cleared = clearLines();
    addScore(cleared);
    spawnPiece();
    if (!isValid(current)) { gameOver(); return; }
  }
  dropTimer = 0;
  render();
}

function hardDrop() {
  if (!gameRunning || gamePaused) return;
  while (stepDown()) {}
  lockPiece();
  const cleared = clearLines();
  addScore(cleared);
  spawnPiece();
  if (!isValid(current)) { gameOver(); return; }
  dropTimer = 0;
  render();
}

function rotate() {
  if (!gameRunning || gamePaused) return;
  const m = current.matrix;
  const rotated = m[0].map((_, i) => m.map(row => row[i]).reverse());
  // Wall kick attempts
  const kicks = [0, 1, -1, 2, -2];
  for (const kick of kicks) {
    if (isValid(current, kick, 0, rotated)) {
      current.matrix = rotated;
      current.x += kick;
      break;
    }
  }
  render();
}

function lockPiece() {
  current.matrix.forEach((row, r) => {
    row.forEach((val, c) => {
      if (val) {
        const ny = current.y + r;
        const nx = current.x + c;
        if (ny >= 0) board[ny][nx] = val;
      }
    });
  });
}

function clearLines() {
  let count = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(cell => cell !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      count++;
      r++; // recheck same index
    }
  }
  return count;
}

function addScore(lines) {
  if (lines === 0) return;
  score += SCORE_TABLE[lines] * level;
  linesCleared += lines;
  level = Math.floor(linesCleared / 10) + 1;
  updateUI();
}

function updateUI() {
  document.getElementById('score').textContent = score;
  document.getElementById('level').textContent = level;
  document.getElementById('lines').textContent = linesCleared;
}

function gameOver() {
  gameRunning = false;
  cancelAnimationFrame(animId);
  document.getElementById('overlay-title').textContent = 'GAME OVER';
  document.getElementById('overlay-message').textContent = 'Score: ' + score;
  document.getElementById('overlay-btn').textContent = 'PLAY AGAIN';
  document.getElementById('overlay').classList.remove('hidden');
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function drawCell(context, x, y, colorId, alpha = 1) {
  if (!colorId) return;
  const color = COLORS[colorId];
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
  // Highlight
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, 3);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * CELL + 1, y * CELL + 1, 3, CELL - 2);
  context.globalAlpha = 1;
}

function getGhostY() {
  let gy = current.y;
  while (isValid(current, 0, gy - current.y + 1)) gy++;
  return gy;
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = '#1e1e1e';
  ctx.lineWidth = 0.5;
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(COLS * CELL, r * CELL);
    ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, ROWS * CELL);
    ctx.stroke();
  }

  // Board
  board.forEach((row, r) => {
    row.forEach((val, c) => drawCell(ctx, c, r, val));
  });

  if (!current) return;

  // Ghost piece
  const ghostY = getGhostY();
  if (ghostY !== current.y) {
    current.matrix.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val) drawCell(ctx, current.x + c, ghostY + r, val, 0.2);
      });
    });
  }

  // Current piece
  current.matrix.forEach((row, r) => {
    row.forEach((val, c) => {
      if (val) drawCell(ctx, current.x + c, current.y + r, val);
    });
  });
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!next) return;
  const nc = Math.floor(nextCanvas.width / 5);
  const m = next.matrix;
  const offX = Math.floor((5 - m[0].length) / 2);
  const offY = Math.floor((5 - m.length) / 2);
  m.forEach((row, r) => {
    row.forEach((val, c) => {
      if (!val) return;
      const color = COLORS[val];
      nextCtx.fillStyle = color;
      nextCtx.fillRect((offX + c) * nc + 1, (offY + r) * nc + 1, nc - 2, nc - 2);
      nextCtx.fillStyle = 'rgba(255,255,255,0.25)';
      nextCtx.fillRect((offX + c) * nc + 1, (offY + r) * nc + 1, nc - 2, 3);
    });
  });
}

function drawIdleBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1e1e1e';
  ctx.lineWidth = 0.5;
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(COLS * CELL, r * CELL); ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, ROWS * CELL); ctx.stroke();
  }
}

// ─── Input ────────────────────────────────────────────────────────────────────

function onKeyDown(e) {
  switch (e.key) {
    case 'ArrowLeft':  e.preventDefault(); move(-1); break;
    case 'ArrowRight': e.preventDefault(); move(1); break;
    case 'ArrowDown':  e.preventDefault(); softDrop(); break;
    case 'ArrowUp':    e.preventDefault(); rotate(); break;
    case ' ':          e.preventDefault(); hardDrop(); break;
    case 'p': case 'P': togglePause(); break;
  }
}

function onTouchStart(e) {
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchStartTime = Date.now();
}

function onTouchEnd(e) {
  if (!gameRunning || gamePaused) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const dt = Date.now() - touchStartTime;

  if (dist < TAP_MAX_DIST && dt < TAP_MAX_TIME) {
    rotate();
    return;
  }

  if (Math.abs(dx) > Math.abs(dy)) {
    if (Math.abs(dx) > SWIPE_THRESHOLD) move(dx > 0 ? 1 : -1);
  } else {
    if (dy > SWIPE_THRESHOLD) softDrop();
  }
}
