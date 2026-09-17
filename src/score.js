// Tagging and scoring.
//
// The premise: on poidh the reward is public but the competition is what
// decides your expected value. A $111 bounty with eleven finished submissions
// is worth less than a $24 bounty nobody has touched, and the feed alone does
// not show that. Everything here exists to make that difference visible.

const RULES = [
  {
    tag: 'junk',
    // Test posts and dust bounties. Titles like "test2", "Test bounty".
    test: (b) => /^\s*test\b/i.test(b.title ?? '') || b.usd < 3,
  },
  {
    tag: 'stale',
    // Open for months with nobody claiming: usually unclaimable in practice,
    // or abandoned by an issuer who will never confirm.
    test: (b) => b.ageDays !== null && b.ageDays > 120,
  },
  {
    tag: 'reserved',
    // Written so that one named person is the only eligible claimant.
    test: (b) => /only\s+[\w .'-]{2,40}\s+can claim/i.test(b.description ?? ''),
    keywords: ['pot is specifically for', 'this bounty is for me', 'i am the only one'],
  },
  {
    tag: 'donation',
    // An ask for money, not an offer of it.
    keywords: ['help me fight', 'fundraiser', 'open-access fee', 'help fund', 'donate to'],
  },
  {
    tag: 'irl',
    // Needs a body in a specific place: photos of yourself, travel, physical objects.
    keywords: [
      'take a photo', 'take a pic', 'photo of yourself', 'selfie', 'in person',
      'open mic', 'tattoo', 'kickflip', 'irl', 'visit ', 'go to a local',
      'real-world location', 'physical location', 'this is for poidh', 'golf course',
      'record a video where you say',
    ],
  },
  {
    tag: 'geo-locked',
    // Restricted to a country you are not in.
    keywords: [
      'based in the us', 'us or canada', 'united states', 'us politician',
      'federal or state-level', 'american politician',
    ],
  },
  {
    tag: 'needs-spend',
    // Payout requires putting your own money in first. Phrased narrowly on
    // purpose: a bounty asking you to *build* deposits or swaps is dev work,
    // not an entry fee.
    keywords: [
      'you must buy', 'buy $', 'purchase a', 'paid lobbies', 'mint and hold',
      'deposit your own', 'fund it yourself', 'at your own expense', 'entry fee',
    ],
  },
  {
    tag: 'referral',
    // Payout depends on closing a deal with a third party.
    keywords: [
      'sponsor referral', 'successful sponsor', 'make an introduction',
      'results in the brand', 'referral bounty',
    ],
  },
  {
    tag: 'needs-farcaster',
    keywords: ['farcaster', 'cast about', 'mini app', 'warpcast'],
  },
  {
    tag: 'needs-x',
    keywords: ['post on x', 'on x and tag', 'repost', 'twitter', 'tag @'],
  },
  {
    tag: 'dev',
    // The kind of work that leaves a repository behind.
    keywords: [
      'github', 'repository', 'repo', 'open-source', 'open source', 'frontend',
      'smart contract', 'api', 'implement', 'build a', 'reproduce', 'bug',
      'sdk', 'cli', 'benchmark', 'dataset',
    ],
  },
  {
    tag: 'media',
    keywords: ['video', 'trailer', 'clip', 'pixel-art', 'pixel art', 'illustration', 'design'],
  },
  {
    tag: 'writing',
    keywords: ['feedback', 'review', 'suggest', 'write-up', 'writeup', 'research'],
  },
];

export const SKIP_BY_DEFAULT = [
  'junk', 'stale', 'reserved', 'donation', 'referral', 'irl', 'geo-locked', 'needs-spend',
];

export function tagsFor(bounty) {
  const haystack = `${bounty.title ?? ''}\n${bounty.description ?? ''}`.toLowerCase();
  const tags = [];
  for (const rule of RULES) {
    if (rule.test?.(bounty)) {
      tags.push(rule.tag);
      continue;
    }
    if (rule.keywords?.some((word) => haystack.includes(word))) tags.push(rule.tag);
  }
  return tags;
}

// Fresh bounties are worth more: the first hours are when the claim count is
// still zero and a submission actually gets read.
function freshnessFactor(ageDays) {
  if (ageDays === null) return 1;
  if (ageDays <= 2) return 1.3;
  if (ageDays <= 7) return 1.15;
  if (ageDays <= 30) return 1;
  return 0.75;
}

export function scoreOf(bounty) {
  const perRival = bounty.usd / (bounty.claimCount + 1);
  return perRival * freshnessFactor(bounty.ageDays);
}

export function evaluate(bounties, options = {}) {
  const {
    minUsd = 15,
    maxClaims = 5,
    skipTags = SKIP_BY_DEFAULT,
  } = options;

  return bounties
    .map((bounty) => {
      const tags = tagsFor(bounty);
      const score = scoreOf(bounty);
      const reasons = [];

      const blocked = tags.filter((tag) => skipTags.includes(tag));
      if (blocked.length) reasons.push(...blocked.map((tag) => `tag:${tag}`));
      if (bounty.usd < minUsd) reasons.push(`under $${minUsd}`);
      if (bounty.claimCount > maxClaims) reasons.push(`${bounty.claimCount} claims`);
      if (bounty.isVoting) reasons.push('voting in progress');

      return { ...bounty, tags, score, rejected: reasons };
    })
    .sort((a, b) => b.score - a.score);
}
