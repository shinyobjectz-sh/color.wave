#!/usr/bin/env node
// Repoint node_modules/@work.books/{runtime,cli} at THIS repo's
// vendor/workbooks submodule.
//
// Why: when colorwave is checked out as a submodule inside a parent
// monorepo whose package.json claims `apps/*` as workspaces, `bun
// install` walks up, finds the parent workspace, and creates the
// @work.books symlinks pointing at the PARENT's vendor/workbooks
// (which won't have colorwave's pinned commit). This script forces
// the symlinks to point at our own submodule so the build sees the
// right source. Idempotent: safe to run after every bun install.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const want = {
  "@work.books/runtime": "vendor/workbooks/packages/runtime",
  "@work.books/cli": "vendor/workbooks/packages/workbook-cli",
};

let fixed = 0;
let already = 0;

for (const [name, target] of Object.entries(want)) {
  const linkPath = path.join(root, "node_modules", name);
  const wantTarget = path.resolve(root, target);

  if (!fs.existsSync(path.dirname(linkPath))) {
    // node_modules/@work.books/ not yet created — nothing to fix.
    continue;
  }

  let existingTarget = null;
  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      existingTarget = fs.realpathSync(linkPath);
    }
  } catch { /* doesn't exist */ }

  if (existingTarget === wantTarget) {
    already++;
    continue;
  }

  // Replace whatever's there (broken symlink, wrong symlink, real dir).
  try { fs.rmSync(linkPath, { recursive: true, force: true }); } catch { /* ignore */ }
  fs.symlinkSync(wantTarget, linkPath, "dir");
  fixed++;
  console.log(`[fix-workbooks-symlink] ${name} → ${path.relative(root, wantTarget)}`);
}

if (fixed === 0 && already > 0) {
  console.log("[fix-workbooks-symlink] symlinks already correct");
}
