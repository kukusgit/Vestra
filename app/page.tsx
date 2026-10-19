export const revalidate = 60;
export const maxDuration = 30;

type Coin = {
  name: string;
  symbol: string;
  price: number | null;
  change24h: number | null;
  commentary: string;
  icon: string;
  spark: number[];
};

const coinList = [
  { id: "bitcoin", name: "Bitcoin", symbol: "BTC", icon: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png" },
  { id: "ethereum", name: "Ethereum", symbol: "ETH", icon: "https://assets.coingecko.com/coins/images/279/large/ethereum.png" },
  { id: "solana", name: "Solana", symbol: "SOL", icon: "https://assets.coingecko.com/coins/images/4128/large/solana.png" },
  { id: "binancecoin", name: "BNB", symbol: "BNB", icon: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png" },
  { id: "ripple", name: "XRP", symbol: "XRP", icon: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png" },
  { id: "dogecoin", name: "Dogecoin", symbol: "DOGE", icon: "https://assets.coingecko.com/coins/images/5/large/dogecoin.png" },
];

const UNAVAILABLE = "Commentary unavailable.";

// Optional: a free CoinGecko Demo key gives you a dedicated rate limit instead of Vercel's shared IPs.
const cgHeaders: Record<string, string> = process.env.COINGECKO_API_KEY
  ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY }
  : {};

async function fetchJson(url: string, init: RequestInit, ms: number, retries = 0) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
}

async function callGemini(prompt: string): Promise<string> {
  const data = await fetchJson(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      next: { revalidate: 900 },
    },
    4000
  );
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No text in Gemini response");
  return text;
}

async function callGroq(prompt: string): Promise<string> {
  const data = await fetchJson(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: prompt }],
      }),
      next: { revalidate: 900 },
    },
    6000
  );
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("No text in Groq response");
  return text;
}

function parseCommentary(text: string, expected: number): string[] {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (
    !Array.isArray(parsed) ||
    parsed.length !== expected ||
    !parsed.every((s) => typeof s === "string" && s.trim().length > 0)
  ) {
    throw new Error("Unexpected commentary format");
  }
  return parsed.map((s) => s.trim().slice(0, 200));
}

async function getAllCommentary(
  coins: { name: string; change24h: number }[]
): Promise<string[]> {
  if (coins.length === 0) return [];

  const lines = coins
    .map((c) => `${c.name}: ${c.change24h.toFixed(1)}% change in 24h`)
    .join("\n");

  const prompt = `For each of these ${coins.length} cryptocurrencies, write one short, casual sentence (under 20 words) describing its price movement today, based only on the percentage change given. Do NOT invent specific causes like news, partnerships, celebrity tweets, court rulings, or technical issues — you don't have that information. Instead, describe the move itself in plain, friendly language (e.g. "holding pretty steady," "had a rough day," "quietly climbing"), and you can add a generic, clearly-speculative possibility (e.g. "could just be normal market movement" or "traders might be taking profits") without stating it as fact. Write it like you're texting a friend who knows nothing about crypto — no jargon. Keep any hedged guess consistent with the direction: for a rise, never mention profit-taking or selling; for a fall, never mention rallies or buying. Respond ONLY with a JSON array of ${coins.length} strings, in the same order as listed, no markdown, no extra text.\n\n${lines}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseCommentary(await callGemini(prompt), coins.length);
    } catch (err) {
      console.warn(`Gemini attempt ${attempt + 1} failed:`, err);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
    }
  }

  try {
    console.log("Falling back to Groq...");
    return parseCommentary(await callGroq(prompt), coins.length);
  } catch (err) {
    console.error("Groq fallback also failed:", err);
  }

  return coins.map(() => UNAVAILABLE);
}

async function getMarketOverview() {
  try {
    const data = await fetchJson(
      "https://api.coingecko.com/api/v3/global",
      { headers: cgHeaders, next: { revalidate: 60 } },
      5000, 2
    );
    const marketCap = data?.data?.total_market_cap?.inr;
    const btcDominance = data?.data?.market_cap_percentage?.btc;
    if (typeof marketCap !== "number" || typeof btcDominance !== "number") return null;
    return { marketCap, btcDominance };
  } catch (err) {
    console.warn("Market overview fetch failed:", err);
    return null;
  }
}

async function getSparkline(id: string, attempt = 0): Promise<number[]> {
  try {
    const data = await fetchJson(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=inr&days=7`,
      { headers: cgHeaders, next: { revalidate: 900 } },
      6000
    );
    const prices: [number, number][] = data?.prices ?? [];
    const step = Math.max(1, Math.floor(prices.length / 40));
    const sampled = prices.filter((_, i) => i % step === 0).map((p) => p[1]);
    if (prices.length && (prices.length - 1) % step !== 0) {
      sampled.push(prices[prices.length - 1][1]);
    }
    return sampled;
  } catch (err) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return getSparkline(id, attempt + 1);
    }
    console.warn(`Sparkline failed for ${id}:`, err);
    return [];
  }
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 200;
  const h = 48;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  const up = data[data.length - 1] >= data[0];
  const change = data[0] ? ((data[data.length - 1] - data[0]) / data[0]) * 100 : 0;

  return (
    <div className="mt-3 mb-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke={up ? "#22c55e" : "#ef4444"}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p className="text-[10px] text-gray-500 mt-1">
        7-day trend · {change >= 0 ? "+" : ""}
        {change.toFixed(1)}%
      </p>
    </div>
  );
}

