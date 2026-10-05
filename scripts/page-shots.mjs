// Desktop + mobile screenshots of several pages over CDP. Usage: node page-shots.mjs <wsDebuggerUrl> <outDir> <url1> [url2...]
import { writeFileSync } from "node:fs";

const [, , wsUrl, outDir, ...urls] = process.argv;
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
  } else if (msg.method === "Runtime.exceptionThrown") errors.push("EXC " + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).slice(0, 200));
  else if (msg.method === "Network.responseReceived" && msg.params.response.status >= 400) errors.push(`HTTP ${msg.params.response.status} ${msg.params.response.url.slice(0, 120)}`);
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.data, "base64")); };
const slug = (u) => new URL(u).pathname.replace(/\//g, "_").replace(/^_|_$/g, "") || "home";

await new Promise((r) => ws.addEventListener("open", r));
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
const report = {};
for (const url of urls) {
  for (const [label, metrics] of [["desktop", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }], ["mobile", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }]]) {
    await send("Emulation.setDeviceMetricsOverride", metrics);
    await send("Page.navigate", { url });
    await sleep(3000);
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      const ready = await ev(`(() => { const r = document.getElementById('sec-reco'); if (r) return !r.innerText.includes('Building recommendation'); return /Signal Performance|TP1 hit rate|Could not load/.test(document.body.innerText); })()`);
      if (ready) break;
      await sleep(1000);
    }
    await sleep(1500);
    await ev(`window.scrollTo(0,0)`);
    await shot(`${slug(url)}-${label}`);
    const info = await ev(`({ title: document.title, brand: getComputedStyle(document.querySelector('[data-variant]') || document.body).getPropertyValue('--brand').trim(), overflow: document.documentElement.scrollWidth, inner: window.innerWidth, h1: document.querySelector('h1')?.innerText, pills: document.querySelectorAll('button.snap-start').length, nan: (document.body.innerText.match(/NaN|undefined/g)||[]).length })`);
    report[`${slug(url)}-${label}`] = info;
    console.log(`${slug(url)}-${label}: ${JSON.stringify(info)}`);
  }
}
console.log("ERRORS: " + (errors.length ? errors.join(" || ") : "none"));
writeFileSync(`${outDir}/shots-report.json`, JSON.stringify({ report, errors }, null, 2));
ws.close(); process.exit(0);
