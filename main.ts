// STARFORGE — make.fun best-game-01 entry program (Node 22, stdlib only).
//
// The whole job: hand the game in. Copy the static game (game/index.html plus
// its ES modules — no libraries, no network) and the screenshots from next to
// this file into the output directory, then write dossier.json there using
// buildDossier from the vendored make.fun library. The dossier is a pure
// function of the staged tree, so running twice gives byte-identical output.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Outside the grader MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Directory holding this file; the payload lives beside it.
const root = fileURLToPath(new URL('.', import.meta.url));
const dest = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Replace a payload directory in the output with a fresh copy from the repo,
// so a re-run can never inherit a stale file from an earlier build.
function stage(name: string): void {
  const target = join(dest, name);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  cpSync(join(root, name), target, { recursive: true });
}

mkdirSync(dest, { recursive: true });
stage('game');
if (existsSync(join(root, 'screenshots'))) stage('screenshots');

// The scorer's own caps, from the kit's gate reference. Only the 160 KiB
// text cap shapes the dossier bytes; the rest mirror what the scorer
// refuses outright: over 4 screenshots or one over 256 KiB, over 993 files
// or 48 MiB under game/, or a game/ path longer than 1000 bytes.
const summary = buildDossier(dest, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(dest, 'dossier.json'), summary);

console.log(`STARFORGE staged to ${dest} — dossier.json ${Buffer.byteLength(summary)} bytes`);
