#!/usr/bin/env python3
"""
Advanced Resistance Analysis Report (V2)

Parses resistance_summary.csv (with metadata) and produces an actionable
triage report for Internet Archive leadership.

Key Features:
- Quality Flags (sample size, partial data, redirect loops, etc.)
- Three Ranked Lists (Highest Block Share, Highest Block Volume, Composite Score)
- Automated Diagnostics per domain
- Monthly Trend Analysis with Change Points
"""

import csv
import sys
import os
import math

SUMMARY_FILE = 'resistance_summary.csv'
MONTHLY_FILE = 'resistance_monthly.csv'

def safe_float(val, default=0.0):
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

def safe_int(val, default=0):
    try:
        return int(val)
    except (ValueError, TypeError):
        return default

def calculate_flags(row):
    """
    Compute boolean quality flags for a domain row.
    """
    total = safe_int(row.get('total_captures', 0))
    c2xx = safe_int(row.get('count_2xx', 0))
    c3xx = safe_int(row.get('count_3xx', 0))
    c4xx = safe_int(row.get('count_4xx', 0))
    c403 = safe_int(row.get('count_403', 0))
    c404 = safe_int(row.get('count_404', 0))
    c5xx = safe_int(row.get('count_5xx', 0))
    share_4xx = safe_float(row.get('share_4xx', 0.0))
    
    # Check scan metadata if available
    stopped_reason = row.get('stopped_reason', 'completed')
    is_partial = stopped_reason not in ['completed', 'early_stop_stable_block'] # stable block is "complete enough" for triage
    
    flags = []
    
    # 1. Sample Size
    if total < 500: flags.append("tiny_sample")
    elif total < 5000: flags.append("small_sample")
    
    # 2. No Success
    if c2xx == 0 and total >= 20:
        flags.append("no_success")
        
    # 3. Redirect Only (Canonicalization?)
    if total > 0 and c2xx == 0 and (c3xx / total) > 0.90:
        flags.append("redirect_dominant")
        
    # 4. Block Dominant
    if total >= 5000 and (c403 / total) >= 0.10:
        flags.append("block_dominant")
        
    # 5. Not Found Dominant
    if total >= 5000 and (c404 / total) >= 0.20:
        flags.append("not_found_dominant")
        
    # 6. Mixed Failure
    if share_4xx >= 0.20 and c2xx >= 1000 and (c403/total < 0.9):
        flags.append("mixed_failure")
        
    # 7. Quality / Instability
    if is_partial:
        flags.append(f"partial_data({stopped_reason})")
        
    if c5xx > 0 and total > 0:
        if (c5xx / total) > 0.02:
            flags.append("unstable_5xx")

    return flags

def get_diagnosis(row, flags):
    """
    Generate a 1-line human-readable diagnosis string.
    """
    total = safe_int(row.get('total_captures', 0))
    c403 = safe_int(row.get('count_403', 0))
    c404 = safe_int(row.get('count_404', 0))
    c3xx = safe_int(row.get('count_3xx', 0))
    
    if "no_success" in flags and "redirect_dominant" in flags:
        return "Mostly redirects; likely moved/canonicalization issue."
    
    if "block_dominant" in flags:
        share = c403 / total if total else 0
        return f"Hard blocking signal ({share:.1%} 403s)."
        
    if "not_found_dominant" in flags:
        return "High churn/404s; likely content removal, not blocking."
        
    if "unstable_5xx" in flags:
        return "Endpoint instability / server errors."
        
    if "partial_data" in str(flags):
        return "Partial scan; confidence lower."
        
    if total < 500:
        return "Insufficient data for diagnosis."
        
    return "Standard behavior / Mixed."

def calculate_resistance_score(row, flags):
    """
    Composite score = (0.6 * share_403) + (0.3 * share_4xx) + (0.1 * share_5xx)
    * log10(total)
    * penalties for partial data
    """
    total = safe_int(row.get('total_captures', 0))
    if total < 10: return 0.0
    
    share_403 = safe_int(row.get('count_403', 0)) / total
    share_4xx = safe_float(row.get('share_4xx', 0))
    share_5xx = safe_int(row.get('count_5xx', 0)) / total
    
    base_score = (0.6 * share_403) + (0.3 * share_4xx) + (0.1 * share_5xx)
    
    # Scale by volume (log10)
    vol_scale = math.log10(total)
    score = base_score * vol_scale
    
    # Penalize low confidence
    if "partial_data" in str(flags):
        score *= 0.75
    if "tiny_sample" in flags:
        score *= 0.50
        
    return score

