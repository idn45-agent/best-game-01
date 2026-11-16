// upgrades.js — the level-up draft. Every level offers three of these nine
// boons, drawn without repetition; each one bends a different part of the
// star's sheet in entities.js, so runs diverge: a wide orbit wall, a nova
// machine gun, a shard vacuum, a split-fling shotgun…

export const UPGRADES = [
  {
    id: 'orbit-cap',
    glyph: '◎',
    name: 'Wider Orbit',
    desc: (p) => `Carry ${p.orbitCap + 1} orbiting rocks instead of ${p.orbitCap}. More shield, more ammo.`,
    apply: (p) => { p.orbitCap += 1; },
    available: (p) => p.orbitCap < 9,
  },
  {
    id: 'gravity',
    glyph: '◉',
    name: 'Deep Gravity',
    desc: () => 'Your gravity well reaches 22% farther. Asteroids fall into orbit from across the dark.',
    apply: (p) => { p.gravity = Math.round(p.gravity * 1.22); },
    available: () => true,
  },
  {
    id: 'fling-damage',
    glyph: '◆',
    name: 'Dense Core',
    desc: () => 'Flung rocks hit +1 harder. Even the Devourer will feel them.',
    apply: (p) => { p.flingDamage += 1; },
    available: () => true,
  },
  {
    id: 'nova-cooldown',
    glyph: '↯',
    name: 'Fast Recharge',
    desc: (p) => `Nova recharges in ${Math.max(3.2, p.novaCdMax * 0.76).toFixed(1)}s instead of ${p.novaCdMax.toFixed(1)}s.`,
    apply: (p) => { p.novaCdMax = Math.max(3.2, p.novaCdMax * 0.76); },
    available: (p) => p.novaCdMax > 3.3,
  },
  {
    id: 'hull',
    glyph: '♥',
    name: 'Thick Hull',
    desc: (p) => `+25 max hull and repair 25 now (hull ${Math.min(p.hullMax, p.hull + 25)} / ${p.hullMax + 25}).`,
    apply: (p) => { p.hullMax += 25; p.hull = Math.min(p.hullMax, p.hull + 25); },
    available: () => true,
  },
  {
    id: 'magnet',
    glyph: '✦',
    name: 'Shard Magnet',
    desc: () => 'XP shards stream to you from 55% farther away. Level up sooner, choose more.',
    apply: (p) => { p.magnet = Math.round(p.magnet * 1.55); },
    available: () => true,
  },
  {
    id: 'multi-fling',
    glyph: '✜',
    name: 'Split Fling',
    desc: (p) => `Each fling launches ${p.multiFling + 1} rocks in a spread instead of ${p.multiFling}.`,
    apply: (p) => { p.multiFling += 1; },
    available: (p) => p.multiFling < 3,
  },
  {
    id: 'speed',
    glyph: '»',
    name: 'Swift Star',
    desc: () => 'Move 12% faster. Outrun darts, chase down drifting rocks.',
    apply: (p) => { p.speed = Math.round(p.speed * 1.12); },
    available: () => true,
  },
  {
    id: 'rekindle',
    glyph: '✚',
    name: 'Rekindle',
    desc: (p) => `Repair 45% of your hull right now (hull ${Math.min(p.hullMax, p.hull + Math.round(p.hullMax * 0.45))} / ${p.hullMax}).`,
    apply: (p) => { p.hull = Math.min(p.hullMax, p.hull + Math.round(p.hullMax * 0.45)); },
    available: (p) => p.hull < p.hullMax,
  },
];

// Draw `count` distinct upgrades the player can still use.
export function rollUpgrades(rng, player, count = 3) {
  const pool = UPGRADES.filter((u) => u.available(player));
  const picks = [];
  const bag = [...pool];
  while (picks.length < count && bag.length > 0) {
    const idx = Math.floor(rng() * bag.length);
    picks.push(bag.splice(idx, 1)[0]);
  }
  return picks;
}
