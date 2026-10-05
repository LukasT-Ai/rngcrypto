// Headless Edge browser pass over CDP. Usage: node pass.mjs <wsDebuggerUrl> <outDir>
import { writeFileSync } from "node:fs";

const [, , wsUrl, outDir] = process.argv;
const BASE = "https://www.rngcrypto.com/signals";
const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
const events = [];
const consoleErrors = [];

ws.addEventListener("message", (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method) {
    events.push(msg);
    if (msg.method === "Runtime.exceptionThrown") consoleErrors.push("EXC " + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).slice(0, 300));
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") consoleErrors.push("ERR " + msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") consoleErrors.push("LOG " + msg.params.entry.text.slice(0, 300));
    if (msg.method === "Network.responseReceived" && msg.params.response.status >= 400) consoleErrors.push(`HTTP ${msg.params.response.status} ${msg.params.response.url.slice(0, 160)}`);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result?.value;
};
const waitFor = async (expr, timeoutMs, step = 500) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await evaluate(expr)) return true;
    await sleep(step);
  }
  return false;
};
const shot = async (name, fullPage = false) => {
  let clip;
  if (fullPage) {
    const m = await send("Page.getLayoutMetrics");
    const h = Math.min(Math.ceil(m.cssContentSize.height), 6000);
    clip = { x: 0, y: 0, width: Math.ceil(m.cssContentSize.width), height: h, scale: 1 };
  }
  const r = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip, captureBeyondViewport: true } : {}) });
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.data, "base64"));
};

const report = { steps: [], consoleErrors, linkResults: {}, textIssues: {}, mobile: {} };
const step = (s) => {
  report.steps.push(s);
  console.log(s);
};

const checkLinks = async (label) => {
  const links = await evaluate(`Array.from(document.querySelectorAll('#sec-reco a[href^="#sec-"]')).map(a => a.getAttribute('href').slice(1))`);
  const uniq = [...new Set(links ?? [])];
  const results = [];
  for (const sid of uniq) {
    await evaluate(`window.scrollTo(0,0)`);
    await sleep(150);
    const clicked = await evaluate(`(() => { const a = document.querySelector('#sec-reco a[href="#${sid}"]'); if (!a) return false; a.click(); return true; })()`);
    await sleep(1600);
    const info = await evaluate(`(() => { const el = document.getElementById('${sid}'); if (!el) return { exists:false }; const r = el.getBoundingClientRect(); return { exists:true, top: Math.round(r.top), height: Math.round(r.height), highlighted: !!el.style.boxShadow, openDetails: el.tagName==='DETAILS' ? el.open : null }; })()`);
    results.push({ sid, clicked, ...info, ok: info.exists && info.top > -120 && info.top < 260 });
  }
  report.linkResults[label] = results;
  step(`${label}: ${results.filter((r) => r.ok).length}/${results.length} anchor links land in view; missing: ${results.filter((r) => !r.exists).map((r) => r.sid).join(",") || "none"}`);
};

const textScan = async (label) => {
  const issues = await evaluate(`(() => { const t = document.body.innerText; const out = {}; for (const k of ['NaN','undefined','$undefined','Infinity','[object Object]']) { const n = t.split(k).length - 1; if (n) out[k] = n; } return out; })()`);
  report.textIssues[label] = issues;
  step(`${label}: text issues ${JSON.stringify(issues)}`);
};

const waitReco = async (sym, ms = 90000) =>
  waitFor(`(() => { const r = document.getElementById('sec-reco'); if (!r) return false; const t = r.innerText; return !t.includes('Building recommendation') && (t.includes('${sym}') || document.body.innerText.includes('${sym}')); })()`, ms, 1000);

try {
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });

  await send("Page.navigate", { url: BASE });
  step("navigated desktop");
  const ready = await waitReco("Bitcoin");
  step(`BTC recommendation rendered: ${ready}`);
  await sleep(1500);
  await shot("desktop-btc-top");
  report.recoTextBTC = await evaluate(`document.getElementById('sec-reco')?.innerText.slice(0, 1200)`);
  await textScan("desktop-btc");
  await checkLinks("desktop-btc");
  await evaluate(`window.scrollTo(0,0)`);

  // switch to OIL via ticker pill
  const sw = await evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim().toUpperCase() === 'OIL'); if (!b) return false; b.click(); return true; })()`);
  step(`clicked OIL pill: ${sw}`);
  const oilReady = await waitFor(`(() => { const r = document.getElementById('sec-reco'); if (!r) return false; const t = r.innerText; return !t.includes('Building recommendation') && /WTI|Oil/i.test(t) && !/Loading OIL/.test(document.body.innerText); })()`, 120000, 1000);
  step(`OIL recommendation rendered: ${oilReady}`);
  await sleep(1500);
  await shot("desktop-oil-top");
  report.recoTextOIL = await evaluate(`document.getElementById('sec-reco')?.innerText.slice(0, 1200)`);
  await textScan("desktop-oil");
  await checkLinks("desktop-oil");
  await evaluate(`document.getElementById('sec-geo')?.scrollIntoView()`);
  await sleep(600);
  await shot("desktop-oil-geo");
  await evaluate(`document.getElementById('sec-forecast')?.scrollIntoView()`);
  await sleep(600);
  await shot("desktop-oil-forecast");

  // mobile
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.reload");
  await sleep(2000);
  const mReady = await waitReco("Bitcoin");
  step(`mobile BTC rendered: ${mReady}`);
  await sleep(1500);
  await shot("mobile-btc-top");
  report.mobile.overflow = await evaluate(`({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })`);
  report.mobile.recoHeight = await evaluate(`document.getElementById('sec-reco')?.getBoundingClientRect().height`);
  await textScan("mobile-btc");
  await checkLinks("mobile-btc");
  const smw = await evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim().toUpperCase() === 'OIL'); if (!b) return false; b.scrollIntoView(); b.click(); return true; })()`);
  step(`mobile clicked OIL: ${smw}`);
  await waitFor(`(() => { const r = document.getElementById('sec-reco'); return r && !r.innerText.includes('Building recommendation') && /WTI|Oil/i.test(r.innerText); })()`, 120000, 1000);
  await sleep(1000);
  await evaluate(`window.scrollTo(0,0)`);
  await shot("mobile-oil-top");
  await evaluate(`document.getElementById('sec-geo')?.scrollIntoView()`);
  await sleep(600);
  await shot("mobile-oil-geo");
  report.mobile.overflowOil = await evaluate(`({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })`);
  report.mobile.wideElements = await evaluate(`(() => { const w = 390; const out = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.right > w + 2 && r.width > 40) { out.push({ tag: el.tagName, cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 80), right: Math.round(r.right), width: Math.round(r.width), text: (el.textContent || '').trim().slice(0, 50) }); if (out.length >= 12) break; } } return out; })()`);
  await checkLinks("mobile-oil");
} catch (e) {
  report.fatal = String(e);
  console.error("FATAL", e);
} finally {
  writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  console.log("REPORT WRITTEN");
  ws.close();
  process.exit(0);
}
