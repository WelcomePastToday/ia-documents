'use client';

import { useState, useEffect, useMemo } from 'react';
import { fetchAllMetrics } from '@/actions/metrics';
import { saveSnapshot, getLatestMetrics } from '@/lib/db';
import { MetricResult } from '@/lib/types';

export default function MetricsBar() {
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [metricsList, setMetricsList] = useState<MetricResult[]>([]);
    const [showSources, setShowSources] = useState(false);
    const [activeCitation, setActiveCitation] = useState<string | null>(null);
    const [hoveredCitation, setHoveredCitation] = useState<string | null>(null);

    // Initial load from DB
    useEffect(() => {
        async function loadLocal() {
            const latest = await getLatestMetrics();
            const results = Object.values(latest);
            setMetricsList(results);
            if (Object.keys(latest).length > 0) {
                const timestamps = Object.values(latest).map(m => new Date(m.fetchedAt).getTime());
                const max = new Date(Math.max(...timestamps));
                setLastUpdated(max.toLocaleString());
            }
        }
        loadLocal();
    }, []);

    const citations = useMemo(() => {
        return metricsList.map((m, i) => ({
            ...m,
            index: i + 1
        }));
    }, [metricsList]);

    useEffect(() => {
        if (citations.length > 0) {
            updateDomWithCitations();
            renderMarginNotes();
            renderFootnotes();
        }
        return () => {
            if (!showSources) {
                document.querySelectorAll('.citation-chip').forEach(el => el.remove());
                document.querySelectorAll('.cited-claim').forEach(el => {
                    const htmlEl = el as HTMLElement;
                    htmlEl.classList.remove('cited-claim', 'highlight-active');
                    const valSpan = htmlEl.querySelector('span'); // The font-bold value
                    if (valSpan) {
                        // Keep the value but remove styling if needed? 
                        // Generally we want to keep the value, just hide the citation.
                    }
                });
                const marginRoot = document.getElementById('margin-notes');
                if (marginRoot) marginRoot.innerHTML = '';
                const footRoot = document.getElementById('footnotes-root');
                if (footRoot) footRoot.innerHTML = '';
            }
        };
    }, [citations, showSources, activeCitation, hoveredCitation]);

    const handleUpdate = async () => {
        setLoading(true);
        const metricEls = document.querySelectorAll('[data-metric-id]');
        metricEls.forEach(el => (el as HTMLElement).classList.add('animate-pulse', 'opacity-50'));

        try {
            const freshMetrics = await fetchAllMetrics();
            await saveSnapshot(freshMetrics);
            setMetricsList(freshMetrics);
            setLastUpdated(new Date().toISOString());
        } catch (error) {
            console.error('Failed to update metrics:', error);
            alert('Failed to update metrics. Check console.');
        } finally {
            setLoading(false);
            metricEls.forEach(el => (el as HTMLElement).classList.remove('animate-pulse', 'opacity-50'));
        }
    };

    function updateDomWithCitations() {
        citations.forEach(cit => {
            const els = document.querySelectorAll(`[data-metric-id="${cit.metricId}"]`);
            els.forEach(el => {
                const htmlEl = el as HTMLElement;

                // Set the value
                htmlEl.innerHTML = '';
                const valSpan = document.createElement('span');
                valSpan.textContent = String(cit.value);
                valSpan.className = 'val-text font-bold';
                htmlEl.appendChild(valSpan);

                if (showSources) {
                    htmlEl.classList.add('cited-claim');
                    if (hoveredCitation === cit.metricId || activeCitation === cit.metricId) {
                        htmlEl.classList.add('highlight-active');
                    } else {
                        htmlEl.classList.remove('highlight-active');
                    }

                    htmlEl.onmouseenter = () => setHoveredCitation(cit.metricId);
                    htmlEl.onmouseleave = () => setHoveredCitation(null);

                    const chip = document.createElement('button');
                    chip.className = `citation-chip no-print ${hoveredCitation && hoveredCitation !== cit.metricId ? 'dimmed' : ''}`;
                    // Special case for repeated numbers: superscripts like ¹
                    const supChars = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
                    const supText = String(cit.index).split('').map(c => supChars[parseInt(c)] || c).join('');
                    chip.textContent = supText;
                    chip.ariaLabel = `Citation ${cit.index} for ${cit.meta?.title || cit.metricId}`;
                    chip.tabIndex = 0;

                    chip.onmouseenter = () => setHoveredCitation(cit.metricId);
                    chip.onmouseleave = () => setHoveredCitation(null);
                    chip.onfocus = () => setHoveredCitation(cit.metricId);
                    chip.onblur = () => setHoveredCitation(null);

                    chip.onclick = (e) => {
                        e.stopPropagation();
                        const isCurrentlyActive = activeCitation === cit.metricId;
                        setActiveCitation(isCurrentlyActive ? null : cit.metricId);

                        if (!isCurrentlyActive) {
                            const card = document.getElementById(`cit-card-${cit.metricId}`);
                            if (card) {
                                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                card.classList.add('ring-4', 'ring-blue-400');
                                setTimeout(() => card.classList.remove('ring-4', 'ring-blue-400'), 1500);
                            }
                        }
                    };

                    htmlEl.appendChild(chip);
                }
            });
        });
    }

    function renderMarginNotes() {
        const marginRoot = document.getElementById('margin-notes');
        if (!marginRoot) return;
        marginRoot.innerHTML = '';
        if (!showSources) return;

        citations.forEach(cit => {
            const card = createCitationCard(cit);
            marginRoot.appendChild(card);
        });
    }

    function renderFootnotes() {
        const footRoot = document.getElementById('footnotes-root');
        if (!footRoot) return;
        footRoot.innerHTML = '';
        if (!showSources) return;

        const section = document.createElement('section');
        section.className = 'footnotes-section';
        section.innerHTML = `<h2>Sources & Evidence</h2>`;

        citations.forEach(cit => {
            const item = document.createElement('div');
            item.className = 'footnote-item';
            item.innerHTML = `
                <span class="footnote-number">${cit.index}.</span>
                <div class="footnote-content">
                    <strong>${cit.meta?.title}</strong> — ${cit.meta?.description}
                    <div class="text-[11px] text-gray-500 mt-1 uppercase tracking-wider">
                        ${cit.sourceUsed} | Observation: ${cit.value} | Captured: ${new Date(cit.fetchedAt).toLocaleDateString()}
                    </div>
                    <a href="${cit.meta?.url.replace('Manual ', '')}" target="_blank" class="text-blue-600 underline text-xs break-all">
                        ${cit.meta?.url.replace('Manual ', '')}
                    </a>
                </div>
            `;
            section.appendChild(item);
        });
        footRoot.appendChild(section);
    }

    function createCitationCard(cit: MetricResult & { index: number }) {
        const card = document.createElement('div');
        card.id = `cit-card-${cit.metricId}`;
        const isActive = activeCitation === cit.metricId;
        card.className = `citation-card source-${cit.sourceUsed} ${isActive ? 'active-mobile ring-2 ring-blue-500 scale-105' : ''} ${hoveredCitation && hoveredCitation !== cit.metricId ? 'opacity-40' : ''}`;

        const typeLabel = cit.sourceUsed === 'primary' ? 'Live API' : (cit.sourceUsed === 'archived' ? 'Archive' : 'Manual');
        const cleanUrl = cit.meta?.url.replace('Manual ', '') || '';

        const icons = {
            primary: '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>',
            archived: '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
            fallback: '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>'
        };
        const activeIcon = icons[cit.sourceUsed] || icons.fallback;

        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="source-label shadow-sm flex items-center gap-1">
                    ${activeIcon}
                    <span class="font-bold uppercase tracking-tight">${typeLabel}</span>
                </div>
                ${isActive ? '<button class="close-card text-gray-400 hover:text-black p-1">✕</button>' : ''}
            </div>
            <h4>${cit.index}. ${cit.meta?.title}</h4>
            <div class="meta-grid">
                <span class="meta-label">Observation</span>
                <span class="font-mono font-bold text-black">${cit.value}</span>
                <span class="meta-label">As Of</span>
                <span>${new Date(cit.fetchedAt).toLocaleDateString()}</span>
                <span class="meta-label">Method</span>
                <span class="truncate" title="${cit.meta?.methodUsed}">${cit.meta?.methodUsed || 'API Sync'}</span>
            </div>
            <div class="mt-4 pt-3 border-t border-gray-100 flex flex-col gap-2">
                <a href="${cleanUrl}" target="_blank" class="text-blue-600 font-bold flex items-center gap-1 hover:underline text-[12px] tracking-tight">
                    VIEW EVIDENCE
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                </a>
                <div class="flex gap-4">
                    <button class="copy-citation-btn text-[10px] font-bold text-gray-400 hover:text-black uppercase tracking-widest transition-colors">Copy Citation</button>
                    <button class="copy-url-btn text-[10px] font-bold text-gray-400 hover:text-black uppercase tracking-widest transition-colors">Copy URL</button>
                </div>
            </div>
        `;

        card.onmouseenter = () => setHoveredCitation(cit.metricId);
        card.onmouseleave = () => setHoveredCitation(null);
        card.onclick = (e) => {
            e.stopPropagation();
            setActiveCitation(cit.metricId);
        };

        const closeBtn = card.querySelector('.close-card');
        if (closeBtn) {
            (closeBtn as HTMLElement).onclick = (e) => {
                e.stopPropagation();
                setActiveCitation(null);
            };
        }

        const copyUrl = card.querySelector('.copy-url-btn');
        if (copyUrl) {
            (copyUrl as HTMLElement).onclick = (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(cleanUrl);
                (copyUrl as HTMLElement).textContent = 'Copied!';
                setTimeout(() => { (copyUrl as HTMLElement).textContent = 'Copy URL'; }, 2000);
            };
        }

        const copyCit = card.querySelector('.copy-citation-btn');
        if (copyCit) {
            (copyCit as HTMLElement).onclick = (e) => {
                e.stopPropagation();
                const text = `Metric: ${cit.meta?.title} (${cit.value}). Source: ${cleanUrl} (Accessed ${new Date(cit.fetchedAt).toLocaleDateString()})`;
                navigator.clipboard.writeText(text);
                (copyCit as HTMLElement).textContent = 'Copied!';
                setTimeout(() => { (copyCit as HTMLElement).textContent = 'Copy Citation'; }, 2000);
            };
        }

        return card;
    }

    return (
        <div className="metrics-bar no-print">
            <div className="flex items-center gap-4">
                <div className="flex flex-col">
                    <span className="text-sm font-black text-black tracking-tighter">GOVTOOLS ENGINE</span>
                    {lastUpdated && <span className="text-[9px] text-gray-400 uppercase font-black tracking-widest">Last Sync: {lastUpdated}</span>}
                </div>
            </div>

            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Citations</span>
                    <button
                        onClick={() => setShowSources(!showSources)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${showSources ? 'bg-blue-600' : 'bg-gray-200'}`}
                    >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showSources ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>

                <div className="h-6 w-px bg-gray-200" />

                <button
                    onClick={handleUpdate}
                    disabled={loading}
                    className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 transition-all active:scale-95 disabled:opacity-50"
                >
                    {loading ? (
                        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    )}
                    {loading ? 'Processing...' : 'Sync Live Data'}
                </button>
            </div>
        </div>
    );
}
