// upgrades.js — the level-up draft: twelve upgrades, three offered at a
// time, and three real synergies between pairs of them. An upgrade is data
// plus two functions: can(G) (is it offerable now?) and apply(G) (mutate
// the run's mods). main.js owns the pause-and-choose flow; hud.js draws the
// cards from this same data, so text and effect can never drift apart.

import { rnd } from './rng.js';

// defaultMods() — the run's tunables before any upgrade. physics.js reads
// these every frame, so an apply() mid-run takes effect immediately.
export function defaultMods() {
  return {
    wellR: 175, // gravity capture radius, px
    orbitCap: 6, // max rocks held in orbit
    flingDmg: 2, // hull damage per flung rock
    pierce: 0, // extra hunters a flung rock passes through
    chargeMul: 1, // nova charge gain rate
    novaRadiusMul: 1, // nova blast radius scale
    comboWindow: 2.0, // seconds a NOVA CHAIN kill window stays open
    comboBonus: 1, // score multiplier scale for chained kills
    speedMul: 1, // thrust scale
    magnetR: 120, // XP shard attraction radius, px
    flingCdMul: 1, // fling cooldown scale (lower is faster)
    armorMul: 1, // incoming hull damage scale (lower is tougher)
    leechEvery: 0, // kills per +4 hull siphon; 0 = siphon offline
    aegisArray: false, // synergy flag: orbit rocks shrug off some bolts
  };
}

// xpForLevel(level) — shards needed to go from `level` to the next.
export function xpForLevel(level) {
  return 4 + level * 4;
}

// refreshSynergies(G) — pair flags that depend on two upgrades at once.
// Called after every apply, so order of drafting never matters.
function refreshSynergies(G) {
  const t = G.taken;
  G.mods.aegisArray = (t.array || 0) > 0 && (t.aegis || 0) > 0;
  if ((t.cannon || 0) > 0 && (t.pierce || 0) > 0 && !G.synergyCannonPierce) {
    G.synergyCannonPierce = true;
    G.mods.flingDmg += 1;
  }
}

// UPGRADES — the pool. Icons are single glyphs the HUD draws large on the
// card; desc is the exact effect, in player language.
export const UPGRADES = [
  {
    id: 'hull', name: 'Reinforced Hull', icon: '♥',
    desc: '+25 max hull and repair 25 now.',
    can: () => true,
    apply: (G) => { G.player.hullMax += 25; G.player.hull = Math.min(G.player.hullMax, G.player.hull + 25); },
  },
  {
    id: 'well', name: 'Wider Well', icon: '◎',
    desc: 'Gravity well reaches 18% farther — captures get easier.',
    can: (G) => G.mods.wellR < 330,
    apply: (G) => { G.mods.wellR *= 1.18; },
  },
  {
    id: 'array', name: 'Orbital Array', icon: '●',
    desc: '+2 orbit slots: a bigger shield and more ammo at once.',
    can: (G) => G.mods.orbitCap < 12,
    apply: (G) => { G.mods.orbitCap += 2; },
  },
  {
    id: 'cannon', name: 'Fling Cannon', icon: '➤',
    desc: 'Flung rocks hit +1 harder.',
    can: () => true,
    apply: (G) => { G.mods.flingDmg += 1; },
  },
  {
    id: 'pierce', name: 'Piercing Fling', icon: '»',
    desc: 'Flung rocks punch through +1 extra hunter.',
    can: (G) => G.mods.pierce < 3,
    apply: (G) => { G.mods.pierce += 1; },
  },
  {
    id: 'novacore', name: 'Nova Core', icon: '✦',
    desc: 'Nova charges 35% faster and blasts 15% wider.',
    can: () => true,
    apply: (G) => {
      G.mods.chargeMul *= 1.35;
      G.mods.novaRadiusMul *= 1.15;
      // Synergy, retroactive: a Chain Reactor already drafted gets the
      // second half of its doubled window the moment the Core lands.
      if ((G.taken.chain || 0) > 0) G.mods.comboWindow += 0.8 * G.taken.chain;
    },
  },
];

