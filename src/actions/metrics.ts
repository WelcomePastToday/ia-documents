'use server';

import { getAllMetrics, getMetricDefinition } from '@/lib/registry';
import { MetricDefinition, MetricResult, MetricSource } from '@/lib/types';
import crypto from 'crypto';
import * as cheerio from 'cheerio';

export async function fetchAllMetrics(): Promise<MetricResult[]> {
    const metrics = await getAllMetrics();
    // Use Promise.all with some controlled concurrency if needed.
    // For now, simpler map.
    const results = await Promise.all(metrics.map(executeMetric));
    return results;
}

export async function fetchMetricById(id: string): Promise<MetricResult | null> {
    const metric = await getMetricDefinition(id);
    if (!metric) return null;
    return executeMetric(metric);
}

async function executeMetric(metric: MetricDefinition): Promise<MetricResult> {
    let failoverReason: string | undefined;

    // 1. Try Primary
    try {
        const primaryResult = await fetchSource(metric.source.primary);
        if (primaryResult !== null && primaryResult !== undefined) {
            const result = formatResult(metric, primaryResult, 'primary');
            if (validateValue(result.value, metric)) {
                return result;
            }
            failoverReason = `Primary validation failed: ${String(result.value).substring(0, 30)}`;
        }
    } catch (e: any) {
        failoverReason = `Primary source failed: ${e.message}`;
    }

    // 2. Try Archived
    if (metric.source.archived) {
        try {
            const archivedResult = await fetchSource(metric.source.archived);
            if (archivedResult !== null && archivedResult !== undefined) {
                const result = formatResult(metric, archivedResult, 'archived');
                if (validateValue(result.value, metric)) {
                    return {
                        ...result,
                        meta: { ...result.meta!, failoverReason }
                    };
                }
                failoverReason = `${failoverReason ? failoverReason + ' | ' : ''}Archived validation failed`;
            }
        } catch (e: any) {
            failoverReason = `${failoverReason ? failoverReason + ' | ' : ''}Archived source failed: ${e.message}`;
        }
    }

    // 3. Fallback
    const fallbackUrl = metric.source.primary?.url
        ? `Manual ${metric.source.primary.url}`
        : (metric.source.archived?.url ? `Manual ${metric.source.archived.url}` : 'Manual Verification / Estimate');

    return {
        metricId: metric.id,
        value: metric.source.fallback.value,
        rawRequestHash: 'fallback',
        sourceUsed: 'fallback',
        fetchedAt: metric.source.fallback.as_of,
        status: 'stale',
        meta: {
            title: metric.title,
            description: metric.description,
            url: fallbackUrl,
            methodUsed: 'fallback',
            failoverReason
        }
    };
}

/**
 * Validates that the metric value is sane and not leaked HTML or empty junk.
 */
function validateValue(value: any, definition: MetricDefinition): boolean {
    const strVal = String(value).toLowerCase();

    // 1. Leakage detection (HTML Tags)
    if (strVal.includes('<!doctype') || strVal.includes('<html') || strVal.includes('<body') || strVal.includes('<div')) {
        return false;
    }

    // 2. Type specific validation
    if (definition.type === 'numeric') {
        // Should contain at least one digit
        const hasDigit = /[0-9]/.test(strVal);
        if (!hasDigit) return false;

        // Numeric values shouldn't be hundreds of characters long (usually indicates a failed parse dump)
        if (strVal.length > 100) return false;
    }

    // 3. Length sanity check
    if (strVal.length === 0) return false;

    return true;
}

