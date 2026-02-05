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
            const sectionMetricIds = Array.from(sec.querySelectorAll('[data-metric-id]')).map(el => (el as HTMLElement).dataset.metricId);
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

                let displaySource = 'Source';
                const cleanUrl = metric.meta?.url.replace('Manual ', '') || '';
                try {
                    if (cleanUrl.startsWith('http')) {
                        displaySource = new URL(cleanUrl).hostname;
                    } else {
                        displaySource = cleanUrl || 'Reference';
                    }
                } catch (e) {
                    displaySource = cleanUrl || 'Reference';
                }

                const item = document.createElement('div');
                item.className = 'citation-item';
                item.innerHTML = `
                    <div class="citation-item-number">${idx}.</div>
                    <div class="citation-item-content">
                        <strong>${metric.meta?.title}</strong>: ${metric.value}. 
                        Observed via <span class="italic">${metric.meta?.methodUsed}</span> 
                        from <a href="${cleanUrl}" target="_blank" class="text-blue-600 hover:underline">${displaySource}</a>
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
            {/* Inline Controls - Bottom of Document Flow */}
            <div className="doc-controls-container no-print">
                <div className="proof-toggle-wrap">
                    <span className="proof-toggle-label">Sources</span>
                    <label className="proof-switch">
                        <input
                            type="checkbox"
                            checked={showSources}
                            onChange={(e) => setShowSources(e.target.checked)}
                        />
                        <span className="proof-slider"></span>
                    </label>
                </div>

                <div className="sync-footer-inline">
                    <div className="sync-status">
                        <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'animate-ping bg-blue-400' : 'bg-emerald-500'}`} />
                        <span className="tracking-tight uppercase">METRIC ENGINE: {loading ? 'FETCHING...' : 'ONLINE'}</span>
                    </div>
                    <div className="h-3 w-px bg-slate-200" />
                    <div className="flex gap-4 items-center">
                        <span className="text-slate-400 text-[10px] uppercase font-bold tracking-tight">
                            <span className="text-slate-600">{stats.ok} verified</span> /
                            <span className={stats.fb > 0 ? 'text-rose-600' : 'text-slate-400'}> {stats.fb} fallback</span>
                        </span>
                        <span className="text-slate-300 text-[10px] font-medium tracking-tight">SYNC: {lastUpdated || 'Initial'}</span>
                        <button
                            onClick={handleUpdate}
                            disabled={loading}
                            className="bg-slate-50 hover:bg-slate-100 text-slate-500 px-2.5 py-1 rounded text-[10px] font-black tracking-widest transition-all active:scale-95 disabled:opacity-50 border border-slate-200"
                        >
                            REFRESH ALL
                        </button>
                    </div>
                </div>
            </div>

            {/* Data-Forward Evidence Popover */}
            {activeMetric && typeof document !== 'undefined' && createPortal(
                <div
                    className="evidence-popover"
                    style={{
                        top: popoverPos.top,
                        left: isMobile ? 0 : Math.min(popoverPos.left, window.innerWidth - 340)
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="popover-header">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <span className={`badge badge-${activeMetric.sourceUsed}`}>
                                {activeMetric.sourceUsed === 'primary' ? 'Verified' : (activeMetric.sourceUsed === 'archived' ? 'Archived' : 'Manual')}
                            </span>
                            <span className="popover-title" title={activeMetric.meta?.title}>{activeMetric.meta?.title}</span>
                        </div>
                        <button onClick={() => setActiveId(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                    </div>

                    <div className="popover-body">
                        {/* 1. Data Grid */}
                        <div className="data-grid">
                            <div>
                                <div className="data-label">Observation</div>
                                <div className="data-value font-bold text-base">{activeMetric.value}</div>
                            </div>
                            <div>
                                <div className="data-label">Status</div>
                                <div className="data-value flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full ${activeMetric.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                    <span>{activeMetric.status.toUpperCase()}</span>
                                </div>
                            </div>
                            <div>
                                <div className="data-label">Captured</div>
                                <div className="data-value">{new Date(activeMetric.fetchedAt).toLocaleDateString()}</div>
                            </div>
                            <div>
                                <div className="data-label">Method</div>
                                <div className="data-value mono">{activeMetric.meta?.methodUsed || 'API Sync'}</div>
                            </div>
                        </div>

                        {/* 2. Evidence Link */}
                        <div className="evidence-section">
                            <div className="data-label mb-1">Evidence Source</div>
                            <div className="link-row">
                                <a
                                    href={activeMetric.meta?.url.replace('Manual ', '') || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="evidence-link group"
                                >
                                    <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                                    <span className="truncate">
                                        {(() => {
                                            try {
                                                const url = activeMetric.meta?.url.replace('Manual ', '');
                                                return url && url.startsWith('http') ? new URL(url).hostname : 'Reference Source';
                                            } catch { return 'Reference Source'; }
                                        })()}
                                    </span>
                                </a>
                                <a href={activeMetric.meta?.url.replace('Manual ', '') || '#'} target="_blank" className="link-action hover:text-blue-600">
                                    OPEN <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                                </a>
                            </div>
                        </div>

                        {/* 3. Provenance Chain */}
                        <div className="provenance-section">
                            <div className="data-label mb-2">Verification Chain</div>
                            <div className="chain-list">
                                <div className="chain-item">
                                    <div className={`chain-indicator ${activeMetric.sourceUsed === 'primary' ? 'active' : 'failed'}`} />
                                    <div className="chain-content">
                                        <div className="chain-title">Primary API Stream</div>
                                        <div className="chain-meta">Live check against source API</div>
                                    </div>
                                </div>
                                <div className="chain-item">
                                    <div className={`chain-indicator ${activeMetric.sourceUsed === 'archived' ? 'active' : (activeMetric.sourceUsed === 'primary' ? 'active' : 'warn')}`} />
                                    <div className="chain-content">
                                        <div className="chain-title">Wayback Recovery Mirror</div>
                                        <div className="chain-meta">Internet Archive snapshot lookup</div>
                                    </div>
                                </div>
                                {activeMetric.sourceUsed === 'fallback' && (
                                    <div className="chain-item">
                                        <div className="chain-indicator failed" />
                                        <div className="chain-content">
                                            <div className="chain-title text-rose-700">Fallback Activated</div>
                                            <div className="fail-note">
                                                Reason: {activeMetric.meta?.failoverReason || 'Validation failed or connection timeout.'}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 4. Actions Footer */}
                        <div className="popover-footer">
                            <span className="ref-count">Ref in {metricCounts[activeMetric.metricId] || 1} places</span>
                            <div className="action-cluster">
                                <button className="mini-btn" onClick={() => navigator.clipboard.writeText(activeMetric.value?.toString() || '')}>Copy Value</button>
                                <button className="mini-btn" onClick={() => navigator.clipboard.writeText(activeMetric.meta?.url.replace('Manual ', '') || '')}>Copy Link</button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