UPGRADES.push(
  {
    id: 'chain', name: 'Chain Reactor', icon: '⚡',
    desc: 'Chain window +0.8s and chained kills score +25% more.',
    can: () => true,
    apply: (G) => {
      // Synergy: with a Nova Core aboard, the window bonus doubles.
      G.mods.comboWindow += (G.taken.novacore || 0) > 0 ? 1.6 : 0.8;
      G.mods.comboBonus *= 1.25;
    },
  },
  {
    id: 'thrusters', name: 'Ion Thrusters', icon: '▲',
    desc: 'Thrust +12%: outrun darts, chase down rocks.',
    can: (G) => G.mods.speedMul < 1.5,
    apply: (G) => { G.mods.speedMul *= 1.12; },
  },
  {
    id: 'magnet', name: 'Shard Magnet', icon: '✧',
    desc: 'XP shards are pulled in from 60% farther away.',
    can: (G) => G.mods.magnetR < 420,
    apply: (G) => { G.mods.magnetR *= 1.6; },
  },
  {
    id: 'cycler', name: 'Rapid Cycler', icon: '↻',
    desc: 'Fling cooldown −30%: throw rocks in quicker succession.',
    can: (G) => G.mods.flingCdMul > 0.34,
    apply: (G) => { G.mods.flingCdMul *= 0.7; },
  },
  {
    id: 'aegis', name: 'Aegis Plating', icon: '⬡',
    desc: 'The hull takes 25% less damage from every hit.',
    can: (G) => G.mods.armorMul > 0.5,
    apply: (G) => { G.mods.armorMul *= 0.75; },
  },
  {
    id: 'siphon', name: 'Star Siphon', icon: '✚',
    desc: 'Every 15 kills, the star gives back +4 hull. Draft again to quicken it.',
    can: () => true,
    apply: (G) => {
      G.mods.leechEvery = G.mods.leechEvery === 0 ? 15 : Math.max(6, G.mods.leechEvery - 3);
    },
  },
);

// synergyNote(G, upg) — the card's synergy line when drafting `upg` would
// complete or feed a pair. Null when there is nothing to say.
export function synergyNote(G, upg) {
  const t = G.taken;
  if (upg.id === 'chain' && (t.novacore || 0) > 0) {
    return 'SYNERGY · Nova Core aboard: window bonus doubled';
  }
  if (upg.id === 'novacore' && (t.chain || 0) > 0) {
    return 'SYNERGY · Chain Reactor aboard: its windows widen again';
  }
  if (upg.id === 'array' && (t.aegis || 0) > 0) {
    return 'SYNERGY · Aegis Array: orbit rocks shrug off 25% of bolts';
  }
  if (upg.id === 'aegis' && (t.array || 0) > 0) {
    return 'SYNERGY · Aegis Array: orbit rocks shrug off 25% of bolts';
  }
  if (upg.id === 'cannon' && (t.pierce || 0) > 0 && !G.synergyCannonPierce) {
    return 'SYNERGY · Piercing aboard: +1 fling damage';
  }
  if (upg.id === 'pierce' && (t.cannon || 0) > 0 && !G.synergyCannonPierce) {
    return 'SYNERGY · Cannon aboard: +1 fling damage';
  }
  return null;
}

// rollChoices(G) — three distinct offerable upgrades, shuffled with the
// game stream. Falls back to Reinforced Hull if the pool ever runs dry.
export function rollChoices(G) {
  const pool = UPGRADES.filter((u) => u.can(G));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  const choices = pool.slice(0, 3);
  if (choices.length === 0) choices.push(UPGRADES[0]);
  return choices;
}

// applyUpgrade(G, upg) — draft one upgrade: effect, bookkeeping, synergies.
export function applyUpgrade(G, upg) {
  upg.apply(G);
  G.taken[upg.id] = (G.taken[upg.id] || 0) + 1;
  refreshSynergies(G);
}