async function getAllSparklines(): Promise<number[][]> {
  const out: number[][] = [];
  for (const c of coinList) {
    out.push(await getSparkline(c.id));
    await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}

async function getDashboard() {
  let priceData: Record<string, { inr?: number; inr_24h_change?: number }> | null = null;
  try {
    priceData = await fetchJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinList
        .map((c) => c.id)
        .join(",")}&vs_currencies=inr&include_24hr_change=true`,
      { headers: cgHeaders, next: { revalidate: 60 } },
      6000
    );
  } catch (err) {
    console.warn("Price fetch failed:", err);
  }

  const base = coinList.map((coin) => {
    const p = priceData?.[coin.id];
    const inr = p?.inr;
    const change = p?.inr_24h_change;
    return {
      ...coin,
      price: typeof inr === "number" ? inr : null,
      change24h: typeof change === "number" ? change : null,
    };
  });

  type Priced = (typeof base)[number] & { price: number; change24h: number };
  const priced = base.filter(
    (c): c is Priced => c.price !== null && c.change24h !== null
  );

  const [sparks, commentaries, market] = await Promise.all([
    getAllSparklines(),
    getAllCommentary(priced.map((c) => ({ name: c.name, change24h: c.change24h }))),
    getMarketOverview(),
  ]);

  const coins: Coin[] = base.map((c, i) => {
    const idx = priced.findIndex((p) => p.symbol === c.symbol);
    return {
      name: c.name,
      symbol: c.symbol,
      icon: c.icon,
      price: c.price,
      change24h: c.change24h,
      spark: sparks[i],
      commentary: idx >= 0 ? (commentaries[idx] ?? UNAVAILABLE) : UNAVAILABLE,
    };
  });

  const avgChange =
    priced.length > 0
      ? priced.reduce((s, c) => s + c.change24h, 0) / priced.length
      : null;

  return { coins, market, avgChange, pricesOk: priced.length > 0 };
}

export default async function Home() {
  const { coins, market, avgChange, pricesOk } = await getDashboard();

  const lastUpdated = new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  return (
    <main className="relative min-h-screen bg-black text-white px-4 sm:px-6 py-10 sm:py-16 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center opacity-60"
        style={{ backgroundImage: "url('/background.png')" }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-black/60" />

      <div className="relative max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <img src="/Vestra_header_Logo.png" alt="Vestra" className="h-12 sm:h-20 w-auto" />
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              {pricesOk && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  pricesOk ? "bg-green-500" : "bg-yellow-500"
                }`}
              ></span>
            </span>
            <span className="text-[10px] sm:text-xs text-gray-400">
              {pricesOk ? `Live · Updated ${lastUpdated} IST` : "Prices unavailable"}
            </span>
          </div>
        </div>

        <p className="text-gray-400 mt-2 mb-6">
          Live crypto rates with AI-powered insights
        </p>

        {!pricesOk && (
          <div className="mb-6 rounded-xl border border-yellow-900/60 bg-yellow-950/30 px-4 py-3 text-sm text-yellow-200">
            Live prices are temporarily unavailable. Please refresh in a minute.
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-10">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 sm:p-4">
            <p className="text-xs text-gray-500">Market Cap</p>
            <p className="text-base sm:text-lg font-semibold mt-1">
              {market ? `₹${(market.marketCap / 1e12).toFixed(2)}T` : "—"}
            </p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 sm:p-4">
            <p className="text-xs text-gray-500">Watchlist 24h (avg)</p>
            <p
              className={`text-base sm:text-lg font-semibold mt-1 ${
                avgChange === null
                  ? "text-gray-500"
                  : avgChange >= 0
                  ? "text-green-500"
                  : "text-red-500"
              }`}
            >
              {avgChange === null
                ? "—"
                : `${avgChange >= 0 ? "▲" : "▼"} ${Math.abs(avgChange).toFixed(2)}%`}
            </p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 sm:p-4">
            <p className="text-xs text-gray-500">BTC Dominance</p>
            <p className="text-base sm:text-lg font-semibold mt-1">
              {market ? `${market.btcDominance.toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {coins.map((coin) => {
            const isPositive = (coin.change24h ?? 0) >= 0;
            return (
              <div
                key={coin.symbol}
                className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 transition-all duration-300 hover:border-neutral-700 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/40"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img
                      src={coin.icon}
                      alt={coin.name}
                      width={24}
                      height={24}
                      loading="lazy"
                      className="w-6 h-6"
                    />
                    <h2 className="text-lg font-semibold">{coin.name}</h2>
                  </div>
                  <span className="text-gray-500 text-sm">{coin.symbol}</span>
                </div>

                {coin.price !== null ? (
                  <p className="text-2xl font-bold mt-4">
                    ₹{coin.price.toLocaleString("en-IN")}
                  </p>
                ) : (
                  <p className="text-base text-gray-500 mt-4">Price unavailable</p>
                )}

                {coin.change24h !== null && (
                  <p
                    className={`mt-1 text-sm font-medium ${
                      isPositive ? "text-green-500" : "text-red-500"
                    }`}
                  >
                    {isPositive ? "▲" : "▼"} {Math.abs(coin.change24h).toFixed(2)}%
                  </p>
                )}

                <div className="mt-3 border-t border-neutral-800 pt-3">
                  <Sparkline data={coin.spark} />
                  <p className="text-[10px] font-semibold tracking-wider text-purple-400 mb-1">
                    ✦ VESTRA AI
                  </p>
                  <p className="text-gray-400 text-sm">{coin.commentary}</p>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="mt-16 pt-6 border-t border-neutral-900 text-center text-xs text-gray-600 space-y-1">
          <p>AI commentary is informational only and not financial advice.</p>
          <p>
            Powered by CoinGecko & Gemini/Groq AI · Built by Umang, with AI-assisted development.
          </p>
        </footer>
      </div>
    </main>
  );
}