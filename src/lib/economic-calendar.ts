export interface CalendarEvent {
  name: string;
  time: Date;
  impact: "high" | "medium" | "low";
  currency: string;
  source: "scheduled" | "live";
}

interface CatalystResult {
  score: number;
  events: CalendarEvent[];
  catalystRisk: string | null;
}

let liveCache: { events: CalendarEvent[]; timestamp: number } | null = null;
const LIVE_CACHE_TTL = 60 * 60 * 1000;

function getThirdFriday(year: number, month: number): Date {
  const d = new Date(Date.UTC(year, month, 1));
  const dayOfWeek = d.getUTCDay();
  const firstFriday = dayOfWeek <= 5 ? (5 - dayOfWeek + 1) : (12 - dayOfWeek + 1);
  return new Date(Date.UTC(year, month, firstFriday + 14, 20, 0, 0));
}

function getFirstFriday(year: number, month: number): Date {
  const d = new Date(Date.UTC(year, month, 1));
  const dayOfWeek = d.getUTCDay();
  const firstFriday = dayOfWeek <= 5 ? (5 - dayOfWeek + 1) : (12 - dayOfWeek + 1);
  return new Date(Date.UTC(year, month, firstFriday, 12, 30, 0));
}

function generateScheduledEvents(): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const now = new Date();
  const year = now.getUTCFullYear();

  const fomcDates2026 = [
    [0, 29], [2, 18], [4, 6], [5, 17], [6, 29], [8, 16], [10, 4], [11, 16],
  ];
  for (const [month, day] of fomcDates2026) {
    events.push({
      name: "FOMC Rate Decision",
      time: new Date(Date.UTC(2026, month, day, 18, 0, 0)),
      impact: "high",
      currency: "USD",
      source: "scheduled",
    });
  }

  for (let m = 0; m < 12; m++) {
    events.push({
      name: "CPI Release",
      time: new Date(Date.UTC(year, m, 13, 12, 30, 0)),
      impact: "high",
      currency: "USD",
      source: "scheduled",
    });

    events.push({
      name: "PPI Release",
      time: new Date(Date.UTC(year, m, 14, 12, 30, 0)),
      impact: "medium",
      currency: "USD",
      source: "scheduled",
    });

    events.push({
      name: "PCE Price Index",
      time: new Date(Date.UTC(year, m, 28, 12, 30, 0)),
      impact: "high",
      currency: "USD",
      source: "scheduled",
    });

    events.push({
      name: "Retail Sales",
      time: new Date(Date.UTC(year, m, 16, 12, 30, 0)),
      impact: "medium",
      currency: "USD",
      source: "scheduled",
    });

    const nfp = getFirstFriday(year, m);
    events.push({
      name: "NFP / Jobs Report",
      time: nfp,
      impact: "high",
      currency: "USD",
      source: "scheduled",
    });

    const optExpiry = getThirdFriday(year, m);
    const isQuarterEnd = (m + 1) % 3 === 0;
    events.push({
      name: isQuarterEnd ? "Quad Witching (Options Expiry)" : "Monthly Options Expiry",
      time: optExpiry,
      impact: isQuarterEnd ? "high" : "medium",
      currency: "ALL",
      source: "scheduled",
    });

    for (let week = 0; week < 5; week++) {
      const d = new Date(Date.UTC(year, m, 1));
      const dayOfWeek = d.getUTCDay();
      const firstThursday = dayOfWeek <= 4 ? (4 - dayOfWeek + 1) : (11 - dayOfWeek + 1);
      const thursday = firstThursday + week * 7;
      if (thursday <= 31) {
        const dt = new Date(Date.UTC(year, m, thursday, 12, 30, 0));
        if (dt.getUTCMonth() === m) {
          events.push({
            name: "Jobless Claims",
            time: dt,
            impact: "low",
            currency: "USD",
            source: "scheduled",
          });
        }
      }
    }
  }

  for (const m of [0, 3, 6, 9]) {
    events.push({
      name: "GDP Report",
      time: new Date(Date.UTC(year, m + 1, 28, 12, 30, 0)),
      impact: "high",
      currency: "USD",
      source: "scheduled",
    });
  }

  return events;
}

