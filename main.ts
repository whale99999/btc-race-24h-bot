// Patient dip buyer for the cbBTC 24h bars race (agent-fun/bars-replay/v1).
//
// Strategy, tuned on the kit's dev window with a local replica of the replay's
// fill model (next-open fills, 4 bps fee, 2 bps slippage, constant-product
// impact against the bar's pool depth) and cross-checked with grade-local:
//
//   - Keep a running 6-hour mean (SMA of the last 360 one-minute closes).
//   - When flat and the latest close sits more than 0.45% below that mean,
//     buy with 90% of equity: in a range-bound tape the price revisits its
//     mean far more often than it runs away, and a round trip only pays
//     ~20 bps of fees, slippage and impact at this size.
//   - Sell the whole position when the close climbs back to the mean.
//   - A crash guard refuses new buys while the close is more than 1.5%
//     below the 12-hour mean (a real downtrend, not a dip), a 1% stop under
//     the fill price cuts a dip that keeps falling, and an 8% equity
//     drawdown from the peak flattens everything and halts the bot, far
//     inside the race's 25% drawdown guardrail.
//   - A 15-bar cooldown after every exit keeps the bot from churning:
//     on the dev window the churny house baselines paid $25+ of fees and
//     lost money, while this bot trades a handful of times.
//
// The bot is deterministic: every decision is a pure function of the bars
// and the account the harness sends. No clock, no environment, no files.

import { runBars, type BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

const MEAN_N = 360; // 6 hours of one-minute closes
const GUARD_N = 720; // 12 hours
const DIP = 0.0045; // buy when close is 0.45% under the 6h mean
const GUARD_BAND = 0.015; // no buys 1.5% under the 12h mean
const STOP = 0.01; // cut a position 1% under its fill price
const SIZE_BPS = 9_000n; // spend 90% of equity per entry
const COOLDOWN = 15; // bars to sit out after an exit
const DD_STOP = 0.08; // flatten and halt on an 8% equity drawdown
const MAX_SLIPPAGE_BPS = 300;

const closes: number[] = [];
let sumMean = 0;
let sumGuard = 0;
let entryPrice: number | null = null; // raw price units of the open position's fill
let cooldownUntil = -1;
let halted = false;
let peakEquity = 0;

function sma(sum: number, n: number): number {
  return sum / n;
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const symbol = state.hello.symbols[0]!.symbol;
    const bar = batch.bars.find((b) => b.symbol === symbol);

    // Learn the position's fill price from the fills this batch reports.
    for (const f of batch.fills) {
      if (f.symbol === symbol && f.status === 'filled' && f.side === 'buy') {
        entryPrice = Number(f.price);
      }
      if (f.symbol === symbol && f.status === 'filled' && f.side === 'sell') {
        entryPrice = null;
      }
    }

    if (bar !== undefined) {
      const c = Number(bar.c);
      closes.push(c);
      sumMean += c;
      sumGuard += c;
      if (closes.length > MEAN_N) sumMean -= closes[closes.length - 1 - MEAN_N]!;
      if (closes.length > GUARD_N) sumGuard -= closes[closes.length - 1 - GUARD_N]!;
    }

    const equity = Number(state.equity) / 1e6;
    if (equity > peakEquity) peakEquity = equity;

    if (state.warmingUp || bar === undefined) return [];

    const pos = state.positions.get(symbol);
    const qty = pos?.qty ?? 0n;
    const close = Number(bar.c);
    const meanN = Math.min(closes.length, MEAN_N);
    const guardN = Math.min(closes.length, GUARD_N);
    if (meanN < MEAN_N) return []; // not enough history to name a mean
    const mean = sma(sumMean, meanN);
    const guard = sma(sumGuard, guardN);

    // Drawdown halt: flatten once, then stay out for the rest of the window.
    if (halted) {
      if (qty > 0n) {
        return [{ side: 'sell', symbol, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }
    if (qty > 0n && peakEquity > 0 && (peakEquity - equity) / peakEquity > DD_STOP) {
      halted = true;
      return [{ side: 'sell', symbol, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }

    if (qty === 0n) {
      // Flat: look for a dip under the mean that is not a falling knife.
      if (state.seq < cooldownUntil) return [];
      const dip = (mean - close) / mean;
      const inDowntrend = close < guard * (1 - GUARD_BAND);
      if (dip <= DIP || inDowntrend) return [];
      const byEquity = (state.equity * SIZE_BPS) / 10_000n;
      const notional = state.cash < byEquity ? state.cash : byEquity;
      if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
      return [{ side: 'buy', symbol, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }

    // Holding: exit at the mean, on the stop, or not at all.
    const entry = entryPrice ?? (pos !== undefined && pos.qty > 0n
      ? Number((pos.cost * 10_000_000n) / pos.qty)
      : null);
    const hitMean = close >= mean;
    const hitStop = entry !== null && close < entry * (1 - STOP);
    if (hitMean || hitStop) {
      cooldownUntil = state.seq + COOLDOWN;
      return [{ side: 'sell', symbol, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
