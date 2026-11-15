// STARFORGE — hand-in program for the best-game-01 bounty (Node 22,
// standard library only). The game itself is the static site under game/
// (index.html plus vanilla ES modules; no build step, no network). This
// program copies game/ and screenshots/ into the output directory and
// writes dossier.json with the vendored make.fun library, exactly as the
// gate expects. The copy walks each tree in sorted order and the summary
// below is computed from the copied files, so two runs over the same
// repository produce byte-identical output.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copies a directory tree in sorted-name order and returns a manifest of
// "relative/path<TAB>bytes" lines, so the run can report exactly what it
// handed in. Deterministic: no timestamps, no filesystem-order surprises.
function copyTreeSorted(srcDir: string, dstDir: string, base: string, manifest: string[]): void {
  mkdirSync(dstDir, { recursive: true });
  const names = readdirSync(srcDir).sort();
  for (const name of names) {
    const src = join(srcDir, name);
    const dst = join(dstDir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(src).isDirectory()) {
      copyTreeSorted(src, dst, rel, manifest);
    } else {
      const bytes = readFileSync(src);
      writeFileSync(dst, bytes);
      manifest.push(`${rel}\t${bytes.length}`);
    }
  }
}

const manifest: string[] = [];
copyTreeSorted(join(here, 'game'), join(out, 'game'), 'game', manifest);
if (existsSync(join(here, 'screenshots'))) {
  copyTreeSorted(join(here, 'screenshots'), join(out, 'screenshots'), 'screenshots', manifest);
} else {
  mkdirSync(join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the dossier's bytes; the rest refuse an entry the scorer would refuse.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

const totalBytes = manifest.reduce((sum, line) => sum + Number(line.split('\t')[1]), 0);
console.log(`starforge hand-in: ${manifest.length} files, ${totalBytes} bytes, dossier ${Buffer.byteLength(dossier)} bytes`);
for (const line of manifest) console.log(`  ${line}`);
