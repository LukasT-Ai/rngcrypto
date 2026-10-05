export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runOutcomeCheck } = await import("./app/api/signals/history/check/core");
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
