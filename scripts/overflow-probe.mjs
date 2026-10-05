// Find what widens the mobile layout viewport on the OIL view. Usage: node probe.mjs <ws> <symbol>
const [, , wsUrl, sym = "OIL"] = process.argv;
const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
ws.addEventListener("message", (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
await new Promise((r) => ws.addEventListener("open", r));
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: "https://www.rngcrypto.com/signals" });
await sleep(4000);
for (let i = 0; i < 60; i++) { if (await ev(`!!document.getElementById('sec-reco') && !document.getElementById('sec-reco').innerText.includes('Building')`)) break; await sleep(1000); }
if (sym !== "BTC") {
  await ev(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim().toUpperCase() === '${sym}'); b && b.click(); })()`);
  for (let i = 0; i < 90; i++) { if (await ev(`(() => { const r = document.getElementById('sec-reco'); return r && !r.innerText.includes('Building') && !/Loading ${sym}/.test(document.body.innerText) && document.body.innerText.includes('${sym}'); })()`)) break; await sleep(1000); }
  await sleep(2000);
}
const out = await ev(`(() => {
  const vw = 390; const res = [];
  const inScroller = (el) => { let p = el; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; p = p.parentElement; } return false; };
  for (const el of document.querySelectorAll('main *, body > div *')) {
    const cs = getComputedStyle(el); if (cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect(); if (r.width < 30 || r.right <= vw + 1) continue;
    if (inScroller(el)) continue;
    let sec = el.closest('[id^="sec-"]');
    res.push({ right: Math.round(r.right), w: Math.round(r.width), tag: el.tagName, cls: (el.className?.toString?.() || '').slice(0, 70), sec: sec ? sec.id : null, text: (el.innerText || el.textContent || '').trim().slice(0, 60) });
  }
  res.sort((a, b) => b.right - a.right);
  return { innerWidth: window.innerWidth, docWidth: document.documentElement.scrollWidth, count: res.length, top: res.slice(0, 14) };
})()`);
console.log(JSON.stringify(out, null, 1));
ws.close(); process.exit(0);
