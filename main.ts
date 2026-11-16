// STARFORGE — best-game-01 entry program.
//
// What this does, and all it does: stage the game into the output directory
// and summarise it for the judge. game/ (plain static files: index.html and
// its ES modules, no library, no network) and screenshots/ are copied fresh
// from beside this file, then dossier.json is written with buildDossier
// from the vendored make.fun library, using the scorer's own caps. Run it
// twice and the outputs are byte-identical: the dossier is a pure function
// of the staged tree.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (MAKEFUN_OUTPUT_DIR stands in for /output outside the grader.)

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Stage fresh: clear the two payload directories so a re-run can never
// inherit a stale file from an older build of the game.
mkdirSync(outDir, { recursive: true });
for (const name of ['game', 'screenshots']) {
  const target = join(outDir, name);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// Write the dossier with the scorer's caps (from the kit's gate reference):
// the 160 KiB text cap shapes the bytes; the rest simply refuse anything
// the scorer itself would refuse — more than 4 screenshots or one over
// 256 KiB, more than 993 entries or 48 MiB under game/, or a game/ path
// longer than 1000 bytes.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`STARFORGE staged to ${outDir} — dossier.json ${Buffer.byteLength(dossier)} bytes`);
