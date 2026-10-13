export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runOutcomeCheck } = await import("./app/api/signals/history/check/core");
  const { SCAN_SYMBOLS } = await import("./app/api/signals/history/logger");
  const { computeSignal } = await import("./lib/signals/engine");
  const { tick } = await import("./lib/macro/service");

  let busy = false;
  const outcomes = async () => {
    if (busy) return;
    busy = true;
    try {
      await runOutcomeCheck();
    } catch {
      /* next tick */
    } finally {
      busy = false;
    }
  };
  setTimeout(outcomes, 15_000);
  setInterval(outcomes, 60_000);

  // Daily ledger integrity + calibration refresh (be-measure PR 13/17): SHA-256 of the ledger file written to
  // ledger-hash.json once per UTC day at 00:05 (and once at boot so a fresh deploy serves a hash), then the
  // Stage 0 calibration refit on the same schedule. Each is idempotent per day.
  const { computeLedgerHash } = await import("./app/api/signals/history/ledger");
  const { getAllHistory } = await import("./app/api/signals/history/logger");
  const { refreshCalibration } = await import("./lib/signals/calibration");
  const { ENGINE_VERSION } = await import("./lib/signals/engine");
  const daily = () => {
    try {
      computeLedgerHash();
    } catch {
      /* next day */
    }
    try {
      refreshCalibration(getAllHistory(), ENGINE_VERSION);
    } catch {
      /* next day */
    }
  };
  setTimeout(daily, 30_000);
  const scheduleDaily = () => {
    const now = new Date();
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5, 0);
    setTimeout(() => {
      daily();
      scheduleDaily();
    }, Math.max(60_000, next - now.getTime()));
  };
  scheduleDaily();

  // Scheduled signal logging: every symbol runs through the engine with log=1 once per 15m candle,
  // 20s after the close so the candle is final. Logging no longer depends on someone loading a page,
  // and the dedupe rule in appendSignal keeps one open record per symbol and bias.
  if (process.env.SIGNAL_SCHEDULER !== "0") {
    const SLOT_MS = 15 * 60_000;
    const OFFSET_MS = 20_000;
    const POOL = 4;
    let scanBusy = false;

    const logOne = async (sym: string) => {
      try {
        await computeSignal(sym, { log: true });
      } catch {
        /* symbol skipped this slot */
      }
    };

    const scanAll = async () => {
      if (scanBusy) return;
      scanBusy = true;
      try {
        const queue = [...SCAN_SYMBOLS];
        await Promise.all(
          Array.from({ length: POOL }, async () => {
            while (queue.length) {
              const sym = queue.shift();
              if (sym) await logOne(sym);
            }
          })
        );
      } finally {
        scanBusy = false;
      }
    };

    const schedule = () => {
      const now = Date.now();
      const nextClose = Math.ceil(now / SLOT_MS) * SLOT_MS;
      let wait = nextClose + OFFSET_MS - now;
      if (wait < 5_000) wait += SLOT_MS;
      setTimeout(() => {
        void scanAll();
        setInterval(() => void scanAll(), SLOT_MS);
      }, wait);
    };
    schedule();
  }

  // Quarter-hour taker imbalance (PR 23, research 1.4): at every :00/:15/:30/:45 UTC boundary sample the OKX
  // trade tape for the opening minute of each crypto symbol and store the imbalance (last 96 windows per symbol
  // under the data dir). The sampler polls /market/trades every 2s until the window closes; each symbol fails
  // independently and a failed window is simply absent. QH_IMBALANCE=0 disables it.
  if (process.env.QH_IMBALANCE !== "0") {
    const { sampleAllQhWindows, nextQhBoundary, QH_SLOT_MS, getQhImbalance, getQhSeries } = await import("./lib/signals/features/qh-imbalance");
    // Hand the store to be-features' cvd module (features.cvd.qhImbalance / qhReadings). cvd.ts lands on master
    // one merge before this file, so the import is guarded: before that merge it simply does not register.
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- must stay valid both before and after cvd.ts exists
      // @ts-ignore cvd.ts is owned by build/be-features and is absent on this branch until the wave 2 merge
      const cvd = (await import("./lib/signals/features/cvd")) as { registerQhReader?: (fn: (ccy: string) => { value: number; readings: number[]; asOf: number } | null) => void };
      cvd.registerQhReader?.((symbol) => {
        const r = getQhImbalance(symbol);
        if (!r || r.stale) return null;
        return { value: r.ema4, readings: getQhSeries(symbol, 4).map((x) => x.imbalance), asOf: Date.parse(r.windowEnd) };
      });
    } catch {
      /* cvd module not merged yet */
    }
    const { SYMBOL_MAP } = await import("./lib/signals/engine");
    const qhSymbols = Object.entries(SYMBOL_MAP)
      .filter(([, c]) => c.isCrypto && c.okx)
      .map(([symbol, c]) => ({ symbol, instId: `${c.okx}-USDT-SWAP` }));
    let qhBusy = false;
    const qhSample = async (start: number) => {
      if (qhBusy) return;
      qhBusy = true;
      try {
        await sampleAllQhWindows(qhSymbols, start);
      } catch {
        /* next boundary */
      } finally {
        qhBusy = false;
      }
    };
    // Re-armed from each boundary (no setInterval drift): fire 1s after the boundary so the first page already
    // holds opening-minute trades; the sampler keeps polling until the minute is over.
    const qhSchedule = () => {
      const start = nextQhBoundary();
      setTimeout(() => {
        void qhSample(start);
        qhSchedule();
      }, Math.max(1_000, Math.min(QH_SLOT_MS, start + 1_000 - Date.now())));
    };
    qhSchedule();
  }

  // Copy-trade scanner (Hyperliquid top traders): a full cycle over the ranked candidate set every 15 min (first
  // one 20s after boot; the previous scan is served from <dataDir>/copytrade/ meanwhile) and a 2-min refresh of
  // open positions for the top 60 per asset. The leaderboard is re-downloaded at most hourly inside the cycle.
  // COPYTRADE=0 disables it.
  if (process.env.COPYTRADE !== "0") {
    const { runScanCycle, refreshHotPositions, setNextScanAt, SCAN_INTERVAL_MS, HOT_INTERVAL_MS } = await import("./lib/hyperliquid/scanner");
    const cycle = async () => {
      setNextScanAt(Date.now() + SCAN_INTERVAL_MS);
      try {
        await runScanCycle();
      } catch {
        /* next cycle */
      }
    };
    setNextScanAt(Date.now() + 20_000);
    setTimeout(() => {
      void cycle();
      setInterval(() => void cycle(), SCAN_INTERVAL_MS);
    }, 20_000);
    setInterval(() => {
      refreshHotPositions().catch(() => undefined);
    }, HOT_INTERVAL_MS);
  }

  // Macro event loop: 15s baseline; the service itself tightens market polling inside release windows.
  let macroBusy = false;
  const macro = async () => {
    if (macroBusy) return;
    macroBusy = true;
    try {
      await tick();
    } catch {
      /* next tick */
    } finally {
      macroBusy = false;
    }
  };
  setTimeout(macro, 5_000);
  setInterval(macro, 15_000);
}
