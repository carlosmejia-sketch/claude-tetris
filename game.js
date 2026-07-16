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

// ---- Temas visuales / skins ----
// Cada skin define su paleta (índices 1-8, alineados con COLORS/PIECES) y una
// función draw(context, x, y, colorIndex, size) que dibuja una celda.
// Opcionalmente bg/grid sobrescriben el fondo y las líneas del tablero.

const NEON_COLORS = [
  null,
  '#00f0ff', '#ffe600', '#d500f9', '#00e676',
  '#ff1744', '#2979ff', '#ff9100', '#b0bec5',
];

const PASTEL_COLORS = [
  null,
  '#a0e7e5', '#fbf3a0', '#d8b4f8', '#b9fbc0',
  '#ffadad', '#a3c4f3', '#ffd6a5', '#cfd8dc',
];

// path de rectángulo redondeado (con fallback si roundRect no existe)
function roundRectPath(context, x, y, w, h, r) {
  if (context.roundRect) { context.beginPath(); context.roundRect(x, y, w, h, r); return; }
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

const SKINS = {
  // Retro: bloques cuadrados y colores planos (estilo original). Sigue el tema claro/oscuro.
  retro: {
    colors: COLORS,
    draw(context, x, y, idx, size) {
      const px = x * size, py = y * size;
      context.fillStyle = this.colors[idx];
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },

  // Neon: fondo negro y glow con shadowBlur.
  neon: {
    colors: NEON_COLORS,
    bg: '#000000',
    grid: '#101024',
    draw(context, x, y, idx, size) {
      const px = x * size, py = y * size;
      const color = this.colors[idx];
      context.save();
      context.shadowColor = color;
      context.shadowBlur = size * 0.4;
      context.fillStyle = color;
      context.fillRect(px + 2, py + 2, size - 4, size - 4);
      context.restore();
    },
  },

  // Pastel: colores suaves con bordes redondeados.
  pastel: {
    colors: PASTEL_COLORS,
    bg: '#fdfbff',
    grid: '#ece6f5',
    draw(context, x, y, idx, size) {
      const px = x * size, py = y * size;
      const pad = 1.5, r = size * 0.28;
      context.fillStyle = this.colors[idx];
      roundRectPath(context, px + pad, py + pad, size - 2 * pad, size - 2 * pad, r);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.4)';
      roundRectPath(context, px + pad + 2, py + pad + 2, size - 2 * pad - 4, (size - 2 * pad) * 0.4, r * 0.6);
      context.fill();
    },
  },

  // Pixel art: bisel tipo 8-bit + textura de pixeles sobre cada bloque.
  pixel: {
    colors: COLORS,
    bg: '#1e1e34',
    grid: '#2a2a48',
    draw(context, x, y, idx, size) {
      const px = x * size, py = y * size;
      const u = size / 8;
      context.fillStyle = this.colors[idx];
      context.fillRect(px, py, size, size);
      // bisel claro arriba/izquierda
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fillRect(px, py, size, u);
      context.fillRect(px, py, u, size);
      // bisel oscuro abajo/derecha
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.fillRect(px, py + size - u, size, u);
      context.fillRect(px + size - u, py, u, size);
      // textura de pixeles interior
      context.fillStyle = 'rgba(0,0,0,0.15)';
      context.fillRect(px + 2 * u, py + 2 * u, u, u);
      context.fillRect(px + 5 * u, py + 3 * u, u, u);
      context.fillRect(px + 3 * u, py + 5 * u, u, u);
    },
  },
};

const SKIN_KEY = 'tetris-skin';
let currentSkin = 'retro';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const pauseOverlay = document.getElementById('pause-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');
const gameoverScoreEl = document.getElementById('gameover-score');
const startOverlay = document.getElementById('start-overlay');
const startRecordsEl = document.getElementById('start-records');
const gameoverRecordsEl = document.getElementById('gameover-records');
const sideRecordsEl = document.getElementById('side-records');
const nameEntryEl = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveRecordBtn = document.getElementById('save-record-btn');
const restartBtn = document.getElementById('restart-btn');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsPanel = document.getElementById('controls-panel');
const levelDownBtn = document.getElementById('level-down');
const levelUpBtn = document.getElementById('level-up');
const startLevelValue = document.getElementById('start-level-value');

const THEME_KEY = 'tetris-theme';
const MIN_START_LEVEL = 1;
const MAX_START_LEVEL = 15;
const RECORDS_KEY = 'tetris-records';
const STATS_KEY = 'tetris-stats';
const MAX_RECORDS = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let playTime, lastBombTime, combo, maxCombo;
let startLevel = 1;
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
    level = Math.max(startLevel, Math.floor(lines / 10) + 1);
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
  SKINS[currentSkin].draw(context, x, y, colorIndex, size);
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

/* ---- Tabla de records (localStorage) ---- */

function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY));
    if (raw && typeof raw === 'object') {
      return { bestCombo: raw.bestCombo || 0, maxLines: raw.maxLines || 0 };
    }
  } catch { /* ignore */ }
  return { bestCombo: 0, maxLines: 0 };
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

