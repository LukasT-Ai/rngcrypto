p='src/app/api/signals/route.ts'
s=open(p,encoding='utf-8').read()
def rep(old,new,count=1):
    global s
    assert s.count(old)==count, (s.count(old), old[:80])
    s=s.replace(old,new)
rep('''  const isWait =
    strength < 10 ||
    (squeeze === "volatility_compression" && adx < 20) ||
    (trend1h !== trend4h && adx < 20);''','''  // A directional call needs tradeable conviction AFTER event and catalyst haircuts; below the logging
  // threshold it is a lean, not a trade. Same bar for both sides.
  const isWait =
    confidence < 55 ||
    (squeeze === "volatility_compression" && adx < 20) ||
    (trend1h !== trend4h && adx < 20);''')
rep('''  const macroBonus = getMacroBonus(macroState, call.bias, isCrypto);
  if (macroBonus !== 0) {
    call.confidence = clamp(call.confidence + macroBonus, 0, 100);
    call.grade = gradeFor(call.confidence, call.strongCategories);
    call.reasoning.unshift(`Macro regime ${macroState!.bias.replace(/_/g, " ")} ${macroBonus > 0 ? "supports" : "opposes"} the ${call.bias.toLowerCase()} (${macroBonus > 0 ? "+" : ""}${macroBonus})`);
  }''','''  const macroBonus = getMacroBonus(macroState, call.bias, isCrypto);
  if (macroBonus !== 0) {
    const side = call.bias.toLowerCase();
    call.confidence = clamp(call.confidence + macroBonus, 0, 100);
    call.grade = gradeFor(call.confidence, call.strongCategories);
    call.reasoning.unshift(`Macro regime ${macroState!.bias.replace(/_/g, " ")} ${macroBonus > 0 ? "supports" : "opposes"} the ${side} (${macroBonus > 0 ? "+" : ""}${macroBonus})`);
    if (call.confidence < 55 && call.bias !== "WAIT") {
      call.reasoning.unshift(`Stand aside: the ${side} lean is fighting the macro regime and drops below tradeable conviction`);
      call.bias = "WAIT";
    }
  }''')
open(p,'w',encoding='utf-8').write(s)
print("ok")
