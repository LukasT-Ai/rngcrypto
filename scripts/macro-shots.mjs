// Macro tab screenshots at 390 and 1440 over CDP. Usage: node scripts/macro-shots.mjs <wsDebuggerUrl> <outDir> <pageUrl>
// Opens the page with #macro, waits for the calendar (sec-calendar) to render rows, scrolls it into view and captures.
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
  } else if (msg.method === "Runtime.exceptionThrown") errors.push("EXC " + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).slice(0, 240));
  else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push("ERR " + msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 240));
  else if (msg.method === "Network.responseReceived" && msg.params.response.status >= 400) errors.push(`HTTP ${msg.params.response.status} ${msg.params.response.url.slice(0, 120)}`);
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async (name, clip) => {
  const r = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip, captureBeyondViewport: true } : {}) });
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.data, "base64"));
};

await new Promise((r) => ws.addEventListener("open", r));
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
const report = {};
for (const [label, metrics] of [["1440", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }], ["390", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }]]) {
  await send("Emulation.setDeviceMetricsOverride", metrics);
  await send("Page.navigate", { url });
  await sleep(2500);
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const ready = await ev(`(() => { const c = document.getElementById('sec-calendar'); return !!c && !c.getAttribute('aria-busy') && c.innerText.length > 80; })()`);
    if (ready) break;
    await sleep(1000);
  }
  await sleep(1500);
  // Expand the first upcoming row so the expansion renders too.
  await ev(`(() => { const b = document.querySelector('#sec-macro-strip button[aria-expanded]'); if (b) b.click(); return !!b; })()`);
  await sleep(600);
  const rect = await ev(`(() => { const c = document.getElementById('sec-calendar'); if (!c) return null; c.scrollIntoView({ block: 'start' }); const r = c.getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top + window.scrollY - 8), width: window.innerWidth, height: Math.min(r.height + 16, 2600), scale: 1 }; })()`);
  await ev(`window.scrollTo(0, 0)`);
  await shot(`macro-${label}-top`);
  if (rect) await shot(`macro-${label}-calendar`, rect);
  const info = await ev(`({ overflow: document.documentElement.scrollWidth, inner: window.innerWidth, rows: document.querySelectorAll('#sec-calendar tbody tr').length, cards: document.querySelectorAll('#sec-calendar .md\\\\:hidden > div > div').length, ids: ['sec-calendar','sec-macro','sec-macro-strip','sec-macro-results','sec-prediction','sec-geo','sec-news'].map((i) => [i, document.querySelectorAll('#' + i).length]), nan: (document.body.innerText.match(/NaN|undefined/g) || []).length })`);
  report[label] = info;
  console.log(`${label}: ${JSON.stringify(info)}`);
}
console.log("ERRORS: " + (errors.length ? errors.join(" || ") : "none"));
writeFileSync(`${outDir}/macro-shots-report.json`, JSON.stringify({ report, errors }, null, 2));
ws.close(); process.exit(0);
