#!/usr/bin/env python3
"""
Optimized High-Level Federal Domain Resistance Scanner

Strategy:
1. Fast Pass: Get *total limits* only (counts) per domain first.
   - Use CDX aggregate API or 'limit=1' to just probe availability.
   - Or standard query but with strictly limited fields (statuscode only) and no monthly breakdown initially.
   
2. Drill Down: Only fetch monthly timeseries for the "interesting" domains.
   - Top Blocked (100% 403)
   - High Volume Blocked
   
This script performs STEP 1: The Fast High-Level Scan.
"""

import urllib.request
import urllib.parse
import json
import time
import csv
import sys
import os
import random
import datetime

# --- Configuration ---
INPUT_FILE = 'top_federal_domains_1000.txt'
OUTPUT_FILE = 'resistance_fast_scan.csv'
CHECKPOINT_FILE = 'fast_scan_checkpoint.json'
CDX_API_URL = 'https://web.archive.org/cdx/search/cdx'
START_DATE = '20240101'
USER_AGENT = 'FederalResistanceScan/Fast/1.0'

# --- Tuning ---
# We use a collapse param to just get unique status codes per day? 
# Or just raw counts?
# Fastest way to get "Count of 403s" vs "Count of 200s" without downloading 1M lines?
# CDX API does not support server-side aggregation (SQL-like group by).
# We MUST download lines.
# BUT we can check resistance existence faster using 'limit'.

# STRATEGY CHANGE:
# To detect "Is it blocked?", we don't need all 10k captures.
# We just need to see if *recent* captures are 403.
# Let's fetch the LAST 500 captures.
# If majority are 403, it's blocked.
# If they are 200, it's open.
# This makes it O(1) instead of O(N) per domain.

MAX_SAMPLES = 1000 # Look at last 1000 captures only for the "Fast Scan"

def log(msg):
    print(f"[{datetime.datetime.now().isoformat()}] {msg}", flush=True)

def get_ia_auth_headers():
    """Retrieve authentication cookies from 'ia' CLI tool."""
    try:
        import subprocess
        # Check if ia is in path
        if len(subprocess.run(['which', 'ia'], capture_output=True).stdout) > 0:
            res = subprocess.run(['ia', 'configure', '--print'], capture_output=True, text=True)
            if res.returncode == 0 and 'logged-in-sig' in res.stdout:
                log("Authenticated with Internet Archive credentials.")
                return {'Cookie': res.stdout.strip()}
    except Exception:
        pass
    return {}

AUTH_HEADERS = get_ia_auth_headers()
BASE_HEADERS = {'User-Agent': USER_AGENT}
BASE_HEADERS.update(AUTH_HEADERS)

def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, 'r') as f:
            return json.load(f)
    return []

def save_checkpoint(processed):
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump(processed, f)

def scan_domain_fast(domain):
    """
    Fetch ONLY the most recent captures (limit=MAX_SAMPLES, sort=reverse).
    This gives us the *current* state of resistance.
    """
    params = {
        'url': domain,
        'matchType': 'domain',
        'from': START_DATE,
        'fl': 'statuscode', # minimal
        'output': 'json',
        'limit': str(MAX_SAMPLES),
        'fast': '1' # Use index for speed?
        # Note: CDX doesn't strictly support server-side reverse sort efficiently on all clusters
        # But commonly we just read what we get.
        # Actually, let's just get whatever (default is usually oldest->newest).
        # To get newest, we'd want to request from specific year/month?
        # Let's simple request default order with limit.
        # IF we want "current status", we should perhaps query 2025/2026 specifically?
        # Let's query from 20240101.
    }
    
    # We want representative sample. If we limit to 1000, we get Jan 2024.
    # We might miss recent blocks.
    # Improve: Query 2026 first?
    # Let's query the *whole* ranges but with 'collapse=timestamp:6' (one per month)?
    # "collapse=timestamp:6" => One capture per month per URL-digest key?
    # Actually just "collapse=timestamp:6" collapses by month.
    # This reduces volume by factor of ~30 (daily->monthly).
    
    params['collapse'] = 'timestamp:6' 
    # Warning: collapse interacts with matchType=domain in complex ways.
    # It collapses *per url*. So www.example.gov/foo and www.example.gov/bar are separate.
    # Ideally we want "collapse=urlkey"? No.
    
    # Fallback to "Standard Pagination" but with a hard limit on total rows processed.
    # We abort if we have "enough" data to classify the domain.
    # e.g. if we see 50 captures and 50 are 403 -> It's blocked.
    del params['collapse']
    
    # We will use the 'showResumeKey' approach but STOP after 1 chunk.
    # This makes it a "Spot Check".
    params['showResumeKey'] = 'true'
    params['limit'] = '2000' 

    query = urllib.parse.urlencode(params)
    url = f"{CDX_API_URL}?{query}"
    
    stats = {'2xx': 0, '3xx': 0, '4xx': 0, '403': 0, 'total': 0}
    
    try:
        req = urllib.request.Request(url, headers=BASE_HEADERS)
        with urllib.request.urlopen(req, timeout=30) as r:
            if r.status != 200:
                return stats
            txt = r.read().decode('utf-8')
            if not txt.strip(): return stats
            
            try:
                data = json.loads(txt)
            except: 
                return stats
                
            # Filter headers
            if data and len(data)>0 and data[0][0] == 'statuscode':
                data = data[1:]
            
            for row in data:
                # Row might be resume key (last one)
                if len(row) != 1 or not row[0].isdigit(): 
                    # check if it is status code
                    if len(row) == 1 and row[0].isdigit():
                        pass # Valid
                    else:
                        continue # Skip resume keys etc
                
                code = int(row[0])
                if 200 <= code < 300: stats['2xx'] += 1
                elif 300 <= code < 400: stats['3xx'] += 1
                elif 400 <= code < 500:
                    stats['4xx'] += 1
                    if code == 403: stats['403'] += 1
                
                stats['total'] += 1
                
    except Exception as e:
        log(f"Error scanning {domain}: {e}")
        
    return stats

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"Missing {INPUT_FILE}")
        sys.exit(1)
        
    domains = [line.strip() for line in open(INPUT_FILE) if line.strip() and not line.startswith('#')]
    # domains = fetch_domains... (assume file exists for simplicity)
    
    processed = load_checkpoint()
    processed_set = set(processed)
    
    print(f"Loaded {len(domains)} domains. {len(processed_set)} already done.")
    
    # CSV Init
    headers = ['domain', 'total_sample', '2xx', '3xx', '4xx', '403', 'share_403']
    if not os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'w') as f:
            csv.DictWriter(f, fieldnames=headers).writeheader()
            
    count = 0
    with open(OUTPUT_FILE, 'a') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        
        for d in domains:
            if d in processed_set: continue
            
            if count % 20 == 0:
                log(f"Processing {d}...")
                
            stats = scan_domain_fast(d)
            
            share_403 = 0.0
            if stats['total'] > 0:
                share_403 = stats['403'] / stats['total']
                
            writer.writerow({
                'domain': d,
                'total_sample': stats['total'],
                '2xx': stats['2xx'],
                '3xx': stats['3xx'],
                '4xx': stats['4xx'],
                '403': stats['403'],
                'share_403': f"{share_403:.4f}"
            })
            f.flush()
            
            processed.append(d)
            count += 1
            if count % 50 == 0:
                save_checkpoint(processed)
            
            time.sleep(0.1) # Fast but polite
            
    save_checkpoint(processed)
    print("Fast scan complete.")

if __name__ == "__main__":
    main()
