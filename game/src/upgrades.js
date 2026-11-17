// upgrades.js — The draft pool, synergies and build paths of STARFORGE.
//
// v4's core fix: the draft is the strategy layer. Sixteen upgrades in three
// build paths (NOVA area/burn, PIERCE crit/throw, FORGE summon/tank), each
// with real trade-offs and a stack cap. Completing one of the six named
// synergy pairs unlocks a bonus effect that changes how the build plays.
// Level-ups offer 3 cards; the HUD shows the dominant build and every
// active synergy.

export const PATHS = {
  nova: { name: 'NOVA', color: '#ff9d3c', desc: 'Area, burn and chain' },
  pierce: { name: 'PIERCE', color: '#7fe7ff', desc: 'Crits, throws and pierce' },
  forge: { name: 'FORGE', color: '#b78cff', desc: 'Summons, tank and gravity' },
};

export const BUILD_TITLES = {
  nova: 'NOVA-FORGED',
  pierce: 'RAILGUNNER',
  forge: 'STARKEEPER',
  mixed: 'WILDCARD',
};

// id, name, icon (drawn on the card), path, max stacks, short rules text.
export const UPGRADE_POOL = [
  { id: 'nova-chain', name: 'Nova Chain', icon: '✦', path: 'nova', max: 3,
    desc: 'NOVA damage +40%. Chain window +0.5s. Kills feed the chain.' },
  { id: 'ember-trail', name: 'Ember Trail', icon: '🔥', path: 'nova', max: 3,
    desc: 'Moving leaves a burning trail. Burned foes take damage over time.' },
  { id: 'supernova', name: 'Supernova', icon: '☀', path: 'nova', max: 2,
    desc: 'NOVA fires a second ring. Blast radius +25%.' },
  { id: 'chain-lightning', name: 'Chain Lightning', icon: '⚡', path: 'nova', max: 3,
    desc: 'Every kill zaps the nearest foe for 20 damage. Chains to 2 more.' },
  { id: 'frost-veil', name: 'Frost Veil', icon: '❄', path: 'nova', max: 2,
    desc: 'Foes within 170 slow by 35%. Chilled foes take +15% damage.' },
  { id: 'blood-ember', name: 'Blood Ember', icon: '♥', path: 'nova', max: 2,
    desc: 'Every 8th kill in a chain restores 3 HP. Chains heal the forge.' },
  { id: 'railshot', name: 'Railshot', icon: '➶', path: 'pierce', max: 3,
    desc: 'Thrown rocks pierce +1 foe. Pierced foes take full damage.' },
  { id: 'deadeye', name: 'Deadeye', icon: '◎', path: 'pierce', max: 3,
    desc: '+15% crit chance. Crits deal 2.5x damage and burst sparks.' },
  { id: 'twin-throw', name: 'Twin Throw', icon: '✧✧', path: 'pierce', max: 2,
    desc: 'Throw 2 rocks at once. Each costs one orbit rock.' },
  { id: 'shard-splinter', name: 'Shard Splinter', icon: '◆', path: 'pierce', max: 2,
    desc: 'Thrown rocks split into 2 shards on first hit. Shards deal 60%.' },
  { id: 'swift-hand', name: 'Swift Hand', icon: '»', path: 'pierce', max: 3,
    desc: 'Throw cooldown -20%. Move speed +6%.' },
  { id: 'ricochet', name: 'Ricochet', icon: '↯', path: 'pierce', max: 2,
    desc: 'Thrown rocks bounce to a second foe within 180. Bounces deal 70%.' },
  { id: 'overforge', name: 'Overforge', icon: '⬡', path: 'forge', max: 3,
    desc: '+1 max orbit rock. Orbit speed +15%. More shield, more ammo.' },
  { id: 'wisp-ally', name: 'Wisp Ally', icon: '✧', path: 'forge', max: 3,
    desc: 'A forge-wisp orbits you and fires bolts at the nearest foe.' },
  { id: 'forge-heart', name: 'Forge Heart', icon: '⬢', path: 'forge', max: 3,
    desc: 'Max HP +25. Regenerate 0.8 HP/s.' },
  { id: 'gravity-lens', name: 'Gravity Lens', icon: '◉', path: 'forge', max: 3,
    desc: 'Well radius +25%. Gems fly to you from +60% farther.' },
];

// Two upgrades that, taken together, unlock a bonus effect.
export const SYNERGIES = [
  { id: 'pyrochain', name: 'PYROCHAIN', a: 'nova-chain', b: 'ember-trail',
    desc: 'NOVA scorches the ground: burning zones linger where it hits.' },
  { id: 'stormforge', name: 'STORMFORGE', a: 'chain-lightning', b: 'nova-chain',
    desc: 'NOVA zaps the 5 nearest foes for heavy lightning damage.' },
  { id: 'railstorm', name: 'RAILSTORM', a: 'railshot', b: 'twin-throw',
    desc: 'Thrown rocks pierce EVERY foe they cross.' },
  { id: 'starkeeper', name: 'STARKEEPER', a: 'overforge', b: 'wisp-ally',
    desc: '+1 wisp. Orbit rocks spin 50% faster.' },
  { id: 'cryonova', name: 'CRYO-NOVA', a: 'frost-veil', b: 'nova-chain',
    desc: 'NOVA freezes foes solid for 2 seconds.' },
  { id: 'emberheart', name: 'EMBERHEART', a: 'blood-ember', b: 'forge-heart',
    desc: 'Kills restore 2 HP. Regeneration doubles.' },
];

