type Coin = {
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  commentary: string;
  icon: string;
};

const coinList = [
  { id: "bitcoin", name: "Bitcoin", symbol: "BTC", icon: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png" },
  { id: "ethereum", name: "Ethereum", symbol: "ETH", icon: "https://assets.coingecko.com/coins/images/279/large/ethereum.png" },
  { id: "solana", name: "Solana", symbol: "SOL", icon: "https://assets.coingecko.com/coins/images/4128/large/solana.png" },
  { id: "binancecoin", name: "BNB", symbol: "BNB", icon: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png" },
  { id: "ripple", name: "XRP", symbol: "XRP", icon: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png" },
  { id: "dogecoin", name: "Dogecoin", symbol: "DOGE", icon: "https://assets.coingecko.com/coins/images/5/large/dogecoin.png" },
];

async function callGemini(prompt: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        next: { revalidate: 900 },
        signal: controller.signal,
      }
    );
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No text in Gemini response");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function callGroq(prompt: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
            model: "openai/gpt-oss-20b",
            messages: [{ role: "user", content: prompt }],
    }),
    next: { revalidate: 900 },
  });
    const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("No text in Groq response");
  return text;
}

async function getAllCommentary(coins: { name: string; price: number; change24h: number }[]) {
  const coinDescriptions = coins
    .map((c) => `${c.name}: ₹${c.price}, ${c.change24h}% change in 24h`)
    .join("\n");

  const prompt = `For each of these 6 cryptocurrencies, write one short, casual sentence (under 20 words) speculating why it might be moving today. Write it like you're texting a friend who knows nothing about crypto — no jargon like "capital rotation," "DeFi volume," "consolidation," or technical trading terms. Keep it simple and fun. Don't repeat exact numbers back. Respond ONLY with a JSON array of 6 strings, in the same order as listed, no markdown, no extra text.\n\n${coinDescriptions}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await callGemini(prompt);
      const cleaned = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleaned) as string[];
        } catch (err) {
      console.warn(`Gemini attempt ${attempt + 1} failed:`, err);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
    }
  }

  try {
    console.log("Falling back to Groq...");
    const text = await callGroq(prompt);
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as string[];
  } catch (err) {
    console.error("Groq fallback also failed:", err);
  }

  return coins.map(() => "Commentary unavailable.");
}

async function getCoins(): Promise<Coin[]> {
  const ids = coinList.map((c) => c.id).join(",");
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=inr&include_24hr_change=true`,
    { next: { revalidate: 60 } }
  );
  const data = await res.json();

  const coinsWithBasics = coinList.map((coin) => ({
    name: coin.name,
    symbol: coin.symbol,
    price: data[coin.id]?.inr ?? 0,
    change24h: data[coin.id]?.inr_24h_change ?? 0,
    icon: coin.icon,
  }));

  const commentaries = await getAllCommentary(coinsWithBasics);

  return coinsWithBasics.map((coin, i) => ({
    ...coin,
    commentary: commentaries[i] ?? "Commentary unavailable.",
  }));
}

export default async function Home() {
  const coins = await getCoins();
    const lastUpdated = new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
          <main className="min-h-screen bg-gradient-to-b from-black via-neutral-950 to-black text-white px-6 py-16">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <img src="/Vestra_header_Logo.png" alt="Vestra" className="h-20 w-auto" />
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-xs text-gray-400">Live · Updated {lastUpdated}</span>
          </div>
        </div>

        <p className="text-gray-400 mt-2 mb-12">
          Live crypto rates with AI-powered insights
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {coins.map((coin) => {
            const isPositive = coin.change24h >= 0;
            return (
              <div
                key={coin.symbol}
                className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 transition-all duration-300 hover:border-neutral-700 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/40"              >
                  <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={coin.icon} alt={coin.name} className="w-6 h-6" />
                    <h2 className="text-lg font-semibold">{coin.name}</h2>
                  </div>
                  <span className="text-gray-500 text-sm">{coin.symbol}</span>
                </div>

                <p className="text-2xl font-bold mt-4">
                  ₹{coin.price.toLocaleString("en-IN")}
                </p>

                <p
                  className={`mt-1 text-sm font-medium ${
                    isPositive ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {isPositive ? "▲" : "▼"} {Math.abs(coin.change24h).toFixed(2)}%
                </p>

                                <div className="mt-3 border-t border-neutral-800 pt-3">
                  <p className="text-[10px] font-semibold tracking-wider text-purple-400 mb-1">
                    ✦ VESTRA AI
                  </p>
                  <p className="text-gray-400 text-sm">{coin.commentary}</p>
                </div>
              </div>
            );
          })}
               </div>

        <footer className="mt-16 pt-6 border-t border-neutral-900 text-center text-xs text-gray-600">
          Powered by CoinGecko & Gemini/Groq AI · Built by Umang, With Ai assited Development
        </footer>
      </div>
    </main>
  );
}