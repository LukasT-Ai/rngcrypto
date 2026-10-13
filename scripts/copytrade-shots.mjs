// Screenshots of /copytrade (list + drawer) at 390 and 1440 over CDP, using the dev mock.
// Usage: node copytrade-shots.mjs <wsDebuggerUrl> <outDir> <pageUrl>
import { writeFileSync } from "node:fs";

const [, , wsUrl, outDir, url] = process.argv;
const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener("message", (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method === "Runtime.exceptionThrown") errors.push("EXC " + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).slice(0, 300));
  else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push("ERR " + msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async (name, full) => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!full });
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.data, "base64"));
};

await new Promise((r) => ws.addEventListener("open", r));
await send("Page.enable"); await send("Runtime.enable");
// Headless rejects clipboard writes even with the permission; stub it so the toast path is exercised.
await send("Page.addScriptToEvaluateOnNewDocument", { source: "Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() }, configurable: true })" });
try { await send("Browser.grantPermissions", { origin: new URL(url).origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }); } catch (e) { console.log("grantPermissions: " + e.message); }
const report = {};
for (const [label, metrics] of [["1440", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }], ["390", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }]]) {
  await send("Emulation.setDeviceMetricsOverride", metrics);
  await send("Page.navigate", { url });
  await sleep(2500);
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const ready = await ev(`/traders|No traders match|Could not load/.test(document.body.innerText)`);
    if (ready) break;
    await sleep(1000);
  }
  await sleep(1200);
  await ev(`window.scrollTo(0,0)`);
  const info = await ev(`({ overflow: document.documentElement.scrollWidth, inner: window.innerWidth, h1: document.querySelector('h1')?.innerText, rows: document.querySelectorAll('tbody tr').length, cards: document.querySelectorAll('.md\\\\:hidden > div').length, nan: (document.body.innerText.match(/NaN|undefined/g)||[]).length, sorted: document.querySelector('[aria-sort="descending"]')?.innerText })`);
  report[`list-${label}`] = info;
  console.log(`list-${label}: ${JSON.stringify(info)}`);
  await shot(`copytrade-list-${label}`);
  await shot(`copytrade-list-${label}-full`, true);
  // Strip copy button -> toast + checkmark state.
  const copied = await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Copy address/.test(x.getAttribute('aria-label') || '')); b?.click(); return !!b; })()`);
  await sleep(500);
  const toast = await ev(`(() => ({ copied: ${copied}, toast: document.querySelector('[role="status"]')?.innerText || '', state: [...document.querySelectorAll('button')].some((x) => x.getAttribute('aria-label') === 'Address copied') }))()`);
  report[`copy-${label}`] = toast; console.log(`copy-${label}: ${JSON.stringify(toast)}`);
  await shot(`copytrade-copied-${label}`);
  await sleep(2200);
  // Switch lens to all wallets and count rows.
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'All wallets'); b?.click(); })()`);
  await sleep(1500);
  const lens = await ev(`({ rows: document.querySelectorAll('tbody tr').length, text: (document.body.innerText.match(/[0-9]+ wallets?/) || [])[0] })`);
  report[`lens-all-${label}`] = lens; console.log(`lens-all-${label}: ${JSON.stringify(lens)}`);
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Ascend-copyable'); b?.click(); })()`);
  await sleep(1200);
  // Open the first trader drawer.
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /^View/.test(x.getAttribute('aria-label') || '')); b?.click(); return !!b; })()`);
  await sleep(2500);
  const dinfo = await ev(`(() => { const d = document.querySelector('[role="dialog"]'); return { dialog: !!d, w: d?.getBoundingClientRect().width, text: d?.innerText.slice(0, 120), nan: (d?.innerText.match(/NaN|undefined/g)||[]).length, svg: d?.querySelectorAll('svg.recharts-surface').length, overflow: d ? d.scrollWidth : null }; })()`);
  report[`drawer-${label}`] = dinfo;
  console.log(`drawer-${label}: ${JSON.stringify(dinfo)}`);
  await shot(`copytrade-drawer-${label}`);
  await ev(`(() => { const d = document.querySelector('[role="dialog"]'); if (d) d.scrollTop = 900; })()`);
  await sleep(500);
  await shot(`copytrade-drawer-${label}-scrolled`);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(600);
}
console.log("ERRORS: " + (errors.length ? errors.join(" || ") : "none"));
writeFileSync(`${outDir}/report.json`, JSON.stringify({ report, errors }, null, 2));
ws.close(); process.exit(0);
