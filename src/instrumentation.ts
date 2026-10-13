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
