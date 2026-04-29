// ── Constants ─────────────────────────────────────────────────────────────────
const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = {
    I: '#06b6d4',
    O: '#facc15',
    T: '#a855f7',
    S: '#4ade80',
    Z: '#f87171',
    J: '#60a5fa',
    L: '#fb923c',
    GHOST: 'rgba(255,255,255,0.08)',
    GHOST_BORDER: 'rgba(255,255,255,0.25)',
};

const PIECES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
};

const SCORE_TABLE = [0, 100, 300, 500, 800];
const LEVEL_LINES = 10;
const LOCK_DELAY = 500;

// ── Canvas setup ──────────────────────────────────────────────────────────────
const boardCanvas = document.getElementById('board');
const ctx = boardCanvas.getContext('2d');

const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');

const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');

// ── State ─────────────────────────────────────────────────────────────────────
let board, current, next, held, canHold;
let score, level, lines;
let gameRunning, paused, gameOver;
let dropTimer, lockTimer;
let lastTime;
let animFrame;

const pieceKeys = Object.keys(PIECES);

function randomPiece() {
    const key = pieceKeys[Math.floor(Math.random() * pieceKeys.length)];
    return { type: key, matrix: PIECES[key].map(r => [...r]), x: 3, y: 0 };
}

function initGame() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    next = randomPiece();
    held = null;
    canHold = true;
    score = 0;
    level = 1;
    lines = 0;
    gameRunning = true;
    paused = false;
    gameOver = false;
    dropTimer = 0;
    lockTimer = null;
    updateUI();
    spawnPiece();
}

function spawnPiece() {
    current = next;
    next = randomPiece();
    current.x = Math.floor((COLS - current.matrix[0].length) / 2);
    current.y = 0;
    canHold = true;

    if (collides(current)) {
        triggerGameOver();
    }
}

// ── Collision ─────────────────────────────────────────────────────────────────
function collides(piece, dx = 0, dy = 0, matrix = null) {
    const m = matrix || piece.matrix;
    for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
            if (!m[r][c]) continue;
            const nx = piece.x + c + dx;
            const ny = piece.y + r + dy;
            if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
            if (ny >= 0 && board[ny][nx]) return true;
        }
    }
    return false;
}

