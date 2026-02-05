import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <div className="max-w-2xl w-full bg-white p-8 rounded-xl shadow-lg">
        <h1 className="text-3xl font-bold mb-6 text-gray-900 border-b pb-4">Government Document Archives</h1>

        <div className="space-y-4">
          <p className="text-gray-600">
            Select a document collection to view the transparency report and live metrics.
          </p>

          <ul className="space-y-3 mt-6">
            <li>
              <Link href="/documents/EOT2024" className="block p-4 border rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors group">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-lg text-blue-700 group-hover:text-blue-800">End of Term 2024</span>
                  <span className="text-sm text-gray-500">Live Metrics</span>
                </div>
                <p className="text-gray-500 mt-1 text-sm">Web Archive indexing report and statistics.</p>
              </Link>
            </li>
            <li className="opacity-50 pointer-events-none">
              <div className="block p-4 border rounded-lg bg-gray-50">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-lg text-gray-400">End of Term 2020</span>
                  <span className="text-sm text-gray-400">Archived</span>
                </div>
                <p className="text-gray-400 mt-1 text-sm">Legacy data (Coming Soon)</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
