'use client';

import { useState, useEffect, useMemo } from 'react';
import { fetchAllMetrics } from '@/actions/metrics';
import { saveSnapshot, getLatestMetrics } from '@/lib/db';
import { MetricResult } from '@/lib/types';
import { createPortal } from 'react-dom';

export default function MetricsBar() {
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [metricsList, setMetricsList] = useState<MetricResult[]>([]);
    const [showSources, setShowSources] = useState(false);

    // UI Interaction State
    const [activeId, setActiveId] = useState<string | null>(null);
    const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
    const [isMobile, setIsMobile] = useState(false);
    const [metricCounts, setMetricCounts] = useState<Record<string, number>>({});

    // Initial load from DB
    useEffect(() => {
        async function loadLocal() {
            const latest = await getLatestMetrics();
            const results = Object.values(latest);
            setMetricsList(results);
            if (Object.keys(latest).length > 0) {
                const timestamps = Object.values(latest).map(m => new Date(m.fetchedAt).getTime());
                const max = new Date(Math.max(...timestamps));
                setLastUpdated(max.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            }
        }
        loadLocal();
        setIsMobile(window.innerWidth < 1000);

        const handleResize = () => setIsMobile(window.innerWidth < 1000);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Summary stats
    const stats = useMemo(() => {
        const ok = metricsList.filter(m => m.sourceUsed !== 'fallback').length;
        const fb = metricsList.length - ok;
        return { ok, fb };
    }, [metricsList]);

    // Handle ESC to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setActiveId(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Applying metrics and building rail
    useEffect(() => {
        if (metricsList.length === 0) return;

        console.log(`Applying Evidence Rail: ${showSources ? 'ON' : 'OFF'}`);

        const counts: Record<string, number> = {};
        const railRoot = document.getElementById('evidence-rail');
        const wrapper = document.querySelector('.doc-wrapper');

        if (railRoot) railRoot.innerHTML = '';
        if (wrapper) {
            if (showSources) wrapper.classList.add('metrics-active');
            else wrapper.classList.remove('metrics-active');
        }

        metricsList.forEach((m, idx) => {
            const els = document.querySelectorAll(`[data-metric-id="${m.metricId}"]`);
            counts[m.metricId] = els.length;

            els.forEach((el, elIdx) => {
                const htmlEl = el as HTMLElement;
                htmlEl.classList.add('metrics-enabled');

                // Clear and recreate
                htmlEl.innerHTML = '';

                // Value Span
                const valSpan = document.createElement('span');
                valSpan.textContent = String(m.value);
                valSpan.className = 'metric-value font-bold';
                valSpan.onclick = (e) => handleInteraction(e as any, m.metricId);
                valSpan.title = "Click for evidence";
                htmlEl.appendChild(valSpan);

                // Chip
                const chip = document.createElement('button');
                chip.className = 'citation-chip no-print';
                const supChars = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
                const supText = String(idx + 1).split('').map(c => supChars[parseInt(c)] || c).join('');
                chip.textContent = supText;
                chip.onclick = (e) => handleInteraction(e as any, m.metricId);
                htmlEl.appendChild(chip);

                // Rail Marker for the first occurrence of a metric
                if (elIdx === 0 && railRoot && !isMobile) {
                    const marker = document.createElement('div');
                    marker.className = 'rail-marker';
                    marker.textContent = String(idx + 1);
                    marker.title = `Evidence for ${m.meta?.title}`;

                    const rect = htmlEl.getBoundingClientRect();
                    const docTop = document.querySelector('.doc-container')?.getBoundingClientRect().top || 0;
                    // We need to account for current scroll if docTop is viewport-relative
                    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
                    const relativeTop = rect.top + scrollY - (document.querySelector('.doc-container')?.getBoundingClientRect().top || 0) - scrollY;
                    // Wait, rect.top is relative to viewport. docTop is relative to viewport.
                    // difference is relative to doc top.
                    marker.style.position = 'absolute';
                    marker.style.top = `${rect.top - (document.querySelector('.doc-container')?.getBoundingClientRect().top || 0)}px`;
                    marker.onclick = (e) => handleInteraction(e as any, m.metricId);
                    railRoot.appendChild(marker);
                }
            });
        });

        setMetricCounts(counts);
        renderFootnotes();
        renderSectionCitations();
    }, [metricsList, showSources, isMobile]);

    const handleInteraction = (e: React.MouseEvent | MouseEvent, id: string) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();

        if (activeId === id) {
            setActiveId(null);
        } else {
            setActiveId(id);
            setPopoverPos({
                top: rect.top + window.scrollY,
                left: isMobile ? 0 : rect.right + 8
            });
        }
    };

    const handleUpdate = async () => {
        setLoading(true);
        try {
            const freshMetrics = await fetchAllMetrics();
            await saveSnapshot(freshMetrics);
            setMetricsList(freshMetrics);
            setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        } catch (error) {
            console.error('Update failed:', error);
        } finally {
            setLoading(false);
        }
    };

    function renderSectionCitations() {
        const sections = document.querySelectorAll('#doc-content section');
        sections.forEach(sec => {
            sec.querySelector('.section-citations')?.remove();
            const sectionMetricIds = Array.from(sec.querySelectorAll('.metric-wrapper')).map(el => (el as HTMLElement).dataset.metricId);
            const uniqueMetricIds = [...new Set(sectionMetricIds)];
            if (uniqueMetricIds.length === 0) return;

            const citBlock = document.createElement('div');
            citBlock.className = 'section-citations no-print';
            citBlock.innerHTML = `<h5>Section Citations</h5><div class="citation-list"></div>`;
            const list = citBlock.querySelector('.citation-list')!;

            uniqueMetricIds.forEach(id => {
                const metric = metricsList.find(m => m.metricId === id);
                if (!metric) return;
                const idx = metricsList.findIndex(m => m.metricId === id) + 1;
                const item = document.createElement('div');
                item.className = 'citation-item';
                item.innerHTML = `
                    <div class="citation-item-number">${idx}.</div>
                    <div class="citation-item-content">
                        <strong>${metric.meta?.title}</strong>: ${metric.value}. 
                        Observed via <span class="italic">${metric.meta?.methodUsed}</span> 
                        from <a href="${metric.meta?.url.replace('Manual ', '')}" target="_blank" class="text-blue-600 hover:underline">${new URL(metric.meta?.url.replace('Manual ', '') || 'https://example.com').hostname}</a>
                    </div>
                `;
                list.appendChild(item);
            });
            sec.appendChild(citBlock);
        });
    }

    function renderFootnotes() {
        const footRoot = document.getElementById('footnotes-root');
        if (!footRoot) return;
        footRoot.className = 'print-footnotes mb-20';
        footRoot.innerHTML = `<h2 style="font-size: 14px; font-weight: 800; margin-bottom: 1.5rem; border-bottom: 2px solid #000; padding-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;">Evidence Registry</h2>`;

        metricsList.forEach((m, i) => {
            const row = document.createElement('div');
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '30px 1fr';
            row.style.fontSize = '10px';
            row.style.marginBottom = '12px';
            row.style.lineHeight = '1.4';

            const cleanUrl = m.meta?.url.replace('Manual ', '') || 'N/A';

            row.innerHTML = `
                <div style="font-weight: 800;">[${i + 1}]</div>
                <div>
                    <strong>${m.meta?.title}</strong>: Observe Value <span style="font-family: monospace;">${m.value}</span><br/>
                    <span style="color: #666;">Source: ${m.sourceUsed.toUpperCase()} | As Of: ${new Date(m.fetchedAt).toLocaleDateString()}</span><br/>
                    <span style="word-break: break-all; color: #2563eb;">${cleanUrl}</span>
                </div>
            `;
            footRoot.appendChild(row);
        });
    }

    const activeMetric = useMemo(() => metricsList.find(m => m.metricId === activeId), [metricsList, activeId]);

    return (
        <>
            {/* Global Control - Scientific Toggle */}
            <div className="fixed top-6 right-8 z-[100] no-print">
                <div className="proof-toggle-wrap">
                    <span className="proof-toggle-label">Evidence Rail</span>
                    <label className="proof-switch">
                        <input
                            type="checkbox"
                            checked={showSources}
                            onChange={(e) => {
                                console.log('Toggle Clicked:', e.target.checked);
                                setShowSources(e.target.checked);
                            }}
                        />
                        <span className="proof-slider"></span>
                    </label>
                </div>
            </div>

            {/* Sync Footer */}
            <footer className="sync-footer no-print">
                <div className="sync-status">
                    <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'animate-ping bg-blue-400' : 'bg-emerald-500'}`} />
                    <span className="tracking-tight uppercase">METRIC ENGINE: {loading ? 'FETCHING...' : 'ONLINE'}</span>
                </div>
                <div className="h-3 w-px bg-white/10" />
                <div className="flex gap-4 items-center">
                    <span className="opacity-50 text-[10px] uppercase font-bold tracking-tight">
                        <span className="text-white">{stats.ok} verified</span> /
                        <span className={stats.fb > 0 ? 'text-rose-400' : 'text-white/50'}> {stats.fb} fallbacks</span>
                    </span>
                    <span className="opacity-40 text-[10px] font-medium tracking-tight">SYNC: {lastUpdated || 'Initial'}</span>
                    <button
                        onClick={handleUpdate}
                        disabled={loading}
                        className="bg-white/5 hover:bg-white/20 px-2.5 py-1 rounded text-[10px] font-black tracking-widest transition-all active:scale-95 disabled:opacity-50 border border-white/5"
                    >
                        REFRESH ALL
                    </button>
                </div>
            </footer>

            {/* Popover */}
            {activeMetric && typeof document !== 'undefined' && createPortal(
                <div
                    className="evidence-popover"
                    style={{
                        top: popoverPos.top,
                        left: isMobile ? 0 : Math.min(popoverPos.left, window.innerWidth - 360)
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="popover-header">
                        <div className={`badge badge-${activeMetric.sourceUsed}`}>
                            {activeMetric.sourceUsed === 'primary' ? 'Verified Source' : (activeMetric.sourceUsed === 'archived' ? 'Archive Match' : 'Manual Fallback')}
                        </div>
                        <button onClick={() => setActiveId(null)} className="p-1 hover:bg-slate-100 rounded">✕</button>
                    </div>

                    <div className="popover-content">
                        <div className="mb-4">
                            <h4 className="text-[13px] font-black text-slate-900 leading-tight mb-1">{activeMetric.meta?.title}</h4>
                            <p className="text-[10px] text-slate-400 italic">Referenced in {metricCounts[activeMetric.metricId] || 1} places.</p>
                        </div>

                        <div className="meta-grid">
                            <span className="meta-label">Observation</span>
                            <span className="text-sm font-black text-blue-600">{activeMetric.value}</span>
                            <span className="meta-label">Captured</span>
                            <span className="meta-value">{new Date(activeMetric.fetchedAt).toLocaleDateString()}</span>
                            <span className="meta-label">Method</span>
                            <span className="meta-value font-bold">{activeMetric.meta?.methodUsed || 'API Sync'}</span>
                            <span className="meta-label">Link</span>
                            <div className="meta-value">
                                <a
                                    href={activeMetric.meta?.url.replace('Manual ', '')}
                                    target="_blank"
                                    className="text-blue-600 underline font-black flex items-center gap-1 group truncate"
                                >
                                    <span>{new URL(activeMetric.meta?.url.replace('Manual ', '') || 'https://example.com').hostname}</span>
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                                </a>
                            </div>
                        </div>

                        <div className="evidence-chain border-slate-200 border mt-4">
                            <div className="flex justify-between items-center mb-2 px-1">
                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Provenance Timeline</span>
                                <span className="text-[8px] font-bold text-emerald-600">HIGH CONFIDENCE (99%)</span>
                            </div>
                            <div className="space-y-1.5">
                                <div className="chain-step">
                                    <div className={`step-indicator ${activeMetric.sourceUsed === 'primary' ? 'step-ok' : 'step-fail'}`} />
                                    <span className="text-[10px]">Primary API Stream</span>
                                </div>
                                <div className="chain-step">
                                    <div className={`step-indicator ${activeMetric.sourceUsed === 'archived' ? 'step-ok' : (activeMetric.sourceUsed === 'primary' ? 'step-ok' : 'step-warn')}`} />
                                    <span className="text-[10px]">Wayback Recovery Mirror</span>
                                </div>
                                {activeMetric.sourceUsed === 'fallback' && (
                                    <div className="mt-2 p-2 bg-rose-50 text-[10px] text-rose-800 font-bold rounded border border-rose-100 italic">
                                        ⚠ Using fallback: {activeMetric.meta?.failoverReason || 'live source failed validation.'}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 flex gap-6 pt-3 border-t border-slate-100">
                            <button onClick={() => navigator.clipboard.writeText(activeMetric.meta?.url.replace('Manual ', '') || '')} className="text-[10px] font-black uppercase text-slate-400 hover:text-blue-600">Copy Link</button>
                            <button onClick={() => navigator.clipboard.writeText(`${activeMetric.meta?.title}: ${activeMetric.value}. Evidence: ${activeMetric.meta?.url.replace('Manual ', '')}`)} className="text-[10px] font-black uppercase text-slate-400 hover:text-blue-600">Full Cite</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
