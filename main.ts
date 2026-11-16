// STARFORGE — hand-in program for make.fun's best-game-01.
//
// The game itself is the static site in game/ (open game/index.html in a
// browser and play; it needs no network and no build step). This program's
// only job is delivery: copy game/ and screenshots/ into the output folder
// and write dossier.json there with the kit's buildDossier, so the judge
// reads exactly the files that were handed in.
//
// Run it the way the grader does, with MAKEFUN_OUTPUT_DIR standing in for
// /output outside the sandbox:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Two runs over the same repository produce byte-identical output: the copy
// is a plain recursive copy of fixed files and buildDossier walks its tree
// in sorted order.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps, mirrored here so buildDossier refuses an oversized entry
// at hand-in time instead of letting the scorer refuse it later.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyTree(join(repoRoot, 'game'), join(outputDir, 'game'));
if (existsSync(join(repoRoot, 'screenshots'))) {
  copyTree(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));
}

const dossier = buildDossier(outputDir, DOSSIER_CAPS);
writeFileSync(join(outputDir, 'dossier.json'), dossier);