// ── Rotation (SRS wall kicks) ─────────────────────────────────────────────────
const WALL_KICKS = {
    default: [
        [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
        [[0,0],[1,0],[1,-1],[0,2],[1,2]],
        [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
        [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    ],
    I: [
        [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
        [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
        [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
        [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    ],
};

function rotate(matrix) {
    const N = matrix.length;
    const M = matrix[0].length;
    const result = Array.from({ length: M }, () => Array(N).fill(0));
    for (let r = 0; r < N; r++)
        for (let c = 0; c < M; c++)
            result[c][N - 1 - r] = matrix[r][c];
    return result;
}

let rotationState = 0;

function tryRotate() {
    const rotated = rotate(current.matrix);
    const kicks = (current.type === 'I' ? WALL_KICKS.I : WALL_KICKS.default)[rotationState % 4];
    for (const [kx, ky] of kicks) {
        if (!collides(current, kx, ky, rotated)) {
            current.matrix = rotated;
            current.x += kx;
            current.y += ky;
            rotationState = (rotationState + 1) % 4;
            resetLockTimer();
            return;
        }
    }
}

// ── Lock delay ────────────────────────────────────────────────────────────────
function resetLockTimer() {
    if (lockTimer) clearTimeout(lockTimer);
    if (collides(current, 0, 1)) {
        lockTimer = setTimeout(lockPiece, LOCK_DELAY);
    } else {
        lockTimer = null;
    }
}

function lockPiece() {
    lockTimer = null;
    for (let r = 0; r < current.matrix.length; r++) {
        for (let c = 0; c < current.matrix[r].length; c++) {
            if (!current.matrix[r][c]) continue;
            const ny = current.y + r;
            const nx = current.x + c;
            if (ny < 0) { triggerGameOver(); return; }
            board[ny][nx] = current.type;
        }
    }
    clearLines();
    spawnPiece();
    drawNext();
    drawHold();
}

// ── Line clear ────────────────────────────────────────────────────────────────
function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].every(cell => cell !== null)) {
            board.splice(r, 1);
            board.unshift(Array(COLS).fill(null));
            cleared++;
            r++;
        }
    }
    if (cleared > 0) {
        lines += cleared;
        score += SCORE_TABLE[cleared] * level;
        level = Math.floor(lines / LEVEL_LINES) + 1;
        updateUI();
    }
}

// ── Hold ──────────────────────────────────────────────────────────────────────
function holdPiece() {
    if (!canHold) return;
    canHold = false;
    rotationState = 0;
    if (held) {
        const temp = held;
        held = { type: current.type, matrix: PIECES[current.type].map(r => [...r]) };
        current = { ...temp, x: Math.floor((COLS - temp.matrix[0].length) / 2), y: 0 };
    } else {
        held = { type: current.type, matrix: PIECES[current.type].map(r => [...r]) };
        spawnPiece();
    }
    drawHold();
}

// ── Hard drop ─────────────────────────────────────────────────────────────────
function hardDrop() {
    let dropped = 0;
    while (!collides(current, 0, 1)) {
        current.y++;
        dropped++;
    }
    score += dropped * 2;
    updateUI();
    if (lockTimer) clearTimeout(lockTimer);
    lockPiece();
}

// ── Ghost piece ───────────────────────────────────────────────────────────────
function getGhostY() {
    let gy = current.y;
    while (!collides({ ...current, y: gy + 1 })) gy++;
    return gy;
}

// ── Drop speed ────────────────────────────────────────────────────────────────
function dropInterval() {
    return Math.max(100, 1000 - (level - 1) * 80);
}

// ── Game loop ─────────────────────────────────────────────────────────────────
function gameLoop(ts) {
    if (!gameRunning || paused || gameOver) return;
    const dt = ts - (lastTime || ts);
    lastTime = ts;

    dropTimer += dt;
    if (dropTimer >= dropInterval()) {
        dropTimer = 0;
        if (!collides(current, 0, 1)) {
            current.y++;
            if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
        } else {
            resetLockTimer();
        }
    }

    drawBoard();
    animFrame = requestAnimationFrame(gameLoop);
}

// ── Drawing ───────────────────────────────────────────────────────────────────
function drawBlock(context, x, y, color, size = BLOCK) {
    const pad = 1;
    context.fillStyle = color;
    context.fillRect(x * size + pad, y * size + pad, size - pad * 2, size - pad * 2);

    // Highlight
    context.fillStyle = 'rgba(255,255,255,0.18)';
    context.fillRect(x * size + pad, y * size + pad, size - pad * 2, 4);
    context.fillRect(x * size + pad, y * size + pad, 4, size - pad * 2);

    // Shadow
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(x * size + size - pad - 4, y * size + pad, 4, size - pad * 2);
    context.fillRect(x * size + pad, y * size + size - pad - 4, size - pad * 2, 4);
}

function drawGhostBlock(context, x, y, size = BLOCK) {
    const pad = 1;
    context.strokeStyle = COLORS.GHOST_BORDER;
    context.lineWidth = 1;
    context.strokeRect(x * size + pad + 0.5, y * size + pad + 0.5, size - pad * 2 - 1, size - pad * 2 - 1);
    context.fillStyle = COLORS.GHOST;
    context.fillRect(x * size + pad, y * size + pad, size - pad * 2, size - pad * 2);
}

function drawBoard() {
    // Background
    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath(); ctx.moveTo(0, r * BLOCK); ctx.lineTo(COLS * BLOCK, r * BLOCK); ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
        ctx.beginPath(); ctx.moveTo(c * BLOCK, 0); ctx.lineTo(c * BLOCK, ROWS * BLOCK); ctx.stroke();
    }

    // Placed blocks
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c]) drawBlock(ctx, c, r, COLORS[board[r][c]]);
        }
    }

    if (!current) return;

    // Ghost
    const ghostY = getGhostY();
    for (let r = 0; r < current.matrix.length; r++) {
        for (let c = 0; c < current.matrix[r].length; c++) {
            if (current.matrix[r][c]) {
                drawGhostBlock(ctx, current.x + c, ghostY + r);
            }
        }
    }

    // Current piece
    for (let r = 0; r < current.matrix.length; r++) {
        for (let c = 0; c < current.matrix[r].length; c++) {
            if (current.matrix[r][c]) {
                drawBlock(ctx, current.x + c, current.y + r, COLORS[current.type]);
            }
        }
    }
}

function drawMiniPiece(context, canvasEl, piece, bgColor = '#05050a') {
    const size = canvasEl.width;
    context.fillStyle = bgColor;
    context.fillRect(0, 0, size, size);
    if (!piece) return;

    const m = piece.matrix;
    const rows = m.length;
    const cols = m[0].length;
    const blockSize = Math.min(Math.floor(size / (Math.max(rows, cols) + 1)), 28);
    const offsetX = Math.floor((size - cols * blockSize) / 2);
    const offsetY = Math.floor((size - rows * blockSize) / 2);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (m[r][c]) {
                const bx = offsetX + c * blockSize;
                const by = offsetY + r * blockSize;
                const pad = 1;
                context.fillStyle = COLORS[piece.type];
                context.fillRect(bx + pad, by + pad, blockSize - pad * 2, blockSize - pad * 2);
                context.fillStyle = 'rgba(255,255,255,0.18)';
                context.fillRect(bx + pad, by + pad, blockSize - pad * 2, 3);
                context.fillStyle = 'rgba(0,0,0,0.25)';
                context.fillRect(bx + pad, by + blockSize - pad - 3, blockSize - pad * 2, 3);
            }
        }
    }
}

