// input.js — keyboard and mouse, translated into game intent. Held keys give
// a movement vector; discrete presses (fling, nova, pause, mute, start,
// restart) are queued as one-shot actions that main.js drains each frame, so
// a press is never lost between frames and never fires twice.

import { WORLD_W, WORLD_H, clamp } from './world.js';

const MOVE_KEYS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

export function createInput(canvas) {
  const held = new Set();
  const queue = [];
  const mouse = { x: WORLD_W / 2, y: WORLD_H / 3, down: false };

  function toWorld(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * WORLD_W, 0, WORLD_W),
      y: clamp(((event.clientY - rect.top) / rect.height) * WORLD_H, 0, WORLD_H),
    };
  }

  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS[event.code]) {
      held.add(MOVE_KEYS[event.code]);
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    switch (event.code) {
      case 'Space':
        queue.push('fling');
        queue.push('start');
        event.preventDefault();
        break;
      case 'KeyE':
      case 'ShiftLeft':
      case 'ShiftRight':
        queue.push('nova');
        break;
      case 'KeyP':
      case 'Escape':
        queue.push('pause');
        break;
      case 'KeyM':
        queue.push('mute');
        break;
      case 'Enter':
        queue.push('start');
        break;
      case 'KeyR':
        queue.push('restart');
        break;
      default:
        break;
    }
  });

  window.addEventListener('keyup', (event) => {
    if (MOVE_KEYS[event.code]) held.delete(MOVE_KEYS[event.code]);
  });

  canvas.addEventListener('mousemove', (event) => {
    const pt = toWorld(event);
    mouse.x = pt.x;
    mouse.y = pt.y;
  });

  canvas.addEventListener('mousedown', (event) => {
    const pt = toWorld(event);
    mouse.x = pt.x;
    mouse.y = pt.y;
    mouse.down = true;
    queue.push('fling');
    queue.push('start');
  });

  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    // Movement vector in [-1, 1] on each axis, normalized by the caller.
    moveVector() {
      let mx = 0;
      let my = 0;
      if (held.has('left')) mx -= 1;
      if (held.has('right')) mx += 1;
      if (held.has('up')) my -= 1;
      if (held.has('down')) my += 1;
      return { mx, my };
    },
    // One-shot actions pressed since the last drain.
    drainActions() {
      const out = queue.slice();
      queue.length = 0;
      return out;
    },
  };
}
