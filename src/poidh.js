// Client for the poidh frontend JSON endpoints.
//
// Discovery goes through https://poidh.xyz/bounties/data, and each bounty is
// enriched with its claim list via /data?claims=1 — the claim count is what
// tells us whether a bounty is actually worth attempting.
//
// This data is derived from chain events, not consensus state. Verify onchain
// before spending money or accepting anything.

const FEED_URL = 'https://poidh.xyz/bounties/data';
const UA = 'poidh-radar/0.1 (+https://github.com/uShure/poidh-radar)';

// Chains where poidh v3 is live and a claim can actually be paid out.
export const CHAINS = {
  1: 'mainnet',
  42161: 'arbitrum',
  8453: 'base',
};

// Degen Chain is retired. Its bounties still show up in the feed as "open",
// but no write operation there is valid, so they never reach the output.
export const RETIRED_CHAINS = {
  666666666: 'degen',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, { retries = 2, timeoutMs = 20000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': UA },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(500 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

export function chainSlug(chainId) {
  return CHAINS[chainId] ?? null;
}

export function isActionable(bounty) {
  if (!bounty) return false;
  if (RETIRED_CHAINS[bounty.chainId]) return false;
  if (!chainSlug(bounty.chainId)) return false;
  if (bounty.isCanceled) return false;
  if (bounty.inProgress === false) return false;
  return true;
}

export async function fetchFeed({ limit = 100 } = {}) {
  const data = await fetchJson(`${FEED_URL}?limit=${limit}`);
  const items = Array.isArray(data) ? data : data.items ?? [];
  return items;
}

export async function fetchClaims(bounty) {
  const slug = chainSlug(bounty.chainId);
  if (!slug) return [];
  const url = `https://poidh.xyz/${slug}/bounty/${bounty.id}/data?claims=1`;
  const data = await fetchJson(url);
  return Array.isArray(data.claims) ? data.claims : [];
}

// Feed + per-bounty claim enrichment. Bounties on retired or unknown chains are
// dropped before any extra request is made.
export async function fetchBounties({ limit = 100, concurrency = 5 } = {}) {
  const feed = await fetchFeed({ limit });
  const actionable = feed.filter(isActionable);

  const enriched = await mapPool(actionable, concurrency, async (bounty) => {
    let claims = [];
    let claimsError = null;
    try {
      claims = await fetchClaims(bounty);
    } catch (err) {
      claimsError = err.message;
    }
    return {
      ...bounty,
      chain: chainSlug(bounty.chainId),
      claims,
      claimCount: claims.length,
      claimsError,
      usd: Number(bounty.priceUsd ?? 0),
      ageDays: ageInDays(bounty.createdAt),
      url: bounty.url ?? `https://poidh.xyz/${chainSlug(bounty.chainId)}/bounty/${bounty.id}`,
      key: `${bounty.chainId}:${bounty.id}`,
    };
  });

  return { total: feed.length, skipped: feed.length - actionable.length, bounties: enriched };
}

function ageInDays(createdAt) {
  const seconds = Number(createdAt);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const ms = Date.now() - seconds * 1000;
  return Math.max(0, Math.round(ms / 86_400_000));
}