// ¿La puntuación entra en el top MAX_RECORDS?
function qualifies(pts) {
  if (pts <= 0) return false;
  const records = loadRecords();
  if (records.length < MAX_RECORDS) return true;
  return pts > records[records.length - 1].score;
}

// Inserta un record ordenado; devuelve su índice en el top (o -1 si no entró).
function addRecord(name, pts, lns, lvl, cmb) {
  const records = loadRecords();
  const entry = { name: name || 'Jugador', score: pts, lines: lns, level: lvl, combo: cmb };
  records.push(entry);
  records.sort((a, b) => b.score - a.score);
  const trimmed = records.slice(0, MAX_RECORDS);
  saveRecords(trimmed);
  return trimmed.indexOf(entry);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function recordsHTML(highlightIndex = -1) {
  const records = loadRecords();
  const stats = loadStats();
  let rows;
  if (records.length === 0) {
    rows = '<li class="record-empty">Aún no hay records</li>';
  } else {
    rows = records.map((r, i) => `
      <li class="record-row${i === highlightIndex ? ' record-highlight' : ''}">
        <span class="record-rank">${i + 1}</span>
        <span class="record-name">${escapeHtml(r.name)}</span>
        <span class="record-score">${r.score.toLocaleString()}</span>
      </li>`).join('');
  }
  return `
    <p class="records-title">MEJORES PUNTUACIONES</p>
    <ol class="records-list">${rows}</ol>
    <div class="records-stats">
      <span>Mejor combo: <strong>${stats.bestCombo}</strong></span>
      <span>Líneas máximas: <strong>${stats.maxLines}</strong></span>
    </div>`;
}

function refreshRecordsUI(highlightIndex = -1) {
  const plain = recordsHTML();
  startRecordsEl.innerHTML = plain;
  sideRecordsEl.innerHTML = plain;
  gameoverRecordsEl.innerHTML = recordsHTML(highlightIndex);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);

  // Actualiza estadísticas globales (mejor combo / líneas máximas).
  const stats = loadStats();
  if (maxCombo > stats.bestCombo) stats.bestCombo = maxCombo;
  if (lines > stats.maxLines) stats.maxLines = lines;
  saveStats(stats);

  gameoverScoreEl.textContent = `Puntuación: ${score.toLocaleString()}`;

  if (qualifies(score)) {
    nameEntryEl.classList.remove('hidden');
    saveRecordBtn.disabled = false;
    nameInput.value = '';
    refreshRecordsUI();
    nameInput.focus();
  } else {
    nameEntryEl.classList.add('hidden');
    refreshRecordsUI();
  }

  gameoverOverlay.classList.remove('hidden');
}

function commitRecord() {
  if (saveRecordBtn.disabled) return;
  const idx = addRecord(nameInput.value.trim(), score, lines, level, maxCombo);
  saveRecordBtn.disabled = true;
  nameEntryEl.classList.add('hidden');
  refreshRecordsUI(idx);
}

