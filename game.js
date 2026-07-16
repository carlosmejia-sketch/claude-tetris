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

// Paletas por skin (índices 1-7 = piezas normales). Nut(8)/Bomba(9) conservan
// su tratamiento propio (se toman de COLORS via buildColors).
const RETRO_PALETTE  = ['#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#64b5f6', '#ffb74d'];
const NEON_PALETTE   = ['#00eaff', '#fff600', '#ff2fd0', '#39ff14', '#ff003c', '#2979ff', '#ff9100'];
const PASTEL_PALETTE = ['#a0e7e5', '#fbf8cc', '#d0bdf4', '#b9fbc0', '#ffb3c1', '#a3c4f3', '#ffd6a5'];
const PIXEL_PALETTE  = ['#00b8d4', '#ffca28', '#ab47bc', '#66bb6a', '#ef5350', '#42a5f5', '#ffa726'];

// Cada skin aporta su paleta y su función de dibujo de celda normal. drawBlock
// consulta la skin activa. Las funciones drawCell están declaradas más abajo
// (el hoisting de function declarations las hace visibles aquí).
const SKINS = {
  retro:  { label: 'Retro',  palette: RETRO_PALETTE,  drawCell: drawRetroCell },
  neon:   { label: 'Neón',   palette: NEON_PALETTE,   drawCell: drawNeonCell },
  pastel: { label: 'Pastel', palette: PASTEL_PALETTE, drawCell: drawPastelCell },
  pixel:  { label: 'Pixel',  palette: PIXEL_PALETTE,  drawCell: drawPixelCell },
};

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
const overlayRecords = document.getElementById('overlay-records');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const restartBtn = document.getElementById('restart-btn');
const startOverlay = document.getElementById('start-overlay');
const startRecords = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const themeToggle = document.getElementById('theme-toggle');
const gameoverBox = document.getElementById('gameover-box');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const toggleControlsBtn = document.getElementById('toggle-controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';
const START_LEVEL_KEY = 'tetris-start-level';
const SKIN_KEY = 'tetris-skin';
const HIGHSCORES_KEY = 'tetris-highscores';
const MAX_SCORES = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let playTime, lastBombTime, combo, maxCombo;
let startLevel = 1;
let scoreSaved;
let gridLineColor = '#22222e';
let activeSkin = 'retro';
// Paleta activa (1-indexada, con null líder y Nut/Bomba al final). La define applySkin().
let activeColors = buildColors(RETRO_PALETTE);

// Construye la paleta 1-indexada de la skin activa conservando Nut(8) y Bomba(9).
function buildColors(palette) {
  return [null, ...palette, COLORS[8], COLORS[9]];
}

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
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    updateHUD();
  }
  return cleared;
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
  const cleared = clearLines();
  if (!cleared) combo = 0;
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

// Trazado de rectángulo con esquinas redondeadas (fallback portable, no depende
// de CanvasRenderingContext2D.roundRect).
function roundRectPath(context, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// --- Renderizadores de celda por skin ---

// Retro: bloque cuadrado, color plano + highlight (estilo original).
function drawRetroCell(context, x, y, color, size) {
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

// Neón: bloque hueco con borde brillante y glow (shadowBlur/shadowColor).
// Usa save/restore para no contaminar el estado del contexto (shadow, etc.).
function drawNeonCell(context, x, y, color, size) {
  const px = x * size + 2, py = y * size + 2, s = size - 4;
  context.save();
  context.shadowColor = color;
  context.shadowBlur = 10;
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  // núcleo oscuro para que el color se lea como neón
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(0,0,0,0.55)';
  context.fillRect(px + 3, py + 3, s - 6, s - 6);
  // borde brillante con glow
  context.shadowBlur = 8;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 1, py + 1, s - 2, s - 2);
  context.restore();
}

// Pastel: colores suaves con esquinas redondeadas y highlight tenue.
function drawPastelCell(context, x, y, color, size) {
  const px = x * size + 2, py = y * size + 2, s = size - 4;
  const r = Math.max(3, s / 4);
  context.fillStyle = color;
  roundRectPath(context, px, py, s, s, r);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.28)';
  roundRectPath(context, px, py, s, s * 0.45, r);
  context.fill();
}

