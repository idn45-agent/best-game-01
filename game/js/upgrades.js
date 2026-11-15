// upgrades.js — the level-up pool. When the star levels, the game pauses
// and offers three of these; each one bends a different part of the
// gravity-weapon loop, so builds diverge run to run.

export const UPGRADES = [
  {
    id: 'orbit', name: 'Wider Ring', color: '#54f0ff',
    desc: '+2 orbit capacity — carry more rocks at once',
    apply(star) { star.orbitCapacity += 2; },
  },
  {
    id: 'gravity', name: 'Deep Well', color: '#7dffcb',
    desc: '+30 gravity radius — capture asteroids from farther out',
    apply(star) { star.gravityRadius += 30; },
  },
  {
    id: 'damage', name: 'Dense Core', color: '#ffd166',
    desc: '+45% fling damage — every thrown rock hits harder',
    apply(star) { star.flingDamage = Math.round(star.flingDamage * 1.45); },
  },
  {
    id: 'nova', name: 'Short Fuse', color: '#ff3ea8',
    desc: 'Nova recharges 30% faster and hits 25% harder',
    apply(star) {
      star.novaCooldownMax = Math.max(3.5, star.novaCooldownMax * 0.7);
      star.novaDamage = Math.round(star.novaDamage * 1.25);
    },
  },
  {
    id: 'hull', name: 'Rekindle', color: '#ff7847',
    desc: '+25 max hull and repair 40 hull now',
    apply(star) {
      star.maxHull += 25;
      star.hull = Math.min(star.maxHull, star.hull + 40);
    },
  },
  {
    id: 'magnet', name: 'Shard Pull', color: '#ffe066',
    desc: '+70 XP magnet radius — shards fly to you from farther away',
    apply(star) { star.magnet += 70; },
  },
  {
    id: 'multi', name: 'Twin Throw', color: '#b46bff',
    desc: 'Fling one extra rock with every throw',
    apply(star) { star.multiFling += 1; },
  },
  {
    id: 'speed', name: 'Solar Wind', color: '#a8e6ff',
    desc: '+12% move speed and +15% fling rate',
    apply(star) {
      star.speed = Math.round(star.speed * 1.12);
      star.flingRate = Math.max(0.1, star.flingRate * 0.85);
    },
  },
];

// Picks three distinct upgrades, seeded so demo runs are reproducible.
export function rollChoices(rng) {
  const pool = [...UPGRADES];
  const picks = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const idx = Math.floor(rng() * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks;
}