function drawNext() {
    drawMiniPiece(nextCtx, nextCanvas, next);
}

function drawHold() {
    drawMiniPiece(holdCtx, holdCanvas, held);
}

// ── UI ────────────────────────────────────────────────────────────────────────
function updateUI() {
    document.getElementById('score').textContent = score.toLocaleString();
    document.getElementById('level').textContent = level;
    document.getElementById('lines').textContent = lines;
}

function showOverlay(title, sub) {
    const overlay = document.getElementById('overlay');
    document.getElementById('overlay-title').textContent = title;
    document.getElementById('overlay-sub').textContent = sub;
    overlay.classList.remove('hidden');
    document.getElementById('btn-start').textContent = gameOver ? '다시 시작' : '게임 시작';
}

function hideOverlay() {
    document.getElementById('overlay').classList.add('hidden');
}

function triggerGameOver() {
    gameRunning = false;
    gameOver = true;
    if (lockTimer) clearTimeout(lockTimer);
    cancelAnimationFrame(animFrame);
    showOverlay('GAME OVER', `점수: ${score.toLocaleString()} | 레벨: ${level}`);
}

// ── Input ─────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (!gameRunning) return;
    if (paused && e.code !== 'KeyP') return;

    switch (e.code) {
        case 'ArrowLeft':
            e.preventDefault();
            if (!collides(current, -1, 0)) { current.x--; resetLockTimer(); }
            break;
        case 'ArrowRight':
            e.preventDefault();
            if (!collides(current, 1, 0)) { current.x++; resetLockTimer(); }
            break;
        case 'ArrowDown':
            e.preventDefault();
            if (!collides(current, 0, 1)) { current.y++; score++; updateUI(); resetLockTimer(); }
            break;
        case 'ArrowUp':
            e.preventDefault();
            tryRotate();
            break;
        case 'Space':
            e.preventDefault();
            hardDrop();
            break;
        case 'KeyC':
        case 'ShiftLeft':
        case 'ShiftRight':
            holdPiece();
            break;
        case 'KeyP':
            togglePause();
            break;
    }
    drawBoard();
});

function togglePause() {
    if (!gameRunning || gameOver) return;
    paused = !paused;
    if (paused) {
        cancelAnimationFrame(animFrame);
        showOverlay('PAUSED', 'P 키로 계속');
    } else {
        hideOverlay();
        lastTime = performance.now();
        animFrame = requestAnimationFrame(gameLoop);
    }
}

// Start / restart button
document.getElementById('btn-start').addEventListener('click', () => {
    hideOverlay();
    initGame();
    drawNext();
    drawHold();
    lastTime = performance.now();
    animFrame = requestAnimationFrame(gameLoop);
});

// Mobile buttons
function addMobileBtn(id, action) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const fire = (e) => {
        e.preventDefault();
        if (!gameRunning || paused || gameOver) return;
        action();
        drawBoard();
    };
    btn.addEventListener('touchstart', fire, { passive: false });
    btn.addEventListener('mousedown', fire);
}

addMobileBtn('btn-left', () => { if (!collides(current, -1, 0)) { current.x--; resetLockTimer(); } });
addMobileBtn('btn-right', () => { if (!collides(current, 1, 0)) { current.x++; resetLockTimer(); } });
addMobileBtn('btn-down', () => { if (!collides(current, 0, 1)) { current.y++; score++; updateUI(); resetLockTimer(); } });
addMobileBtn('btn-rotate', () => tryRotate());
addMobileBtn('btn-drop', () => hardDrop());
addMobileBtn('btn-hold', () => holdPiece());

document.getElementById('btn-pause')?.addEventListener('click', (e) => { e.preventDefault(); togglePause(); });

// ── Responsive canvas ─────────────────────────────────────────────────────────
function resizeCanvas() {
    const isMobile = window.innerWidth <= 600;
    const blockSize = isMobile ? 20 : 30;
    boardCanvas.width = COLS * blockSize;
    boardCanvas.height = ROWS * blockSize;

    // Patch BLOCK constant via closure — redraw uses the canvas dimensions
    Object.defineProperty(window, '_BLOCK', { value: blockSize, writable: true, configurable: true });

    if (gameRunning && !paused) drawBoard();
}

// Use canvas CSS sizing for responsive instead of redrawing with different block sizes.
// Keep BLOCK = 30 (desktop). On mobile, CSS scales via width attribute.

// ── Init ──────────────────────────────────────────────────────────────────────
// Draw empty board on load
(function initDraw() {
    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    nextCtx.fillStyle = '#05050a';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    holdCtx.fillStyle = '#05050a';
    holdCtx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
})();
