// input.js — keyboard and mouse state for the game.
// The rest of the game reads two plain objects: `keys` (held right now) and
// `mouse` (arena coordinates + button). One-frame key presses are queued in
// `edges` so the update loop can ask "was Enter just pressed?" exactly once.

export const keys = Object.create(null);
export const mouse = { x: 640, y: 360, down: false, clicked: false };

const edges = new Set();
const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'ShiftLeft', 'ShiftRight',
  'Enter', 'KeyR', 'KeyM', 'KeyP', 'Digit1', 'Digit2', 'Digit3',
]);

// initInput(canvas, toWorld) — wire listeners. toWorld(clientX, clientY)
// converts page coordinates into arena coordinates for the mouse.
export function initInput(canvas, toWorld) {
  window.addEventListener('keydown', (ev) => {
    if (GAME_KEYS.has(ev.code)) ev.preventDefault();
    if (!ev.repeat) edges.add(ev.code);
    keys[ev.code] = true;
  });
  window.addEventListener('keyup', (ev) => {
    keys[ev.code] = false;
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    mouse.down = false;
  });

  canvas.addEventListener('mousemove', (ev) => {
    const p = toWorld(ev.clientX, ev.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
  });
  canvas.addEventListener('mousedown', (ev) => {
    const p = toWorld(ev.clientX, ev.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.down = true;
    mouse.clicked = true;
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
}

// pressed(code) — true only on the frame the key went down.
export function pressed(code) {
  return edges.has(code);
}

// endFrame() — clear one-frame signals; the main loop calls this last.
export function endFrame() {
  edges.clear();
  mouse.clicked = false;
}

// moveVector() — the player's steering input as a normalised {x, y}:
// WASD or arrow keys, diagonals already scaled to unit length.
export function moveVector() {
  let x = 0;
  let y = 0;
  if (keys.KeyA || keys.ArrowLeft) x -= 1;
  if (keys.KeyD || keys.ArrowRight) x += 1;
  if (keys.KeyW || keys.ArrowUp) y -= 1;
  if (keys.KeyS || keys.ArrowDown) y += 1;
  if (x !== 0 && y !== 0) {
    const inv = Math.SQRT1_2;
    x *= inv;
    y *= inv;
  }
  return { x, y };
}
