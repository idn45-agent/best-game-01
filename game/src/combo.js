// combo.js — the NOVA CHAIN: the game's scoring heart.
// A kill made by a flung rock starts a chain; every further flung-rock kill
// inside the chain window grows it. The score multiplier is 1 + chain, so a
// chain of 2 pays ×3 — and the HUD badge shows exactly that number. Chains
// reward the nova play most: a nova throws every orbiting rock at once, so
// a good nova can stack several chain kills inside one window.

// createCombo() — a fresh chain state for a new run.
export function createCombo() {
  return { chain: 0, timer: 0, best: 0 };
}

// comboHit(G) — register one flung-rock kill. Refreshes the window, grows
// the chain, tracks the run's best, and returns the multiplier it earned.
export function comboHit(G) {
  const c = G.combo;
  c.chain += 1;
  c.timer = G.mods.comboWindow;
  if (c.chain > c.best) {
    c.best = c.chain;
    G.stats.maxChain = c.best;
  }
  return comboMult(G);
}

// comboMult(G) — the score multiplier a kill earns right now: 1 + chain,
// scaled by the Chain Reactor upgrade's bonus factor.
export function comboMult(G) {
  if (G.combo.chain <= 0) return 1;
  return (1 + G.combo.chain) * G.mods.comboBonus;
}

// comboActive(G) — is a chain currently on the clock?
export function comboActive(G) {
  return G.combo.chain > 0 && G.combo.timer > 0;
}

// comboFrac(G) — window fraction left, for the badge's draining bar.
export function comboFrac(G) {
  if (G.mods.comboWindow <= 0) return 0;
  return Math.max(0, G.combo.timer / G.mods.comboWindow);
}

// updateCombo(dt) — run the clock down; an expired window ends the chain.
export function updateCombo(G, dt) {
  const c = G.combo;
  if (c.timer > 0) {
    c.timer -= dt;
    if (c.timer <= 0) {
      c.timer = 0;
      c.chain = 0;
    }
  }
}