// Pixel art: color base + sub-cuadrícula de dithering (tablero de ajedrez) y borde.
function drawPixelCell(context, x, y, color, size) {
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  const n = 4;
  const cell = s / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      context.fillStyle = (i + j) % 2 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.18)';
      context.fillRect(px + i * cell, py + j * cell, cell, cell);
    }
  }
  context.strokeStyle = 'rgba(0,0,0,0.45)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  if (colorIndex === BOMB) {
    drawBombCell(context, x, y, size);
    context.globalAlpha = 1;
    return;
  }
  const color = activeColors[colorIndex];
  SKINS[activeSkin].drawCell(context, x, y, color, size);
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

// ---- Tabla de records (localStorage) ----
function loadHighscores() {
  try {
    const data = JSON.parse(localStorage.getItem(HIGHSCORES_KEY));
    const scores = Array.isArray(data && data.scores) ? data.scores : [];
    scores.sort((a, b) => (b.score || 0) - (a.score || 0));
    return {
      scores: scores.slice(0, MAX_SCORES),
      bestCombo: (data && data.bestCombo) || 0,
      maxLines: (data && data.maxLines) || 0,
    };
  } catch {
    return { scores: [], bestCombo: 0, maxLines: 0 };
  }
}

function saveHighscores(data) {
  localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(data));
}

function qualifiesForTop(sc) {
  if (sc <= 0) return false;
  const { scores } = loadHighscores();
  return scores.length < MAX_SCORES || sc > scores[scores.length - 1].score;
}

// Guarda estadísticas globales (mejor combo, líneas máx) sin importar el top 5.
function updateGlobalRecords(comboThisGame, linesThisGame) {
  const data = loadHighscores();
  let changed = false;
  if (comboThisGame > data.bestCombo) { data.bestCombo = comboThisGame; changed = true; }
  if (linesThisGame > data.maxLines) { data.maxLines = linesThisGame; changed = true; }
  if (changed) saveHighscores(data);
}

// Inserta una entrada en el top 5 y devuelve su índice (para resaltarla), o -1.
function addHighscore(entry) {
  const data = loadHighscores();
  data.scores.push(entry);
  data.scores.sort((a, b) => (b.score || 0) - (a.score || 0));
  data.scores = data.scores.slice(0, MAX_SCORES);
  saveHighscores(data);
  return data.scores.indexOf(entry);
}

function resetHighscores() {
  localStorage.removeItem(HIGHSCORES_KEY);
  renderRecords(startRecords, -1);
}