function updateStartLevelUI() {
  startLevelValue.textContent = startLevel;
  levelDownBtn.disabled = startLevel <= MIN_START_LEVEL;
  levelUpBtn.disabled = startLevel >= MAX_START_LEVEL;
}

function setStartLevel(value) {
  startLevel = Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, value));
  updateStartLevelUI();
}

function openPauseMenu() {
  controlsPanel.classList.add('hidden');
  controlsBtn.setAttribute('aria-expanded', 'false');
  updateStartLevelUI();
  pauseOverlay.classList.remove('hidden');
}

function closePauseMenu() {
  pauseOverlay.classList.add('hidden');
}

function pauseGame() {
  if (gameOver || paused) return;
  paused = true;
  cancelAnimationFrame(animId);
  openPauseMenu();
}

function resumeGame() {
  if (gameOver || !paused) return;
  paused = false;
  closePauseMenu();
  lastTime = performance.now();
  loop(lastTime);
}

function togglePause() {
  if (gameOver) return;
  if (paused) resumeGame();
  else pauseGame();
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
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  playTime = 0;
  lastBombTime = 0;
  combo = 0;
  maxCombo = 0;
  lastTime = performance.now();
  next = generateNext();
  spawn();
  updateHUD();
  refreshRecordsUI();
  closePauseMenu();
  startOverlay.classList.add('hidden');
  gameoverOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function showStartScreen() {
  gameOver = true;
  paused = false;
  cancelAnimationFrame(animId);
  refreshRecordsUI();
  gameoverOverlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  startOverlay.classList.remove('hidden');
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  // Con el menú abierto (o game over) se bloquean todos los inputs del juego
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
saveRecordBtn.addEventListener('click', commitRecord);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') { e.preventDefault(); commitRecord(); }
});
resetRecordsBtn.addEventListener('click', () => {
  localStorage.removeItem(RECORDS_KEY);
  localStorage.removeItem(STATS_KEY);
  refreshRecordsUI();
});

resumeBtn.addEventListener('click', resumeGame);
pauseRestartBtn.addEventListener('click', init);
controlsBtn.addEventListener('click', () => {
  const open = controlsPanel.classList.toggle('hidden');
  controlsBtn.setAttribute('aria-expanded', String(!open));
});
levelDownBtn.addEventListener('click', () => setStartLevel(startLevel - 1));
levelUpBtn.addEventListener('click', () => setStartLevel(startLevel + 1));

// El color de la grilla lo fija la skin (si define grid); si no, sigue el tema CSS.
function updateGridColor() {
  const skin = SKINS[currentSkin];
  gridLineColor = skin.grid ||
    getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isLight = theme === 'light';
  themeToggle.setAttribute('aria-checked', String(isLight));
  themeToggle.setAttribute('aria-label', isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  updateGridColor();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

// Aplica una skin: fondo del tablero, color de grilla y función de dibujo.
function applySkin(key) {
  if (!SKINS[key]) key = 'retro';
  currentSkin = key;
  const skin = SKINS[key];
  // bg vacío => el canvas usa el fondo del tema (var CSS)
  canvas.style.background = skin.bg || '';
  nextCanvas.style.background = skin.bg || '';
  updateGridColor();
  if (skinSelect) skinSelect.value = key;
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  applySkin(saved && SKINS[saved] ? saved : 'retro');
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  localStorage.setItem(SKIN_KEY, currentSkin);
  // repinta de inmediato (sin recargar), incluso en pausa
  if (current) { draw(); drawNext(); }
});

themeToggle.addEventListener('click', () => {
  const isLight = themeToggle.getAttribute('aria-checked') === 'true';
  const newTheme = isLight ? 'dark' : 'light';
  applyTheme(newTheme);
  localStorage.setItem(THEME_KEY, newTheme);
});

initSkin();
initTheme();
showStartScreen();
