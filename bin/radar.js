#!/usr/bin/env node
// poidh-radar — find poidh bounties worth attempting, and say so once.

import { join } from 'node:path';
import { fetchBounties } from '../src/poidh.js';
import { evaluate, SKIP_BY_DEFAULT } from '../src/score.js';
import { loadState, saveState, isNew, markSeen } from '../src/state.js';
import { formatBounty, sendTelegram, hasCredentials } from '../src/notify.js';

// Default next to the checkout rather than in $HOME: inside a container the
// home directory is discarded with the container, while the working directory
// is the mounted volume that actually survives the run.
const DEFAULT_STATE = process.env.POIDH_RADAR_STATE ?? join(process.cwd(), 'state.json');

function parseArgs(argv) {
  const opts = {
    limit: 100,
    minUsd: 15,
    maxClaims: 5,
    top: 15,
    dryRun: false,
    all: false,
    json: false,
    showRejected: false,
    includeIrl: false,
    includeStale: false,
    state: DEFAULT_STATE,
  };
  for (const arg of argv) {
    const [flag, value] = arg.split('=');
    switch (flag) {
      case '--limit': opts.limit = Number(value); break;
      case '--min-usd': opts.minUsd = Number(value); break;
      case '--max-claims': opts.maxClaims = Number(value); break;
      case '--top': opts.top = Number(value); break;
      case '--state': opts.state = value; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--all': opts.all = true; break;
      case '--json': opts.json = true; break;
      case '--show-rejected': opts.showRejected = true; break;
      case '--include-irl': opts.includeIrl = true; break;
      case '--include-stale': opts.includeStale = true; break;
      case '--help': case '-h': opts.help = true; break;
      default:
        if (flag.startsWith('--')) {
          console.error(`unknown flag: ${flag}`);
          process.exit(2);
        }
    }
  }
  return opts;
}

const HELP = `poidh-radar — watch poidh bounties, ranked by reward against competition

usage: poidh-radar [options]

  --limit=N          bounties to pull from the feed (default 100)
  --min-usd=N        ignore anything below this reward (default 15)
  --max-claims=N     ignore bounties with more claims than this (default 5)
  --top=N            rows to print (default 15)
  --all              ignore saved state: report everything matching
  --dry-run          print only, never send to Telegram
  --json             machine-readable output
  --show-rejected    also print what was filtered out and why
  --include-irl      keep bounties that need physical presence
  --include-stale    keep bounties open for more than 120 days
  --state=PATH       state file (default ./state.json)

Telegram delivery needs POIDH_RADAR_TG_TOKEN and POIDH_RADAR_TG_CHAT.
`;

function printTable(rows) {
  if (!rows.length) {
    console.log('nothing new');
    return;
  }
  const head = `${'score'.padStart(6)} ${'usd'.padStart(6)} ${'claims'.padStart(6)} ${'age'.padStart(5)}  ${'chain'.padEnd(8)} title`;
  console.log(head);
  console.log('-'.repeat(head.length + 20));
  for (const b of rows) {
    const age = b.ageDays === null ? '-' : `${b.ageDays}d`;
    console.log(
      `${b.score.toFixed(0).padStart(6)} ${b.usd.toFixed(0).padStart(6)} ${String(b.claimCount).padStart(6)} ${age.padStart(5)}  ${b.chain.padEnd(8)} ${(b.title ?? '').slice(0, 60)}`
    );
    console.log(`${' '.repeat(28)}${b.url}${b.tags.length ? `  [${b.tags.join(' ')}]` : ''}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }

  const unskip = new Set();
  if (opts.includeIrl) unskip.add('irl');
  if (opts.includeStale) unskip.add('stale');
  const skipTags = SKIP_BY_DEFAULT.filter((tag) => !unskip.has(tag));

  const { total, skipped, bounties } = await fetchBounties({ limit: opts.limit });
  const evaluated = evaluate(bounties, {
    minUsd: opts.minUsd,
    maxClaims: opts.maxClaims,
    skipTags,
  });

  const passing = evaluated.filter((b) => b.rejected.length === 0);
  const state = await loadState(opts.state);
  const fresh = opts.all ? passing : passing.filter((b) => isNew(state, b));
  const shown = fresh.slice(0, opts.top);

  if (opts.json) {
    console.log(JSON.stringify({ total, skippedChains: skipped, matched: passing.length, bounties: shown }, null, 2));
  } else {
    console.error(`feed: ${total} bounties, ${skipped} on retired/unknown chains, ${passing.length} passing filters, ${fresh.length} new`);
    printTable(shown);
    if (opts.showRejected) {
      console.log('\nfiltered out:');
      for (const b of evaluated.filter((x) => x.rejected.length)) {
        console.log(`  $${b.usd.toFixed(0).padStart(5)} ${(b.title ?? '').slice(0, 50).padEnd(52)} ${b.rejected.join(', ')}`);
      }
    }
  }

  if (!opts.dryRun && shown.length && hasCredentials()) {
    for (const bounty of shown) {
      await sendTelegram(`🎯 poidh\n${formatBounty(bounty)}`);
    }
  }

  if (!opts.dryRun) {
    for (const bounty of shown) markSeen(state, bounty);
    await saveState(opts.state, state);
  }
}

main().catch((err) => {
  console.error(`poidh-radar: ${err.message}`);
  process.exit(1);
});
