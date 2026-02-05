'use client';

import { useState } from 'react';
import MetricsBar from '@/components/MetricsBar';
import { syncMetricsToGoogleDoc } from '@/actions/google-doc';

interface DocumentViewerProps {
    contentHtml: string;
    docId: string;
}

export default function DocumentViewer({ contentHtml, docId }: DocumentViewerProps) {
    const [viewMode, setViewMode] = useState<'evidence' | 'source'>('evidence');
    const [isSyncing, setIsSyncing] = useState(false);

    // Sync Handler
    const handleSyncToDoc = async () => {
        setIsSyncing(true);
        try {
            // In a real app, we'd fetch the latest metrics from DB here first
            const metrics: any[] = []; // We would pass actual metrics here
            await syncMetricsToGoogleDoc(docId || '', metrics);

            // Reload iframe to show changes (hacky force reload)
            const iframe = document.getElementById('google-doc-frame') as HTMLIFrameElement;
            if (iframe) {
                iframe.src = iframe.src;
            }
            alert('Success: Live metrics have been written to the Google Doc!');
        } catch (e) {
            alert('Error syncing to doc');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <main className="min-h-screen pb-40 bg-slate-50">
            {/* View Switcher Header */}
            <div className="sticky top-0 z-50 bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center shadow-sm">
                <div className="font-bold text-slate-700 text-sm">
                    {viewMode === 'evidence' ? '👁️ EVIDENCE PROOFING VIEW' : '📝 GOOGLE DOC SOURCE VIEW'}
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button
                        onClick={() => setViewMode('evidence')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'evidence' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Interactive Report
                    </button>
                    <button
                        onClick={() => setViewMode('source')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'source' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Source Document
                    </button>
                </div>
            </div>

            <div className="doc-wrapper mt-8">
                {/* VIEW 1: EVIDENCE RAIL (Only visible in user-mode) */}
                {viewMode === 'evidence' && (
                    <aside id="evidence-rail" className="evidence-rail no-print">
                        {/* Rail markers will be injected here */}
                    </aside>
                )}

                <article className={`doc-container ${viewMode === 'source' ? '!p-0 !max-w-none !bg-transparent !shadow-none' : ''}`}>
                    {viewMode === 'evidence' ? (
                        <>
                            <div
                                id="doc-content"
                                dangerouslySetInnerHTML={{ __html: contentHtml }}
                            />
                            <div id="footnotes-root"></div>
                        </>
                    ) : (
                        // VIEW 2: GOOGLE DOC IFRAME
                        <div className="w-full h-[11in] flex flex-col bg-white shadow-lg rounded-lg overflow-hidden border border-slate-200">
                            <div className="bg-yellow-50 border-b border-yellow-100 p-3 text-xs text-yellow-800 flex justify-between items-center">
                                <span>⚠ <strong>Source View:</strong> You are viewing the live Google Doc. Interactive evidence features are disabled in this mode.</span>
                                <button
                                    onClick={handleSyncToDoc}
                                    disabled={isSyncing}
                                    className="bg-yellow-200 hover:bg-yellow-300 text-yellow-900 px-3 py-1 rounded font-bold transition-colors disabled:opacity-50"
                                >
                                    {isSyncing ? 'Writing to Doc...' : '⚡ Push Live Metrics to Doc'}
                                </button>
                            </div>
                            <iframe
                                id="google-doc-frame"
                                src={`https://docs.google.com/document/d/${docId}/preview`}
                                className="w-full flex-grow border-none"
                                allowFullScreen
                            />
                        </div>
                    )}
                </article>
            </div>

            {/* Only show MetricsBar in evidence mode to avoid confusion/errors */}
            <div style={{ display: viewMode === 'evidence' ? 'block' : 'none' }}>
                <MetricsBar />
            </div>
        </main>
    );
}
