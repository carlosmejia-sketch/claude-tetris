'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
  '#90a4ae', // Nut - gris acero
  '#222831', // Bomba (se dibuja con render propio)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut (tuerca)
  [[9]],                                       // Bomba (power-up 1x1)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const BOMB = 9;                      // power-up: destruye un área 3x3 al bloquearse
const BOMB_INTERVAL = 5 * 60 * 1000; // garantía: al menos una bomba cada 5 min de juego activo
const BOMB_CHANCE = 0.04;            // probabilidad aleatoria por pieza generada

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');

const startOverlay = document.getElementById('start-overlay');
const startRecords = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const overlayRecords = document.getElementById('overlay-records');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const resetRecordsStartBtn = document.getElementById('reset-records-start-btn');

const THEME_KEY = 'tetris-theme';
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let playTime, lastBombTime;
let combo, maxCombo;
let scoreSaved;
let gridLineColor = '#22222e';

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  return makePiece(Math.floor(Math.random() * 8) + 1);
}

// Genera la próxima pieza: aleatoriamente puede ser bomba, y se fuerza una bomba
// si han pasado 5 min de juego activo sin que aparezca (garantía mínima).
function generateNext() {
  const overdue = playTime - lastBombTime >= BOMB_INTERVAL;
  if (overdue || Math.random() < BOMB_CHANCE) {
    lastBombTime = playTime;
    return makePiece(BOMB);
  }
  return randomPiece();
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

// Limpia un área 3x3 del tablero centrada en (cx, cy).
function explodeBomb(cx, cy) {
  for (let r = cy - 1; r <= cy + 1; r++)
    for (let c = cx - 1; c <= cx + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
}

function merge() {
  if (current.type === BOMB) {
    explodeBomb(current.x, current.y);
    return;
  }
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
  // La tuerca (tipo 8) tapa su hueco central al bloquear para que la línea pueda limpiarse
  if (current.type === 8) {
    const cy = current.y + 1, cx = current.x + 1;
    if (cy >= 0 && cy < ROWS && cx >= 0 && cx < COLS) board[cy][cx] = 8;
  }
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = generateNext();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBombCell(context, x, y, size) {
  const cx = x * size + size / 2;
  const cy = y * size + size / 2;
  const r = size / 2 - 2;
  // cuerpo
  context.fillStyle = '#222831';
  context.beginPath();
  context.arc(cx, cy, r, 0, Math.PI * 2);
  context.fill();
  // borde para contraste en tema claro y oscuro
  context.strokeStyle = '#e57373';
  context.lineWidth = 2;
  context.stroke();
  // brillo
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.beginPath();
  context.arc(cx - r * 0.3, cy - r * 0.3, r * 0.28, 0, Math.PI * 2);
  context.fill();
  // mecha
  context.strokeStyle = '#ffb74d';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(cx, cy - r);
  context.lineTo(cx + r * 0.5, cy - r - 4);
  context.stroke();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  if (colorIndex === BOMB) {
    drawBombCell(context, x, y, size);
    context.globalAlpha = 1;
    return;
  }
  const color = COLORS[colorIndex];
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridLineColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// ---- Tabla de récords (localStorage) ----
function loadRecords() {
  try {
    const arr = JSON.parse(localStorage.getItem(RECORDS_KEY));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveRecords(arr) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(arr)); } catch {}
}

function qualifiesForTop(sc) {
  if (sc <= 0) return false;
  const recs = loadRecords();
  return recs.length < MAX_RECORDS || sc > recs[recs.length - 1].score;
}

// Inserta una entrada, reordena y recorta al top. Devuelve su índice final o -1.
function addRecord(entry) {
  const recs = loadRecords();
  recs.push(entry);
  recs.sort((a, b) => b.score - a.score);
  const trimmed = recs.slice(0, MAX_RECORDS);
  saveRecords(trimmed);
  return trimmed.indexOf(entry);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderRecords(container, highlightIndex) {
  const recs = loadRecords();
  if (!recs.length) {
    container.innerHTML = '<p class="records-empty">Aún no hay récords</p>';
    return;
  }
  let bestCombo = 0, maxLines = 0;
  let html = '<ol class="records-list">';
  recs.forEach((r, i) => {
    if ((r.combo || 0) > bestCombo) bestCombo = r.combo;
    if ((r.lines || 0) > maxLines) maxLines = r.lines;
    const cls = i === highlightIndex ? ' class="highlight"' : '';
    html += `<li${cls}><span class="rec-name">${escapeHtml(r.name)}</span>` +
            `<span class="rec-score">${Number(r.score).toLocaleString()}</span></li>`;
  });
  html += '</ol>';
  html += `<p class="records-stats">Mejor combo: <b>${bestCombo}</b> · ` +
          `Líneas máx: <b>${maxLines}</b></p>`;
  container.innerHTML = html;
}

function resetRecords() {
  if (!confirm('¿Borrar todos los récords?')) return;
  saveRecords([]);
  renderRecords(startRecords, -1);
  renderRecords(overlayRecords, -1);
}

function saveCurrentScore() {
  if (scoreSaved) return;
  const name = (nameInput.value.trim() || 'Anónimo').slice(0, 12);
  const idx = addRecord({ name, score, lines, combo: maxCombo });
  scoreSaved = true;
  nameEntry.classList.add('hidden');
  renderRecords(overlayRecords, idx);
}

function showStartScreen() {
  renderRecords(startRecords, -1);
  overlay.classList.add('hidden');
  startOverlay.classList.remove('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  scoreSaved = false;
  if (qualifiesForTop(score)) {
    nameInput.value = '';
    nameEntry.classList.remove('hidden');
    renderRecords(overlayRecords, -1);
  } else {
    nameEntry.classList.add('hidden');
    renderRecords(overlayRecords, -1);
  }
  overlayRecords.classList.remove('hidden');
  overlay.classList.remove('hidden');
  if (!nameEntry.classList.contains('hidden')) nameInput.focus();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    nameEntry.classList.add('hidden');
    overlayRecords.classList.add('hidden');
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  playTime += dt;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  playTime = 0;
  lastBombTime = 0;
  combo = 0;
  maxCombo = 0;
  lastTime = performance.now();
  next = generateNext();
  spawn();
  updateHUD();
  startOverlay.classList.add('hidden');
  overlay.classList.add('hidden');
  nameEntry.classList.add('hidden');
  overlayRecords.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === nameInput) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
playBtn.addEventListener('click', init);
saveScoreBtn.addEventListener('click', saveCurrentScore);
resetRecordsBtn.addEventListener('click', resetRecords);
resetRecordsStartBtn.addEventListener('click', resetRecords);
nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); saveCurrentScore(); }
});

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isLight = theme === 'light';
  themeToggle.setAttribute('aria-checked', String(isLight));
  themeToggle.setAttribute('aria-label', isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  gridLineColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('click', () => {
  const isLight = themeToggle.getAttribute('aria-checked') === 'true';
  const newTheme = isLight ? 'dark' : 'light';
  applyTheme(newTheme);
  localStorage.setItem(THEME_KEY, newTheme);
});

initTheme();
showStartScreen();
