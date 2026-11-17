# token-radar-forge

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/maoza119900/token-radar-forge/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/maoza119900/token-radar-forge/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it ranks the pre-token protocols of a sealed DefiLlama snapshot by an implied token value calibrated from the snapshot itself, and shows a reader how to farm each one.

## Run it

```sh
node main.ts
```

`main.ts` reads `/input/snapshot.json`, writes the ranked board to `/output/board.json`, the dashboard's data to `/output/data.js`, copies `dashboard/` and `screenshots/` to `/output`, and writes `/output/dossier.json`. Node 22 or later, standard library only, nothing to install. Run it twice and the two `/output` trees are byte for byte the same.

## The model (radar-2)

Implied value = TVL × category multiple × growth × maturity × breadth. The category multiple is the median market-cap-per-TVL of the live-token protocols in that category, read from the same snapshot — the market's own price for that kind of protocol, not a number we chose. Growth is the seven-day TVL change, clamped to −50%…+100% and weighted 0.6. Maturity rises with the days a protocol has run with no token, from 0.70 to 1.20 over three years. Breadth adds 5% per extra chain, up to four. The board covers all 197 rankable pre-token protocols: the 40 on the watchlist plus every other pre-token protocol that is not a wrapped, staked or bridged product of a token that already trades.

---

<sub>Entered on [make.fun](https://make.fun/?ref=tg8sjp12&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
