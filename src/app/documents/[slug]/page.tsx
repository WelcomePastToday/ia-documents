import MetricsBar from '@/components/MetricsBar';
import { notFound } from 'next/navigation';
import { useState } from 'react';
import { syncMetricsToGoogleDoc } from '@/actions/google-doc';

// Mapping of Slugs to Google Doc IDs
const DOC_MAP: Record<string, string> = {
  'EOT2024': '1234567890-SAMPLE-DOC-ID', // user should replace this
  'EOT2020': 'SAMPLE-ID-2020',
};

async function fetchDocHtml(docId: string): Promise<string> {
  // Real implementation:
  // const res = await fetch(`https://docs.google.com/document/d/${docId}/export?format=html`);
  // return res.text();

  return `
    <div class="doc-content">
      <p style="font-size: 0.9rem; color: #666; margin-bottom: 2rem;">
        Current Link is: <a href="https://docs.google.com/document/d/1tLfxxIVc1vhmXujxFp91NWqGZPowPHThlAAvPpDHj0c/edit?tab=t.0" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">Google Doc</a>
      </p>
      
      <h1 style="margin-bottom: 2rem;">End of Term Archive 2024/25 - By The Numbers</h1>

      <section style="margin-bottom: 2rem;">
        <h3>1. Partnership</h3>
        <p>The 2024-2025 End Of Term web crawl was a collaboration of nine partner organizations: Archive Team, Common Crawl Foundation (CCF), Environmental Data & Governance Initiative (EDGI), infoDOCKET / Gary Price, Library Innovation Lab (LIL) at Harvard Law School, Stanford University Libraries (SUL), University of North Texas Libraries (UNT), Webrecorder, Internet Archive (IA)</p>
      </section>

      <section style="margin-bottom: 2rem;">
        <h3>2. Crawl Partners</h3>
        <p>There were six crawl partners: Library Innovation Lab (LIL) at Harvard Law School, Stanford University Libraries (SUL), University of North Texas Libraries (UNT), Webrecorder, Archive Team, Common Crawl Foundation (CCF), Internet Archive (IA)</p>
      </section>

      <section style="margin-bottom: 2rem;">
        <h3>3. Data Volume</h3>
        <p>During the transition period, from September 2024 to April 2025, the EOT team archived more than <strong>{{metric:eot_data_size_pb}} petabytes</strong> of compressed web data.</p>
      </section>

      <section style="margin-bottom: 2rem;">
        <h3>4. Webpages Offline vs Online</h3>
        <p>Out of <strong>{{metric:eot_webpages_total}}</strong> webpages archived, more than 50% are offline.</p>
        <ul style="list-style-type: disc; margin-left: 1.5rem; margin-top: 0.5rem;">
          <li><strong>{{metric:eot_webpages_archived}}</strong> total webpages in EOT 2024 index</li>
          <li><strong>{{metric:eot_webpages_offline_count}}</strong> ({{metric:eot_webpages_offline_pct}}%) are offline</li>
          <li><strong>{{metric:eot_webpages_online_count}}</strong> ({{metric:eot_webpages_online_pct}}%) are online</li>
        </ul>
        <div style="margin-top: 1rem; font-size: 0.95rem; background: #f9fafb; padding: 0.75rem; border-radius: 4px;">
            <p style="margin:0;"><strong>Examples:</strong></p>
            <p style="margin:0;">Search: <a href="https://web.archive.org/collection-search/EndOfTerm2024WebCrawls/congress%20is_dead:true" target="_blank" rel="noopener noreferrer" style="color: #2563eb;">Congress Offline</a></p>
            <p style="margin:0;">Search: <a href="https://web.archive.org/collection-search/EndOfTerm2024WebCrawls/congress%20is_dead:false" target="_blank" rel="noopener noreferrer" style="color: #2563eb;">Congress Online</a></p>
        </div>
      </section>

      <section style="margin-bottom: 2rem;">
        <h3>5. YouTube Channels & Videos</h3>
        <p>Government websites linked to more than 1,000 government run YouTube channels. Collectively these accounts have uploaded more than <strong>{{metric:eot_youtube_videos_total}}</strong> videos. Out of these videos, ~1% (17k) have been taken offline.</p>
        <ul style="list-style-type: disc; margin-left: 1.5rem; margin-top: 0.5rem;">
          <li><strong>{{metric:eot_youtube_videos_archived}}</strong> videos archived</li>
          <li><strong>{{metric:eot_youtube_videos_offline_count}}</strong> ({{metric:eot_youtube_videos_offline_pct}}%) are offline</li>
          <li><strong>{{metric:eot_youtube_videos_online_count}}</strong> ({{metric:eot_youtube_videos_online_pct}}%)</li>
        </ul>
      </section>

      <section style="margin-bottom: 2rem;">
        <h3>6. Search Index</h3>
        <p>A full-text search index has been built from the End of Term 2024 collection, it is publicly available for the public to use: <a href="https://web.archive.org/collection-search/EndOfTerm2024WebCrawls/" style="color: #2563eb; word-break: break-all;">web.archive.org/collection-search/EndOfTerm2024WebCrawls/</a></p>
      </section>

      <section style="margin-bottom: 2rem;">
        <h3>7. Nominations</h3>
        <p>EOT received <strong>{{metric:eot_nomination_seeds}}</strong> individual seed nominations from <strong>{{metric:eot_nominators_count}}</strong> individuals. <a href="https://digital2.library.unt.edu/nomination/eth2024/" style="color: #2563eb;">digital2.library.unt.edu/nomination/eth2024/</a></p>
      </section>

      <section style="margin-bottom: 2rem;">
        <h3>8. Bulk Seeds</h3>
        <p>EOT received ~<strong>{{metric:eot_bulk_lists_count}}</strong> bulk seed lists, totaling ~<strong>{{metric:eot_bulk_urls_count}} million</strong> nominated seed URLs. <a href="https://github.com/end-of-term/eot2024/tree/main/seed-lists" style="color: #2563eb;">github.com/end-of-term/eot2024/tree/main/seed-lists</a></p>
      </section>

      <section style="margin-bottom: 2rem;">
        <h3>9. Capture Tools</h3>
        <p>High-fidelity browser-based capture tools (via Webrecorder’s Browsertrix), ensure that even complex, interactive websites are preserved.</p>
      </section>

      <section style="margin-bottom: 2rem;">
        <h3>10. Impact & Citations</h3>
        <p>Close to 1,000 articles rely on, or reference, our work related to the End of Term Archive project.</p>
        <p><strong>{{metric:eot_articles_count}}</strong> articles published since the EOT web crawl 2024-2025 are linking to the Internet Archive and are either highly likely (<strong>{{metric:eot_articles_highly_likely}}</strong> articles) or likely (<strong>{{metric:eot_articles_likely}}</strong> articles) to be using EOT data or otherwise WayBack Machine archived U.S. government content.</p>
        <p>See News Stories tab “EOT-Check” for the full list of articles and links.</p>
      </section>

      <section style="margin-bottom: 2rem;">
        <h3>11. Government Domains</h3>
        <p><strong>QTY of Gov (.gov, .mil, + misc) domains</strong><br/><span style="color:#666; font-size: 0.9em;">As of 2025-11-24</span></p>
        <p><strong>{{metric:eot_gov_domains_total}}</strong> Government Domains (365 misc + 3695 .gov + 199 .mil)</p>
        <p><strong>{{metric:eot_gov_hosts_total}}</strong> Government Hosts (2730 misc + 38656 .gov + 3417 .mil)</p>
      </section>

      <section style="margin-bottom: 2rem;">
        <h3>12. File Types</h3>
        <p><strong>WIP</strong>: QTY of file types from Gov domains</p>
      </section>
    </div>
  `;
}

