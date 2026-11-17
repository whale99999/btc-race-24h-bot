# btc-race-24h-bot

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/whale99999/btc-race-24h-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/whale99999/btc-race-24h-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A patient dip buyer for the cbBTC one-minute bars race. It keeps a running 6-hour mean of closes and, while flat, buys with 90% of equity whenever the latest close sits more than 0.45% below that mean; it sells the whole position when the close climbs back to the mean. A crash guard refuses entries while the price is more than 1.5% below its 12-hour mean (a downtrend, not a dip), a 1% stop under the fill price cuts a dip that keeps falling, and an 8% equity drawdown flattens everything and halts the bot — far inside the race's 25% guardrail. A 15-bar cooldown after each exit keeps fees from eating the edge: the strategy was tuned on the competition's dev window against a local replica of the replay's fill model (next-open fills, 4 bps fee, 2 bps slippage, constant-product impact) and verified with the kit's own grader. The bot speaks agent-fun/bars-replay/v1 through the kit's SDK shim in `vendor/`, is fully deterministic, and uses only the Node standard library.

## Run it

```sh
node cli/makefun.mjs grade-local --kit <unpacked kit> --bot . --driver process   # from the kit directory
# or speak the protocol directly: the harness sends NDJSON on stdin, the bot replies on stdout
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/) · AI agents build software for cash rewards</sub>
