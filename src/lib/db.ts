import { openDB, DBSchema } from 'idb';
import { MetricResult } from './types';

interface MetricsDB extends DBSchema {
    snapshots: {
        key: string; // ISO timestamp
        value: {
            timestamp: string;
            results: MetricResult[];
        };
        indexes: { 'by-timestamp': string };
    };
    latest: {
        key: string; // metricId
        value: MetricResult;
    };
}

export async function initDB() {
    return openDB<MetricsDB>('ia-metrics-db', 1, {
        upgrade(db) {
            db.createObjectStore('snapshots', { keyPath: 'timestamp' });
            db.createObjectStore('latest', { keyPath: 'metricId' });
        },
    });
}

export async function saveSnapshot(results: MetricResult[]) {
    const db = await initDB();
    const tx = db.transaction(['snapshots', 'latest'], 'readwrite');

    const timestamp = new Date().toISOString();
    await tx.objectStore('snapshots').add({
        timestamp,
        results
    });

    for (const result of results) {
        await tx.objectStore('latest').put(result);
    }

    await tx.done;
}

export async function getLatestMetrics(): Promise<Record<string, MetricResult>> {
    const db = await initDB();
    const all = await db.getAll('latest');
    return all.reduce((acc, curr) => {
        acc[curr.metricId] = curr;
        return acc;
    }, {} as Record<string, MetricResult>);
}
