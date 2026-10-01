export default function Loading() {
  const placeholders = Array.from({ length: 6 });

  return (
    <main className="min-h-screen bg-black text-white px-6 py-12">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold">Cointell</h1>
        <p className="text-gray-400 mt-2 mb-10">
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