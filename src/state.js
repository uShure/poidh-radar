// Remembers which bounties were already reported, so a cron run only ever
// announces something new.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function loadState(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { seen: {} };
    throw err;
  }
}

export async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function isNew(state, bounty) {
  return !state.seen[bounty.key];
}

export function markSeen(state, bounty) {
  state.seen[bounty.key] = {
    title: bounty.title,
    usd: bounty.usd,
    claims: bounty.claimCount,
    notifiedAt: new Date().toISOString(),
  };
}
