import React, { useEffect, useMemo, useRef, useState, PropsWithChildren } from "react";
import { QRCodeCanvas } from "qrcode.react";

function Card({ className = "", children }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={`rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-800/40 shadow ${className}`}>
      {children}
    </div>
  );
}

const API_BASE = "";

function useQuery() {
  return useMemo(() => new URLSearchParams(window.location.search), []);
}

function useTheme(initial: string) {
  const [theme, setTheme] = useState(initial);
  useEffect(() => {
    const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const final = theme === "auto" ? (sysDark ? "dark" : "light") : theme;
    document.documentElement.classList.toggle("dark", final === "dark");
  }, [theme]);
  return { theme, setTheme } as const;
}

function secondsUntil(dateStr: string, now: number) {
  const d = new Date(dateStr).getTime();
  return Math.max(0, Math.round((d - now) / 1000));
}

function formatArrival(seconds: number) {
  if (seconds <= 60) return "≤1 мин";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m.toString().padStart(2, '0')} мин`;
  const hh = Math.floor(m / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function OnlineTabloApp() {
  const q = useQuery();
  const city = q.get("city") ?? "Нальчик";
  const stopId = q.get("stopId") ?? "18859506377921266";
  const refreshSec = Math.min(300, Math.max(5, Number(q.get("refresh") ?? 30)));
  const themeParam = (q.get("theme") ?? "auto").toLowerCase();
  const view = (q.get("view") ?? "board").toLowerCase();
  const apiParam = q.get("api") ?? API_BASE;
  const clockVisible = (q.get("clock") ?? "on") !== "off";
  const qrVisible = (q.get("qr") ?? "on") !== "off";
  const { theme, setTheme } = useTheme(themeParam);

  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverNow, setServerNow] = useState<number>(Date.now());
  const [tick, setTick] = useState(0);

  const timerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  const cacheKey = `tablo:${city}:${stopId}`;

  useEffect(() => {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { setData(JSON.parse(cached)); } catch {}
    }
  }, [cacheKey]);

  async function fetchData() {
    setError(null);
    try {
      let url = `${apiParam || ''}/api/arrivals?city=${encodeURIComponent(city)}&stopId=${encodeURIComponent(stopId)}&limit=20`;
      if (!apiParam) {
        const demo = {
          stop: { id: stopId, name: "Ж/д вокзал", city },
          generatedAt: new Date().toISOString(),
          items: [
            { routeId: "130", routeType: "minibus", routeName: "Маршрутка 130", arrivalInMinutes: 4, isRealtime: true },
            { routeId: "33Ш", routeType: "bus", routeName: "Автобус 33Ш", arrivalInMinutes: 8, isRealtime: true },
            { routeId: "19", routeType: "minibus", routeName: "Маршрутка 19", arrivalInMinutes: 11, isRealtime: true },
            { routeId: "3", routeType: "minibus", routeName: "Маршрутка 3", arrivalInMinutes: 14, isRealtime: true },
            { routeId: "128", routeType: "minibus", routeName: "Маршрутка 128", arrivalInMinutes: 20, isRealtime: true },
            { routeId: "131", routeType: "minibus", routeName: "Маршрутка 131", arrivalInMinutes: 20, isRealtime: true }
          ]
        };
        setData(demo);
        localStorage.setItem(cacheKey, JSON.stringify(demo));
        setServerNow(Date.now());
        return;
      }
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const dateHdr = resp.headers.get("date");
      if (dateHdr) setServerNow(new Date(dateHdr).getTime()); else setServerNow(Date.now());
      const json = await resp.json();
      setData(json);
      localStorage.setItem(cacheKey, JSON.stringify(json));
    } catch (e:any) {
      setError(e.message || "Ошибка API");
    }
  }

  useEffect(() => {
    fetchData();
    const jitter = Math.floor(refreshSec * 0.1 * Math.random());
    timerRef.current = window.setInterval(fetchData, (refreshSec + jitter) * 1000) as unknown as number;
    tickRef.current = window.setInterval(() => setTick(t => t + 1), 1000) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [city, stopId, refreshSec, apiParam]);

  const now = serverNow + tick * 1000;

  const items = (data?.items || []).map((it:any) => {
    const secs = it.scheduledTime ? secondsUntil(`${new Date().toDateString()} ${it.scheduledTime}`, now) : (it.arrivalInMinutes ?? 0) * 60 - (tick % 60);
    return { ...it, etaSec: Math.max(0, secs) };
  }).sort((a:any,b:any) => a.etaSec - b.etaSec);

  return (
    <div className="min-h-screen w-full bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50 transition-colors">
      <header className="w-full p-4 flex items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-extrabold leading-tight">{data?.stop?.city || city}, {data?.stop?.name || "Остановка"}</h1>
        </div>
        {clockVisible && (
          <Clock now={now} />
        )}
      </header>

      <main className="px-4 pb-8 grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        {view === "ticker" ? (
          <Ticker items={items} />
        ) : (
          <Board items={items} />
        )}

        <aside className="hidden xl:block">
          <Card className="p-4 flex flex-col justify-between h-full items-center text-center">
            <div>
              <div className="text-lg font-bold mb-2">Цифровые решения регионов</div>
              <div className="opacity-80 mb-4 text-sm">Решение для цифровой трансформации</div>
              {qrVisible && (
                <div className="flex items-center justify-center mb-4">
                  <QRCodeCanvas value="https://crrintegro.ru/asyot" size={160} />
                </div>
              )}
            </div>
          </Card>
          <div className="mt-4 flex items-center gap-2 justify-center">
            <button className="px-3 py-2 rounded-xl bg-neutral-200 dark:bg-neutral-800" onClick={() => setTheme(t => t === 'light' ? 'dark' : t === 'dark' ? 'auto' : 'light')}>Тема: {theme}</button>
            <span className="text-xs opacity-60">auto→light→dark</span>
          </div>
          {error && <div className="mt-4 text-red-500 text-center">{error}</div>}
        </aside>
      </main>
    </div>
  );
}

function Clock({ now }: { now: number }) {
  const d = new Date(now);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return (
    <div className="text-4xl sm:text-6xl font-black tabular-nums">{hh}:{mm}</div>
  );
}

function Board({ items }: { items: any[] }) {
  return (
    <Card className="rounded-2xl overflow-hidden">
      <div className="grid grid-cols-[1fr_auto] bg-neutral-100 dark:bg-neutral-800 p-4 text-xl sm:text-2xl font-extrabold">
        <div>Маршрут</div>
        <div>Прибудет через</div>
      </div>
      <ul>
        {items.length === 0 && (
          <li className="p-6 text-center opacity-70">Нет ближайших рейсов</li>
        )}
        {items.map((it:any, idx:number) => (
          <li key={`${it.routeId}-${idx}`} className={`grid grid-cols-[1fr_auto] items-center p-4 ${idx % 2 ? 'bg-neutral-50 dark:bg-neutral-900/40' : ''}`}>
            <div className="flex items-baseline gap-3">
              <span className="inline-block w-2 h-2 rounded-full mt-2" style={{ background: pickColor(it.routeType) }} />
              <div>
                <div className="text-2xl sm:text-3xl font-black leading-none">{it.routeId}</div>
                <div className="text-sm opacity-70">{it.routeName || labelType(it.routeType)}</div>
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold tabular-nums">{formatArrival(it.etaSec)}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Ticker({ items }: { items: any[] }) {
  return (
    <div className="w-full overflow-hidden">
      <div className="animate-[marquee_20s_linear_infinite] whitespace-nowrap text-xl font-bold py-3">
        {items.map((it:any, i:number) => (
          <span key={i} className="mx-6">{it.routeId} — {formatArrival(it.etaSec)}</span>
        ))}
      </div>
      <style>{`@keyframes marquee { 0%{ transform: translateX(0);} 100%{ transform: translateX(-50%);} }`}</style>
    </div>
  );
}

function labelType(t?: string) {
  switch (t) {
    case "bus": return "Автобус";
    case "tram": return "Трамвай";
    case "trolley": return "Троллейбус";
    case "minibus": return "Маршрутка";
    default: return "Маршрут";
  }
}

function pickColor(t?: string) {
  switch (t) {
    case "bus": return "#3B82F6";
    case "tram": return "#EF4444";
    case "trolley": return "#10B981";
    case "minibus": return "#A855F7";
    default: return "#6B7280";
  }
}