async function fetchLiveEvents(): Promise<CalendarEvent[]> {
  if (liveCache && Date.now() - liveCache.timestamp < LIVE_CACHE_TTL) {
    return liveCache.events;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
      { signal: controller.signal, cache: "no-store" }
    );
    clearTimeout(timeout);

    if (!res.ok) return liveCache?.events ?? [];

    const data = (await res.json()) as {
      title?: string;
      date?: string;
      impact?: string;
      country?: string;
    }[];

    if (!Array.isArray(data)) return liveCache?.events ?? [];

    const events: CalendarEvent[] = [];
    for (const item of data) {
      if (!item.title || !item.date) continue;

      const time = new Date(item.date);
      if (isNaN(time.getTime())) continue;

      let impact: "high" | "medium" | "low" = "low";
      const impactStr = (item.impact ?? "").toLowerCase();
      if (impactStr === "high") impact = "high";
      else if (impactStr === "medium") impact = "medium";

      events.push({
        name: item.title,
        time,
        impact,
        currency: item.country ?? "USD",
        source: "live",
      });
    }

    liveCache = { events, timestamp: Date.now() };
    return events;
  } catch {
    return liveCache?.events ?? [];
  }
}

function deduplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Map<string, CalendarEvent>();
  for (const e of events) {
    const key = `${e.name}|${e.time.toISOString().slice(0, 13)}`;
    const existing = seen.get(key);
    if (!existing || e.source === "live") {
      seen.set(key, e);
    }
  }
  return [...seen.values()];
}

export async function getUpcomingEvents(
  hoursAhead = 24
): Promise<CalendarEvent[]> {
  const now = Date.now();
  const cutoff = now + hoursAhead * 60 * 60 * 1000;

  const scheduled = generateScheduledEvents();
  const live = await fetchLiveEvents();
  const all = deduplicateEvents([...scheduled, ...live]);

  return all
    .filter((e) => e.time.getTime() > now && e.time.getTime() <= cutoff)
    .sort((a, b) => a.time.getTime() - b.time.getTime());
}

export async function computeCatalystScore(): Promise<CatalystResult> {
  const events = await getUpcomingEvents(24);
  let score = 0;
  const riskParts: string[] = [];

  const now = Date.now();
  const day = new Date().getUTCDay();
  const hour = new Date().getUTCHours();

  if (day === 0 || day === 6) {
    score -= 30;
    riskParts.push("Weekend, reduced liquidity");
  }

  if (day >= 1 && day <= 5 && hour >= 13 && hour <= 14) {
    score -= 15;
    riskParts.push("US market open, potential volatility");
  }

  for (const event of events) {
    const hoursUntil = (event.time.getTime() - now) / (60 * 60 * 1000);

    let penalty = 0;
    if (event.impact === "high") {
      if (hoursUntil <= 2) penalty = -40;
      else if (hoursUntil <= 6) penalty = -20;
      else penalty = -10;
    } else if (event.impact === "medium") {
      if (hoursUntil <= 2) penalty = -20;
      else if (hoursUntil <= 6) penalty = -10;
      else penalty = -5;
    }

    if (penalty < 0) {
      score += penalty;
      if (hoursUntil <= 6 && (event.impact === "high" || event.impact === "medium")) {
        riskParts.push(`${event.name} in ${formatCountdown(hoursUntil)}`);
      }
    }
  }

  score = Math.max(-100, Math.min(0, score));

  return {
    score,
    events,
    catalystRisk: riskParts.length > 0 ? riskParts.join("; ") : null,
  };
}

function formatCountdown(hours: number): string {
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins}m`;
  }
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