def main():
    if not os.path.exists(SUMMARY_FILE):
        print(f"Error: {SUMMARY_FILE} not found.")
        sys.exit(1)
        
    rows = []
    with open(SUMMARY_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
            
    print(f"Loaded {len(rows)} domains.")
    
    processed_rows = []
    for r in rows:
        flags = calculate_flags(r)
        score = calculate_resistance_score(r, flags)
        diag = get_diagnosis(r, flags)
        
        # Enriched dict
        r['flags'] = flags
        r['diagnosis'] = diag
        r['resistance_score'] = score
        processed_rows.append(r)

    # --- LIST A: High Block Share (Actionable & Meaningful) ---
    print("\n" + "="*80)
    print(" LIST A: TOP BLOCKING DOMAINS (By % 403, Vol > 5k, Complete)")
    print("="*80)
    print(f"{'Domain':<30} | {'Total':<8} | {'403%':<6} | {'Flags':<30} | {'Diagnosis'}")
    print("-" * 110)
    
    def filter_a(r):
        t = safe_int(r['total_captures'])
        flags = r['flags']
        is_partial = any("partial_data" in f for f in flags)
        return t >= 5000 and not is_partial

    list_a = [r for r in processed_rows if filter_a(r)]
    # Sort by 403 share descending
    list_a.sort(key=lambda x: safe_int(x['count_403'])/safe_int(x['total_captures']), reverse=True)
    
    for r in list_a[:20]:
        t = safe_int(r['total_captures'])
        share_403 = safe_int(r['count_403']) / t
        flags_str = ",".join([f for f in r['flags'] if "sample" not in f]) # condensed
        print(f"{r['domain']:<30} | {t:<8} | {share_403:.1%} | {flags_str:<30} | {r['diagnosis']}")


    # --- LIST B: High Absolute Volume (Impact) ---
    print("\n" + "="*80)
    print(" LIST B: HIGHEST IMPACT BLOCKING (By 403 Count, Vol > 50k)")
    print("="*80)
    print(f"{'Domain':<30} | {'Total':<8} | {'403 Count':<10} | {'403%':<6} | {'Diagnosis'}")
    print("-" * 110)
    
    def filter_b(r):
        return safe_int(r['total_captures']) >= 50000

    list_b = [r for r in processed_rows if filter_b(r)]
    list_b.sort(key=lambda x: safe_int(x['count_403']), reverse=True)
    
    for r in list_b[:20]:
        t = safe_int(r['total_captures'])
        c403 = safe_int(r['count_403'])
        share = c403 / t
        print(f"{r['domain']:<30} | {t:<8} | {c403:<10} | {share:.1%} | {r['diagnosis']}")


    # --- LIST C: Composite Resistance Score ---
    print("\n" + "="*80)
    print(" LIST C: OVERALL RESISTANCE SCORE (Weighted)")
    print("="*80)
    list_c = sorted(processed_rows, key=lambda x: x['resistance_score'], reverse=True)
    
    for r in list_c[:20]:
        score = r['resistance_score']
        t = safe_int(r['total_captures'])
        print(f"{r['domain']:<30} | Score: {score:.2f} | Vol: {t} | {r['diagnosis']}")


    # --- APPENDIX: Small Anomalies ---
    print("\n" + "="*80)
    print(" APPENDIX: SMALL ANOMALIES (High % but < 500 captures)")
    print("="*80)
    anomalies = [r for r in processed_rows if safe_int(r['total_captures']) < 500 and (safe_int(r['count_403'])/max(1,safe_int(r['total_captures'])) > 0.50)]
    anomalies.sort(key=lambda x: safe_int(x['count_403']), reverse=True)
    
    for r in anomalies[:10]:
        t = safe_int(r['total_captures'])
        c403 = safe_int(r['count_403'])
        print(f"{r['domain']:<30} | {t} caps | {c403} blocked | High % but tiny volume.")


    # --- DATA CAVEATS ---
    print("\n" + "="*80)
    print(" DATA CAVEATS")
    print("="*80)
    print("1. CDX 'matchType=domain' scans are ordered by URL-key, NOT time.")
    print("2. 'Partial Data' flagged domains hit time/page limits; metrics may be biased.")
    print("3. Fast scans (if used) are triage only. Deep scans required for certainty.")
    print("4. Upload-day rollups (addeddate) differ from capture-day data.")

if __name__ == "__main__":
    main()
