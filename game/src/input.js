// input.js — Keyboard and mouse state for STARFORGE.
//
// One object owns the whole input picture: which movement keys are held,
// where the mouse is (in canvas coordinates), and edge-triggered presses
// (clicked this frame, pressed this frame) that the game loop consumes.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseX = 640;
    this.mouseY = 360;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.anyGesture = false;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      if (!e.repeat) this.pressed.add(e.key.toLowerCase());
      this.keys.add(e.key.toLowerCase());
      this.anyGesture = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });

    const toCanvas = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    };
    canvas.addEventListener('mousemove', (e) => {
      const p = toCanvas(e);
      this.mouseX = p.x;
      this.mouseY = p.y;
    });
    canvas.addEventListener('mousedown', (e) => {
      const p = toCanvas(e);
      this.mouseX = p.x;
      this.mouseY = p.y;
      this.mouseDown = true;
      this.mouseClicked = true;
      this.anyGesture = true;
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Held-down movement vector, normalised. WASD or arrow keys.
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.hypot(x, y);
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  // True only on the frame the key went down.
  wasPressed(key) {
    return this.pressed.has(key.toLowerCase());
  }

  isDown(key) {
    return this.keys.has(key.toLowerCase());
  }

  // Aim angle from a point (px, py) toward the mouse.
  aimAngle(px, py) {
    return Math.atan2(this.mouseY - py, this.mouseX - px);
  }

  // Clear edge-triggered flags at the end of each frame.
  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
  }
}
