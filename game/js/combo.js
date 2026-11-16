// combo.js — the NOVA CHAIN: STARFORGE's scoring depth. When a nova blasts
// the whole orbit outward, every kill those nova-born rocks score within the
// chain window raises a multiplier — ×2, ×3, ×4 … — and the kill's points are
// multiplied by it. Chain fast or the window closes; the HUD badge counts it.

export const CHAIN_WINDOW_SECONDS = 2.0;
export const MAX_CHAIN_MULTIPLIER = 9;

export class NovaChain {
  constructor() {
    this.chainCount = 0; // kills chained since the nova
    this.expiresAt = -1; // game.time when the window closes
    this.novaAt = -1;
  }

  // A nova just fired: the chain is armed but no kill has landed yet.
  beginNova(now) {
    this.chainCount = 0;
    this.novaAt = now;
    this.expiresAt = now + CHAIN_WINDOW_SECONDS;
  }

  isActive(now) {
    return this.chainCount > 0 && now <= this.expiresAt;
  }

  isArmed(now) {
    return this.novaAt > 0 && now <= this.expiresAt;
  }

  currentMultiplier(now) {
    if (!this.isActive(now)) return 1;
    return Math.min(MAX_CHAIN_MULTIPLIER, 1 + this.chainCount);
  }

  // Register one nova-born kill. Returns the multiplier to score it with:
  // the first chained kill scores ×2, the next ×3, and so on. Each kill
  // refreshes the window, so a dense nova can keep climbing.
  registerKill(now) {
    if (this.expiresAt < 0 || now > this.expiresAt + 0.55) {
      // No live nova window (a nova near time zero still counts: the check
      // keys off expiresAt, never the sign of novaAt).
      return 1;
    }
    this.chainCount++;
    this.expiresAt = now + CHAIN_WINDOW_SECONDS;
    return Math.min(MAX_CHAIN_MULTIPLIER, 1 + this.chainCount);
  }

  reset() {
    this.chainCount = 0;
    this.expiresAt = -1;
    this.novaAt = -1;
  }
}