async function fetchSource(source: MetricSource): Promise<any> {
    const response = await fetch(source.url, {
        method: source.method || 'GET',
        headers: source.headers,
        body: source.body,
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const text = await response.text();

    // Parse based on format
    let data;
    if (source.format === 'json') {
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error('Failed to parse JSON response');
        }
    } else {
        data = text; // text/html/xml
    }

    // Apply Selector
    if (source.selector) {
        return applySelector(data, source.selector, source.format);
    }

    return data;
}


function applySelector(data: any, selector: string, format: string): any {
    if (format === 'json') {
        const parts = selector.split('.');
        let current = data;
        // Special case: if selector is "response.docs" and we want the array, just return it.
        // Logic: standard property access.
        for (const part of parts) {
            if (part.includes('[') && part.includes(']')) {
                const [key, indexStr] = part.split('[');
                const index = parseInt(indexStr.replace(']', ''), 10);
                if (current && key in current && Array.isArray(current[key])) {
                    current = current[key][index];
                } else {
                    if (key === '' && Array.isArray(current)) {
                        current = current[index];
                    } else {
                        throw new Error(`Selector array access ${part} failed`);
                    }
                }
            } else {
                if (current && typeof current === 'object' && part in current) {
                    current = current[part];
                } else {
                    return undefined; // Graceful fail
                }
            }
        }
        return current;
    } else if (format === 'html') {
        const $ = cheerio.load(data);
        const parts = selector.split('|').map(s => s.trim());
        const css = parts[0];
        const cmd = parts[1] || 'text';

        const els = $(css);
        if (els.length === 0) {
            return null;
        }

        let result;
        if (cmd === 'text') {
            result = els.text().trim();
        } else if (cmd === 'html') {
            result = els.html();
        } else if (cmd.startsWith('attr:')) {
            const attrName = cmd.split(':')[1];
            result = els.attr(attrName);
        } else {
            result = els.text().trim();
        }
        return result;
    }
    return data;
}

function formatResult(metric: MetricDefinition, rawValue: any, source: 'primary' | 'archived'): MetricResult {
    let value = rawValue;

    // Normalization
    if (metric.normalization) {

        if (metric.normalization.language === 'javascript' && metric.normalization.function) {
            // SAFE ALTERNATIVE: Don't run arbitrary code.
            // Map specific known function keys to logic.
            // If the registry says "sum_size_pb", we run that logic.
            // We will NOT execute the raw string from YAML.

            // Heuristic check: does it look like the specific one we wrote?


            // Strategy: CSV Row Count
            if (metric.normalization.function === 'csv_row_count') {
                // Count newlines, subtract 1 for header if present
                // We assume standard CSV
                if (typeof value === 'string') {
                    const lines = value.trim().split('\n');
                    // If header exists (length > 0), subtract 1, else 0.
                    value = lines.length > 0 ? lines.length - 1 : 0;
                }
            }

            // Heuristic check: does it look like the regex count one?
            if (metric.normalization.function.indexOf('match') !== -1 && metric.normalization.function.indexOf('length') !== -1) {
                // Basic regex count support
                const regexMatch = metric.normalization.function.match(/\/([^/]+)\/g/);
                if (regexMatch) {
                    const re = new RegExp(regexMatch[1], 'g');
                    value = (String(value).match(re) || []).length;
                }
                // Support for summing two matches (Total Articles) - specific case
                if (metric.normalization.function.includes('Possible EOT Links') && metric.normalization.function.includes('EOT') && metric.normalization.function.includes('+')) {
                    value = (String(value).match(/EOT/g) || []).length;
                }
            }
        }
        // Regex support
        if ((metric.normalization as any).regex) {
            const re = new RegExp((metric.normalization as any).regex);
            const match = String(value).match(re);
            if (match && match[1]) {
                value = match[1];
            }
        }
    }

    // Cleanup
    if (typeof value === 'string') {
        value = value.trim();
    }

    const hash = crypto.createHash('sha256').update(String(rawValue)).digest('hex');

    return {
        metricId: metric.id,
        value: value,
        rawRequestHash: hash,
        sourceUsed: source,
        fetchedAt: new Date().toISOString(),
        status: 'success',
        meta: {
            title: metric.title,
            description: metric.description,
            // If fallback, clarify it's a manual value
            url: source === 'primary' ? metric.source.primary.url : (source === 'archived' && metric.source.archived ? metric.source.archived.url : 'Manual Verification / Estimate'),
            methodUsed: source
        }
    };
}

