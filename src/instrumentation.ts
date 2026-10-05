export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runOutcomeCheck } = await import("./app/api/signals/history/check/core");
  let busy = false;
  const tick = async () => {
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
  setTimeout(tick, 15_000);
  setInterval(tick, 60_000);
}