export function upgradeStacks(state, id) {
  return state.upgradesTaken[id] || 0;
}

export function hasUpgrade(state, id) {
  return upgradeStacks(state, id) > 0;
}

export function hasSynergy(state, id) {
  const s = SYNERGIES.find((x) => x.id === id);
  if (!s) return false;
  return hasUpgrade(state, s.a) && hasUpgrade(state, s.b);
}

export function activeSynergies(state) {
  return SYNERGIES.filter((s) => hasUpgrade(state, s.a) && hasUpgrade(state, s.b));
}

// Derived combat numbers from the upgrades taken. Recomputed whenever the
// draft changes, so the rest of the game reads plain numbers.
export function computeStats(state) {
  const n = (id) => upgradeStacks(state, id);
  const stats = {
    maxRocks: 4 + n('overforge'),
    wellRadius: 130 * (1 + 0.25 * n('gravity-lens')),
    throwCooldown: 0.24 * Math.pow(0.8, n('swift-hand')),
    throwDamage: 26,
    throwCount: 1 + n('twin-throw'),
    pierce: hasSynergy(state, 'railstorm') ? 99 : n('railshot'),
    split: n('shard-splinter') > 0,
    splitCount: 2,
    critChance: 0.05 + 0.15 * n('deadeye'),
    critMult: 2.5,
    ricochet: n('ricochet') > 0,
    moveSpeed: 265 * (1 + 0.06 * n('swift-hand')),
    maxHp: 100 + 25 * n('forge-heart'),
    regen: 0.8 * n('forge-heart') * (hasSynergy(state, 'emberheart') ? 2 : 1),
    novaDamage: 60 * (1 + 0.4 * n('nova-chain')),
    novaRadius: 260 * (1 + 0.25 * n('supernova')),
    novaRings: 1 + n('supernova'),
    novaCooldown: 6,
    chainWindow: 2.5 + 0.5 * n('nova-chain'),
    chainZap: 20 * n('chain-lightning'),
    frostRadius: n('frost-veil') > 0 ? 170 : 0,
    frostSlow: 0.35,
    emberTrail: n('ember-trail') > 0,
    emberDps: 14 + 8 * n('ember-trail'),
    wispCount: n('wisp-ally') + (hasSynergy(state, 'starkeeper') ? 1 : 0),
    magnetRadius: 90 * (1 + 0.6 * n('gravity-lens')),
    orbitSpeed: 1.6 * (1 + 0.15 * n('overforge')) * (hasSynergy(state, 'starkeeper') ? 1.5 : 1),
    bloodEmberHeal: n('blood-ember') > 0 ? 3 : 0,
    killHeal: hasSynergy(state, 'emberheart') ? 2 : 0,
  };
  return stats;
}

// Roll a 3-card draft from upgrades that still have stacks left.
export function rollDraft(state) {
  const available = UPGRADE_POOL.filter((u) => upgradeStacks(state, u.id) < u.max);
  const pool = available.slice();
  // Seeded shuffle, then take the first three (fewer if the pool is dry).
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(state.rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks = pool.slice(0, 3);
  // Mark cards that would complete a synergy, so the player sees the combo.
  for (const p of picks) {
    p.completesSynergy = SYNERGIES.some((s) =>
      (s.a === p.id && hasUpgrade(state, s.b)) ||
      (s.b === p.id && hasUpgrade(state, s.a)));
  }
  return picks;
}

export function applyUpgradeChoice(state, upgrade) {
  state.upgradesTaken[upgrade.id] = upgradeStacks(state, upgrade.id) + 1;
  state.paths[upgrade.path] = (state.paths[upgrade.path] || 0) + 1;
  state.stats = computeStats(state);
  const p = state.player;
  if (upgrade.id === 'forge-heart') {
    p.maxHp = state.stats.maxHp;
    p.hp = Math.min(p.maxHp, p.hp + 25);
  }
  p.maxHp = state.stats.maxHp;
}

// Dominant build path for the HUD badge. A clear leader names the build;
// a spread is a WILDCARD.
export function dominantBuild(state) {
  const counts = state.paths;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, e) => s + e[1], 0);
  if (total === 0) return { key: 'mixed', title: 'UNFORGED', counts };
  const top = entries[0];
  if (top[1] >= 3 && (entries.length === 1 || top[1] >= entries[1][1] + 2)) {
    return { key: top[0], title: BUILD_TITLES[top[0]], counts };
  }
  return { key: 'mixed', title: 'WILDCARD', counts };
}
