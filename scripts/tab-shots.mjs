// Screenshots of specific signal tabs at 390 and 1440 over CDP.
// Usage: node tab-shots.mjs <wsDebuggerUrl> <outDir> <pageUrl> <tab1,tab2,...>
import { writeFileSync } from "node:fs";

const [, , wsUrl, outDir, url, tabsArg] = process.argv;
const tabs = (tabsArg ?? "flow,levels").split(",");
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
const report = {};
for (const [label, metrics] of [["1440", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }], ["390", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }]]) {
  await send("Emulation.setDeviceMetricsOverride", metrics);
  await send("Page.navigate", { url });
  await sleep(3000);
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const ready = await ev(`(() => { const r = document.getElementById('sec-reco'); if (r) return !r.innerText.includes('Building recommendation'); return /Could not load/.test(document.body.innerText); })()`);
    if (ready) break;
    await sleep(1000);
  }
  for (const tab of tabs) {
    const clicked = await ev(`(() => { const b = [...document.querySelectorAll('[role="tab"]')].find((x) => x.textContent.trim().toLowerCase() === '${tab}'); if (!b) return false; for (const t of ['pointerdown','mousedown']) b.dispatchEvent(new MouseEvent(t, { bubbles: true, button: 0 })); b.click(); return true; })()`);
    await sleep(1800);
    const sec = tab === "flow" ? "sec-order-flow" : tab === "levels" ? "sec-chart" : tab === "momentum" ? "sec-volatility" : null;
    const info = await ev(`(() => { const s = ${sec ? `document.getElementById('${sec}')` : "null"}; if (s) s.scrollIntoView({ block: 'start' }); const panel = document.querySelector('[role="tabpanel"][data-state="active"]'); return { clicked: ${clicked}, section: !!s, overflow: document.documentElement.scrollWidth, inner: window.innerWidth, panelW: panel?.scrollWidth, nan: (document.body.innerText.match(/NaN|undefined/g)||[]).length, feedOff: (document.body.innerText.match(/feed off|Deribit off|DefiLlama off/g)||[]).length, canvas: document.querySelectorAll('canvas').length }; })()`);
    await sleep(600);
    await shot(`${tab}-${label}`);
    report[`${tab}-${label}`] = info;
    console.log(`${tab}-${label}: ${JSON.stringify(info)}`);
  }
}
console.log("ERRORS: " + (errors.length ? errors.join(" || ") : "none"));
writeFileSync(`${outDir}/report.json`, JSON.stringify({ report, errors }, null, 2));
ws.close(); process.exit(0);
