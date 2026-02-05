'use client';

import { useState, useEffect } from 'react';
import { fetchAllMetrics } from '@/actions/metrics';
import { saveSnapshot, getLatestMetrics } from '@/lib/db';
import { MetricResult } from '@/lib/types';

export default function MetricsBar() {
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [metricsList, setMetricsList] = useState<MetricResult[]>([]);
    const [showSources, setShowSources] = useState(false);

    // Initial load from DB
    useEffect(() => {
        async function loadLocal() {
            const latest = await getLatestMetrics();
            const results = Object.values(latest);
            setMetricsList(results);
            applyMetricsToDom(results);
            if (Object.keys(latest).length > 0) {
                // Find most recent fetchedAt
                const timestamps = Object.values(latest).map(m => new Date(m.fetchedAt).getTime());
                const max = new Date(Math.max(...timestamps));
                setLastUpdated(max.toLocaleString());
            }
        }
        loadLocal();
    }, []);

    // Re-apply metrics whenever list or showSources changes
    useEffect(() => {
        if (metricsList.length > 0) {
            applyMetricsToDom(metricsList);
        }
    }, [metricsList, showSources]);

    const handleUpdate = async () => {
        setLoading(true);
        // Add visual loading state to metric elements using DOM manipulation directly
        const metricEls = document.querySelectorAll('[data-metric-id]');
        metricEls.forEach(el => el.classList.add('animate-pulse', 'opacity-50'));

        try {
            const freshMetrics = await fetchAllMetrics();
            // Save snapshot
            await saveSnapshot(freshMetrics);

            // Update state
            setMetricsList(freshMetrics);
            setLastUpdated(new Date().toISOString());

            // DOM update happens via useEffect
        } catch (error) {
            console.error('Failed to update metrics:', error);
            alert('Failed to update metrics. Check console.');
        } finally {
            setLoading(false);
            // Remove visual loading state
            metricEls.forEach(el => el.classList.remove('animate-pulse', 'opacity-50'));
        }
    };

    function applyMetricsToDom(results: MetricResult[]) {
        // Look for markers {{metric:ID}}
        results.forEach(res => {
            const els = document.querySelectorAll(`[data-metric-id="${res.metricId}"]`);
            els.forEach(el => {
                // Clear content safely
                el.innerHTML = '';

                // 1. The Value
                const valSpan = document.createElement('span');
                valSpan.textContent = String(res.value);
                valSpan.className = 'metric-value font-bold';
                el.appendChild(valSpan);
                el.setAttribute('title', `Source: ${res.sourceUsed} | As of: ${res.fetchedAt}`);
                el.classList.add('updated-metric');
                el.classList.remove('metric-pending');

                // 2. The Inline Source (if showSources is true)
                if (showSources && res.meta) {
                    const sourceSup = document.createElement('sup');

                    // Style: Bright Red Badge style. 
                    // Use inline styles to guarantee visibility regardless of Tailwind purging.
                    sourceSup.style.backgroundColor = '#cc0000'; // Strong Red
                    sourceSup.style.color = '#ffffff'; // White text
                    sourceSup.style.padding = '0 4px';
                    sourceSup.style.borderRadius = '3px';
                    sourceSup.style.marginLeft = '4px';
                    sourceSup.style.fontSize = '10px';
                    sourceSup.style.fontWeight = 'bold';
                    sourceSup.style.cursor = 'pointer';
                    sourceSup.style.display = 'inline-block';
                    sourceSup.style.verticalAlign = 'top';
                    sourceSup.className = 'hover:opacity-80 shadow-sm print:hidden transition-all transform hover:scale-110 active:scale-95';
                    sourceSup.textContent = `[src]`;

                    // Detailed Tooltip explanation
                    const method = res.sourceUsed === 'primary' ? 'Live API' : (res.sourceUsed === 'archived' ? 'Archived Record' : 'Legacy Fallback / Manual');
                    const details = res.sourceUsed === 'fallback'
                        ? `Note: This value is a manual standard/estimate as live data was unavailable.`
                        : `This data was fetched live using ${res.meta.methodUsed || 'API'}.`;

                    sourceSup.title = `SOURCE TYPE: ${method}\n\nTitle: ${res.meta.title}\nDescription: ${res.meta.description}\n${details}\n\nURL: ${res.meta.url}`;

                    // On click, open URL
                    sourceSup.onclick = (e: any) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (res.meta?.url && res.meta.url.startsWith('http')) {
                            window.open(res.meta.url, '_blank');
                        } else {
                            alert(`Source: ${res.meta?.description}\n\n(This is a manual fallback value. No live URL available.)`);
                        }
                    };
                    el.appendChild(sourceSup);
                }
            });
        });
    }

    function handleDownload() {
        const data = {
            timestamp: new Date().toISOString(),
            source: 'ia-documents',
            results: metricsList
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `metric-snapshot-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    }

    return (
        <>
            <div className="metrics-bar no-print">
                <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-gray-700">EOT Metrics Engine</span>
                    {lastUpdated && <span className="text-xs text-gray-500">Updated: {lastUpdated}</span>}
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setShowSources(!showSources)}
                        className="text-sm text-gray-600 hover:text-gray-900 px-3 bg-transparent border-none cursor-pointer"
                    >
                        {showSources ? 'Hide Sources' : 'Show Sources'}
                    </button>

                    <button
                        onClick={handleDownload}
                        className="text-sm text-gray-600 hover:text-gray-900 px-3 bg-transparent border-none cursor-pointer"
                    >
                        Download JSON
                    </button>

                    <button
                        onClick={handleUpdate}
                        disabled={loading}
                        className="btn-primary flex items-center gap-2"
                    >
                        {loading ? 'Updating...' : 'Update Metrics'}
                    </button>
                </div>
            </div>

            {/* Sources Overlay */}
            {showSources && (
                <div className="fixed bottom-20 left-4 right-4 bg-white shadow-xl rounded-lg p-6 border z-50 max-h-96 overflow-y-auto no-print">
                    <h3 className="font-bold text-lg mb-4">Metric Sources</h3>
                    <div className="grid gap-4">
                        {metricsList.map((m) => (
                            <div key={m.metricId} className="border-b pb-2">
                                <div className="flex justify-between">
                                    <span className="font-semibold">{m.metricId}</span>
                                    <span className="text-sm text-gray-500">{m.fetchedAt}</span>
                                </div>
                                <div className="text-sm text-gray-600 mt-1">
                                    Value: <span className="font-mono bg-gray-100 px-1">{m.value}</span>
                                    <span className="mx-2">|</span>
                                    Source: <span className={`px-2 py-0.5 rounded text-xs ${m.sourceUsed === 'primary' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{m.sourceUsed}</span>
                                </div>
                            </div>
                        ))}
                        {metricsList.length === 0 && <p className="text-gray-500 italic">No metrics loaded.</p>}
                    </div>
                </div>
            )}
        </>
    );
}
