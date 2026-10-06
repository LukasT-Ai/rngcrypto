p='src/app/api/signals/route.ts'
s=open(p,encoding='utf-8').read()
def rep(old,new,count=1):
    global s
    assert s.count(old)==count, (s.count(old), old[:80])
    s=s.replace(old,new)
rep('''  // Normalize by the weights actually in play so non-crypto assets are not compressed toward 50
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;''','''  // Normalize by the weights actually in play so non-crypto assets are not compressed toward 50.
  // Catalyst risk is direction-neutral (event proximity, closed markets), so it is NOT a vote in the
  // weighted score; it haircuts confidence below instead.
  const weightSum = (Object.values(weights).reduce((a, b) => a + b, 0) - weights.catalyst) || 1;''')
rep('''      etfScore.score * weights.etf +
      catalyst.score * weights.catalyst +
      liq.score * weights.liquidation +''','''      etfScore.score * weights.etf +
      liq.score * weights.liquidation +''')
rep('''  const strength = Math.abs(weightedScore);
  let confidence = clamp(Math.round(50 + strength / 2 + whipsawPenalty), 0, 100);''','''  const strength = Math.abs(weightedScore);
  const catalystHaircut = Math.round(Math.max(-100, Math.min(0, catalyst.score)) / 10); // 0 to -10
  let confidence = clamp(Math.round(50 + strength / 2 + whipsawPenalty + catalystHaircut), 0, 100);''')
open(p,'w',encoding='utf-8').write(s)
print("ok")
