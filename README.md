# poidh-radar

Watch [poidh](https://poidh.xyz) bounties and surface the ones actually worth attempting — ranked by reward against the competition already sitting on them.

## Why

poidh publishes every bounty's reward, but not its odds. The feed will happily show you a $111 bounty that eleven people have already submitted finished applications to, right next to a $24 one nobody has touched. The reward is public; the competition is what decides your expected value, and you only see it by opening each bounty by hand.

Meanwhile the fastest claimants are automated. Being early is most of the edge: the first hours of a bounty are when the claim count is still zero and a submission gets read on its merits rather than as entry number twelve.

poidh-radar closes that gap. It pulls the feed, fetches the claim list for every live bounty, scores reward against rivals and freshness, drops what you can't act on, and tells you once — on the terminal or in Telegram.

## What it does

- pulls all open bounties across Ethereum Mainnet, Arbitrum and Base
- drops Degen Chain: the network is retired and its bounties are read-only history, even when the feed still reports them open
- fetches every bounty's claims, so competition is a number rather than a yes/no
- tags each bounty: `dev`, `media`, `writing`, `needs-farcaster`, `needs-x`, `irl`, `geo-locked`, `needs-spend`, `referral`, `reserved`, `donation`, `stale`, `junk`
- filters out what you can't realistically claim: physical presence, country locks, pay-to-enter, test posts, fundraisers asking for money rather than offering it, bounties written so only one named person can claim them, and anything left open for more than four months
- scores `reward ÷ (claims + 1)`, weighted by age
- keeps state, so a cron run only ever announces something new

## Install

```bash
git clone https://github.com/uShure/poidh-radar.git
cd poidh-radar
node bin/radar.js --dry-run --all
```

No dependencies. Node 20 or newer (uses built-in `fetch`).

## Usage

```bash
# what's worth looking at right now
node bin/radar.js --dry-run --all

# everything, including what got filtered and why
node bin/radar.js --dry-run --all --show-rejected

# lower the bar
node bin/radar.js --dry-run --all --min-usd=5 --max-claims=20

# machine-readable
node bin/radar.js --dry-run --all --json
```

| flag | meaning |
| --- | --- |
| `--limit=N` | bounties to pull from the feed (default 100) |
| `--min-usd=N` | ignore anything below this reward (default 15) |
| `--max-claims=N` | ignore bounties with more claims than this (default 5) |
| `--top=N` | rows to print (default 15) |
| `--all` | ignore saved state and report everything matching |
| `--dry-run` | print only, never send to Telegram |
| `--json` | machine-readable output |
| `--show-rejected` | also print what was filtered out and why |
| `--include-irl` | keep bounties that need physical presence |
| `--include-stale` | keep bounties open for more than 120 days |
| `--state=PATH` | state file (default `~/.poidh-radar/state.json`) |

## Telegram

Set two environment variables and drop `--dry-run`:

```bash
export POIDH_RADAR_TG_TOKEN=123456:abc...
export POIDH_RADAR_TG_CHAT=186757140
node bin/radar.js
```

Credentials are read from the environment only; nothing is stored in the repo.

## Cron

Every 20 minutes, so a new bounty is seen while its claim count is still zero:

```cron
*/20 * * * * cd /opt/poidh-radar && POIDH_RADAR_TG_TOKEN=... POIDH_RADAR_TG_CHAT=... /usr/bin/node bin/radar.js >> /var/log/poidh-radar.log 2>&1
```

## Scoring

```
score = usd / (claims + 1) × freshness
```

`freshness` is 1.3 for bounties under two days old, 1.15 under a week, 1 under a month, 0.75 beyond that. A bounty with no claims keeps its full reward in the numerator; the twelfth claimant on the same bounty is competing for a twelfth of it.

The tags are keyword heuristics over title and description. They are deliberately blunt: a false positive costs you one line of output, a false negative costs you an afternoon.

## Caveats

- The frontend feed and the indexer are derived from chain events, not consensus state. Verify onchain before funding, claiming or accepting anything.
- Nothing here signs transactions. It reads, ranks and notifies. Claims are submitted by you.
- Deadlines in bounty descriptions are not enforced by the protocol, and whether a claim wins is the issuer's judgment (or a contributor vote on open bounties). A high score means the odds are decent, not that payment is guaranteed.

## License

MIT