function processDocHtml(html: string): string {
  // 1. Extract body content key parts (Google Docs export is full HTML)
  // For the mock, it returns full HTML.
  // We want to strip the styles or prefix them to avoid conflicts, 
  // but the user asked for "clean layout", so we might strip Google's CSS and apply ours.
  // For now, I'll return the body inner HTML (simplified).

  // 2. Replace markers
  const pattern = /{{metric:([a-zA-Z0-9_]+)}}/g;
  const processed = html.replace(pattern, (match, id) => {
    return `<span data-metric-id="${id}" class="metric-pending">...</span>`;
  });

  return processed;
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function DocumentPage({ params }: PageProps) {
  const { slug } = await params;
  const docId = DOC_MAP[slug];

  if (!docId) {
    // In a real app, maybe try to fetch metadata or 404
    // For this demo, let's allow 'test'
    if (slug !== 'test') {
      // return notFound(); // Commented out to allow viewing 'EOT2024' even with fake map
    }
  }

  const rawHtml = await fetchDocHtml(docId || 'default');
  const contentHtml = processDocHtml(rawHtml);

  /* 
     NOTE: We are using a client-side toggle for demonstration. 
     In a real app, this might be a URL search param (?view=source). 
  */
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
                src={`https://docs.google.com/document/d/1tLfxxIVc1vhmXujxFp91NWqGZPowPHThlAAvPpDHj0c/preview`}
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
