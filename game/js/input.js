// input.js — keyboard and mouse state for STARFORGE.
// Keeps a held-key set for movement, a per-frame pressed set for one-shot
// actions (fling, nova, pause), and the mouse position in canvas pixels.

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 640, y: 300, down: false, clicked: false };

  function toCanvas(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) * (canvas.width / rect.width),
      y: (evt.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  window.addEventListener('keydown', (evt) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(evt.code)) {
      evt.preventDefault();
    }
    if (!evt.repeat) pressed.add(evt.code);
    held.add(evt.code);
  });
  window.addEventListener('keyup', (evt) => held.delete(evt.code));
  window.addEventListener('blur', () => { held.clear(); mouse.down = false; });

  canvas.addEventListener('mousemove', (evt) => {
    const p = toCanvas(evt);
    mouse.x = p.x; mouse.y = p.y;
  });
  canvas.addEventListener('mousedown', (evt) => {
    const p = toCanvas(evt);
    mouse.x = p.x; mouse.y = p.y;
    mouse.down = true;
    mouse.clicked = true;
  });
  window.addEventListener('mouseup', () => { mouse.down = false; });

  return {
    mouse,
    isDown: (...codes) => codes.some((c) => held.has(c)),
    wasPressed: (code) => pressed.has(code),
    // Called once at the end of each frame by the game loop.
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
  };
}