// Construye la tabla de records dentro de `container` usando textContent (sin inyección HTML).
function renderRecords(container, highlightIndex) {
  const data = loadHighscores();
  container.textContent = '';

  const heading = document.createElement('p');
  heading.className = 'records-title';
  heading.textContent = 'Records';
  container.appendChild(heading);

  if (data.scores.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'records-empty';
    empty.textContent = 'Sin records todavía';
    container.appendChild(empty);
  } else {
    const table = document.createElement('table');
    table.className = 'records-table';

    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['#', 'Nombre', 'Puntuación', 'Líneas', 'Combo'].forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    data.scores.forEach((s, i) => {
      const tr = document.createElement('tr');
      if (i === highlightIndex) tr.className = 'highlight';
      const cells = [
        String(i + 1),
        s.nombre || '—',
        (s.score || 0).toLocaleString(),
        String(s.lines || 0),
        String(s.combo || 0),
      ];
      cells.forEach(c => {
        const td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  const stats = document.createElement('p');
  stats.className = 'records-stats';
  stats.textContent = `Mejor combo: ${data.bestCombo} · Líneas máx: ${data.maxLines}`;
  container.appendChild(stats);
}

function saveScore() {
  if (scoreSaved) return;
  const raw = nameInput.value.trim();
  const nombre = (raw || 'Anónimo').slice(0, 12);
  const entry = {
    nombre,
    score,
    lines,
    combo: maxCombo,
    date: new Date().toISOString().slice(0, 10),
  };
  const idx = addHighscore(entry);
  scoreSaved = true;
  nameEntry.classList.add('hidden');
  renderRecords(overlayRecords, idx);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  updateGlobalRecords(maxCombo, lines);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  pauseMenu.classList.add('hidden');
  gameoverBox.classList.remove('hidden');

  if (qualifiesForTop(score)) {
    scoreSaved = false;
    nameInput.value = '';
    nameEntry.classList.remove('hidden');
  } else {
    nameEntry.classList.add('hidden');
  }

  renderRecords(overlayRecords, -1);
  overlayRecords.classList.remove('hidden');
  overlay.classList.remove('hidden');
  if (!nameEntry.classList.contains('hidden')) nameInput.focus();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    // Evita que la tecla/clic que reanuda dispare un movimiento residual.
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    gameoverBox.classList.add('hidden');
    pauseMenu.classList.remove('hidden');
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
  if (!gameOver && !paused) animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  level = startLevel;
  lines = (level - 1) * 10;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  playTime = 0;
  lastBombTime = 0;
  combo = 0;
  maxCombo = 0;
  scoreSaved = false;
  lastTime = performance.now();
  next = generateNext();
  spawn();
  updateHUD();
  nameEntry.classList.add('hidden');
  overlayRecords.classList.add('hidden');
  overlay.classList.add('hidden');
  startOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function showStartScreen() {
  renderRecords(startRecords, -1);
  startOverlay.classList.remove('hidden');
}

document.addEventListener('keydown', e => {
  if (!current) return; // juego aún no iniciado (pantalla de inicio)
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
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
saveScoreBtn.addEventListener('click', saveScore);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') { e.preventDefault(); saveScore(); }
});
resetRecordsBtn.addEventListener('click', () => {
  if (window.confirm('¿Borrar todos los records?')) resetHighscores();
});

resumeBtn.addEventListener('click', () => {
  resumeBtn.blur();
  if (paused) togglePause();
});

pauseRestartBtn.addEventListener('click', () => {
  pauseRestartBtn.blur();
  init();
});

toggleControlsBtn.addEventListener('click', () => {
  const nowHidden = pauseControls.classList.toggle('hidden');
  toggleControlsBtn.textContent = nowHidden ? 'Ver controles' : 'Ocultar controles';
});

startLevelSelect.addEventListener('change', () => {
  const val = parseInt(startLevelSelect.value, 10);
  startLevel = (val >= 1 && val <= 10) ? val : 1;
  localStorage.setItem(START_LEVEL_KEY, String(startLevel));
});

function initStartLevel() {
  const saved = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
  startLevel = (saved >= 1 && saved <= 10) ? saved : 1;
  startLevelSelect.value = String(startLevel);
}

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

// Skin: dimensión independiente del tema claro/oscuro. Cambia la paleta y la
// función de dibujo de bloques en ambos canvas, sin recargar.
function applySkin(skin) {
  if (!SKINS[skin]) skin = 'retro';
  activeSkin = skin;
  activeColors = buildColors(SKINS[skin].palette);
  document.documentElement.setAttribute('data-skin', skin);
  // algunas skins (neón) ajustan --grid-line vía CSS; re-leer el valor efectivo
  gridLineColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
  if (skinSelect) skinSelect.value = skin;
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  applySkin(SKINS[saved] ? saved : 'retro');
}

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    applySkin(skinSelect.value);
    localStorage.setItem(SKIN_KEY, skinSelect.value);
    // refrescar de inmediato (importante si el juego está en pausa)
    if (current) draw();
    if (next) drawNext();
  });
}

initTheme();
initStartLevel();
initSkin();
showStartScreen();
