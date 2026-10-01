export default function Loading() {
  const placeholders = Array.from({ length: 6 });

  return (
    <main className="relative min-h-screen bg-black text-white px-6 py-16 overflow-hidden">
      <div className="relative max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <img src="/Vestra_header_Logo.png" alt="Vestra" className="h-20 w-auto" />
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-xs text-gray-400">Loading…</span>
          </div>
        </div>

        <p className="text-gray-400 mt-2 mb-12">
          Live crypto rates with AI-powered insights
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {placeholders.map((_, i) => (
            <div
              key={i}
              className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="h-5 w-24 bg-neutral-800 rounded" />
                <div className="h-4 w-10 bg-neutral-800 rounded" />
              </div>
              <div className="h-7 w-32 bg-neutral-800 rounded mt-4" />
              <div className="h-4 w-16 bg-neutral-800 rounded mt-2" />
              <div className="h-10 w-full bg-neutral-800 rounded mt-3" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}