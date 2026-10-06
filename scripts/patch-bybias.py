p='src/app/api/signals/history/logger.ts'
s=open(p,encoding='utf-8').read()
def rep(old,new,count=1):
    global s
    assert s.count(old)==count, (s.count(old), old[:80])
    s=s.replace(old,new)
rep('''  byGradeSymbol: Record<string, Record<string, CalibrationBucket>>;
  oilByRegime: Record<string, CalibrationBucket>;
}''','''  byGradeSymbol: Record<string, Record<string, CalibrationBucket>>;
  oilByRegime: Record<string, CalibrationBucket>;
  // Long vs short performance side by side; the engine must earn its record on both sides.
  byBias: Record<"LONG" | "SHORT", CalibrationBucket & { total: number; pending: number }>;
}''')
rep('''  for (const [r, list] of regimes) oilByRegime[r] = bucketOf(list);

  return {
    byGradeSymbol,
    oilByRegime,''','''  for (const [r, list] of regimes) oilByRegime[r] = bucketOf(list);

  const sideOf = (b: "LONG" | "SHORT") => {
    const list = signals.filter((s) => s.bias === b);
    return { ...bucketOf(list), total: list.length, pending: list.filter((s) => s.outcome === "pending").length };
  };
  const byBias: SignalStats["byBias"] = { LONG: sideOf("LONG"), SHORT: sideOf("SHORT") };

  return {
    byGradeSymbol,
    oilByRegime,
    byBias,''')
open(p,'w',encoding='utf-8').write(s)

p='src/app/signals/dashboard.tsx'
s=open(p,encoding='utf-8').read()
rep('''    byGradeSymbol?: Record<string, Record<string, CalibrationBucket>>
    oilByRegime?: Record<string, CalibrationBucket>
  }
}''','''    byGradeSymbol?: Record<string, Record<string, CalibrationBucket>>
    oilByRegime?: Record<string, CalibrationBucket>
    byBias?: Record<"LONG" | "SHORT", CalibrationBucket & { total: number; pending: number }>
  }
}''')
rep('''                    {/* Recent signals table */}
                    {historyData.signals.length > 0 && (''','''                    {/* Long vs short: the engine has to earn its record on both sides */}
                    {historyData.stats.byBias && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        {(["LONG", "SHORT"] as const).map((side) => {
                          const b = historyData.stats.byBias![side]
                          const col = side === "LONG" ? "#00FF88" : "#FF3B5C"
                          const decided = b.wins + b.losses
                          const wrCol = decided === 0 ? "#9CA3AF" : b.winRate >= 60 ? "#00FF88" : b.winRate < 45 ? "#FF3B5C" : "#F59E0B"
                          return (
                            <div key={side} className="rounded-xl border bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md p-4" style={{ borderColor: `${col}30` }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="inline-flex items-center gap-1.5 text-xs font-black tracking-wider" style={{ color: col }}>
                                  {side === "LONG" ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                                  {side}S
                                </span>
                                <span className="text-[10px] text-white/35">{b.total} signals · {b.pending} open</span>
                              </div>
                              {b.total === 0 ? (
                                <p className="text-xs text-white/40">No {side.toLowerCase()} calls logged yet. The engine scores both sides symmetrically; this fills in as bearish setups qualify.</p>
                              ) : (
                                <div className="grid grid-cols-4 gap-2 text-center">
                                  <div><div className="font-mono text-lg font-black" style={{ color: wrCol }}>{decided ? `${b.winRate.toFixed(0)}%` : "—"}</div><div className="text-[9px] uppercase tracking-wide text-white/35">Win rate</div></div>
                                  <div><div className="font-mono text-lg font-black text-white/85">{b.wins}<span className="text-white/30">/</span>{b.losses}</div><div className="text-[9px] uppercase tracking-wide text-white/35">W / L</div></div>
                                  <div><div className="font-mono text-lg font-black text-white/85">{b.tp1Rate.toFixed(0)}%</div><div className="text-[9px] uppercase tracking-wide text-white/35">TP1 hit</div></div>
                                  <div><div className="font-mono text-lg font-black" style={{ color: b.avgR == null ? "#9CA3AF" : b.avgR > 0 ? "#00FF88" : "#FF3B5C" }}>{b.avgR == null ? "—" : `${b.avgR > 0 ? "+" : ""}${b.avgR.toFixed(2)}R`}</div><div className="text-[9px] uppercase tracking-wide text-white/35">Avg R</div></div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Recent signals table */}
                    {historyData.signals.length > 0 && (''')
open(p,'w',encoding='utf-8').write(s)

p='src/lib/macro/service.ts'
s=open(p,encoding='utf-8').read()
rep('''  if (regime.risk === "off") macro += asset === "BTC" ? -20 : asset === "GOLD" ? 10 : -10;
  if (regime.risk === "on") macro += asset === "BTC" ? 10 : 0;
  if (regime.inflationFocus === "high") macro += asset === "GOLD" ? 10 : asset === "BTC" ? -5 : 5;''','''  // Risk regime is a mirror: what risk-off takes from BTC and crude (and gives gold), risk-on gives back.
  if (regime.risk === "off") macro += asset === "BTC" ? -20 : asset === "GOLD" ? 10 : -10;
  if (regime.risk === "on") macro += asset === "BTC" ? 20 : asset === "GOLD" ? -10 : 10;
  if (regime.inflationFocus === "high") macro += asset === "GOLD" ? 10 : asset === "BTC" ? -5 : 5;
  if (regime.inflationFocus === "low") macro += asset === "GOLD" ? -10 : asset === "BTC" ? 5 : -5;''')
open(p,'w',encoding='utf-8').write(s)
print("ok")
