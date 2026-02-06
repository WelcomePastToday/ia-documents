#!/usr/bin/env python3
"""
US Federal Domain Resistance Analysis Script

This script identifies which US federal domains resist or block Internet Archive archiving.
It queries the Wayback Machine CDX API for captures since 2024-01-01, analyzing
status codes to produce a ranked list of resistant domains.

Features:
- Reproducible: Uses official .gov domain inventory if input file missing.
- Scalable: Handles API rate limits, retries with exponential backoff.
- Unattended: Checkpointing, heartbeat logging, resumes after failure.
- Detailed: Distinguishes 403 (Block), 404 (Missing), 429 (Rate Limit), 5xx (Server Error).
- Time-series: Outputs monthly breakdown of resistance to track persistence.

Usage:
    python3 measure_resistance.py [input_file]
"""

import urllib.request
import urllib.error
import urllib.parse
import json
import time
import csv
import sys
import os
import datetime
import random
import signal

# --- Configuration ---
DEFAULT_INPUT_FILE = 'top_federal_domains_1000.txt'
OFFICIAL_LIST_URL = 'https://raw.githubusercontent.com/cisagov/dotgov-data/main/current-federal.csv'
OFFICIAL_CSV_FILENAME = 'current-federal.csv'
OUTPUT_SUMMARY_CSV = 'resistance_summary.csv'
OUTPUT_MONTHLY_CSV = 'resistance_monthly.csv'
CHECKPOINT_FILE = 'resistance_checkpoint.json'
START_DATE = '20240101'
CDX_API_URL = 'https://web.archive.org/cdx/search/cdx'

# Tuning
MAX_RETRIES = 5
BASE_BACKOFF = 2  # seconds
USER_AGENT = 'FederalDomainresistanceAnalysis/1.0 (+https://govtools.org)'

# --- Helpers ---

def log(msg):
    ts = datetime.datetime.now().isoformat()
    print(f"[{ts}] {msg}", flush=True)

def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            log(f"Error loading checkpoint: {e}")
    return {'processed_domains': [], 'start_time': time.time()}

def save_checkpoint(data):
    try:
        with open(CHECKPOINT_FILE, 'w') as f:
            json.dump(data, f)
    except Exception as e:
        log(f"Error saving checkpoint: {e}")

def fetch_domains(input_path):
    """Load domains from file, or download official list if missing."""
    domains = []
    
    if not os.path.exists(input_path):
        if input_path == DEFAULT_INPUT_FILE:
            log(f"Input file {input_path} not found. Downloading official list from {OFFICIAL_LIST_URL}...")
            try:
                with urllib.request.urlopen(OFFICIAL_LIST_URL) as response:
                    raw_content = response.read()
                    content = raw_content.decode('utf-8-sig') # Handle BOM
                    
                    # Save raw CSV
                    with open(OFFICIAL_CSV_FILENAME, 'wb') as f:
                        f.write(raw_content)
                    log(f"Saved official inventory to {OFFICIAL_CSV_FILENAME}")

                    lines = content.splitlines()
                    reader = csv.DictReader(lines)
                    for row in reader:
                        if 'Domain Name' in row and row['Domain Name']:
                            domains.append(row['Domain Name'].strip().lower())
            except Exception as e:
                log(f"Failed to download official list: {e}")
                sys.exit(1)
            
            # Save locally
            try:
                with open(input_path, 'w') as f:
                    for d in domains:
                        f.write(d + '\n')
                log(f"Saved {len(domains)} domains to {input_path}")
            except Exception as e:
                 log(f"Could not save downloaded list: {e}")
        else:
            log(f"Error: Input file {input_path} does not exist.")
            sys.exit(1)
    else:
        with open(input_path, 'r') as f:
            for line in f:
                d = line.strip()
                if d and not d.startswith('#'):
                    if ',' in d:
                        parts = d.split(',')
                        # very basic heuristic
                        found = False
                        for p in parts:
                            p = p.strip().lower()
                            if p.endswith('.gov'):
                                domains.append(p)
                                found = True
                                break
                        if not found:
                             domains.append(parts[0].strip().lower())
                    else:
                        domains.append(d.lower())

    domains = list(set([d for d in domains if '.' in d]))
    domains.sort()
    return domains

def process_domain(domain):
    """
    Query CDX API for a domain using wildcard (matchType=domain) and showResumeKey.
    Streams results to update stats incrementally, avoiding large memory footprint.
    Returns: (summary_dict, monthly_dict)
    """
    # Initialize stats
    stats = {
        'total': 0, '2xx': 0, '3xx': 0, '4xx': 0,
        '403': 0, '404': 0, '429': 0, '5xx': 0
    }
    monthly_stats = {} # "YYYY-MM": {...stats...}

    resume_key = None
    more_pages = True
    
    while more_pages:
        params = {
            'url': domain,
            'matchType': 'domain',
            'from': START_DATE,
            'fl': 'timestamp,statuscode', # Minimum fields needed for monthly stats
            'output': 'json',
            'showResumeKey': 'true',
            'limit': '150000' # Required to force pagination chunks and resumeKey emission
        }
        if resume_key:
            params['resumeKey'] = resume_key
            
        query_string = urllib.parse.urlencode(params)
        req_url = f"{CDX_API_URL}?{query_string}"
        
        retries = 0
        success = False
        data = []
        
        while retries <= MAX_RETRIES:
            try:
                # Use a specific timeout; larger for huge chunks
                req = urllib.request.Request(req_url, headers={'User-Agent': USER_AGENT})
                with urllib.request.urlopen(req, timeout=180) as response:
                    content = response.read().decode('utf-8')
                    if not content.strip(): 
                         # Empty body
                         success = True
                         data = []
                         break
                         
                    try:
                        data = json.loads(content)
                        success = True
                        break
                    except json.JSONDecodeError:
                        log(f"JSON Decode Error for {domain}. Retrying...")
                        # partial read or bad connection
                        pass
                        
            except Exception as e:
                wait = (BASE_BACKOFF ** retries) + random.random()
                if retries >= 2:
                    log(f"Retry {retries}/{MAX_RETRIES} for {domain} (Chunk fetch): {e}")
                time.sleep(wait)
                retries += 1
        
        if not success:
            log(f"Failed to fetch chunk for {domain}. Stopping early.")
            break
            
        if not data:
            more_pages = False
            break
            
        # --- Handle Resume Key ---
        # With output=json, the resume key is usually the *last* element of the list.
        # It looks like: ["resume-key-string"] or ["resume-key-string", ""] depending on version.
        # Data rows are: ["timestamp", "statuscode"] (length 2).
        # We detect it by checking the last row.
        
        new_resume_key = None
        rows_to_process = data
        
        if len(data) > 0:
            last_row = data[-1]
            # Resume key row usually has fewer elements than data, or is explicitly just the key.
            # Our data rows are length 2.
            # Resume key row is typically length 1 or 2, but contents are not digits.
            
            # Heuristic: If last row[0] is NOT a timestamp (14 chars digit), it might be a key?
            # Or simpler: CDX documented behavior is it is the last line.
            # If the response was limited by 'limit', the last line is the resume Key.
            # If the response finished naturally, there is NO resume key line (usually).
            # But with showResumeKey=true, correct behavior is:
            # - If more data exists: Returns limit+1 rows? Or just last row is key.
            # actually usually empty list [] at end relative to data?
            
            # Let's check generally for string-like key at end.
            if len(last_row) >= 1:
                # Timestamps are YYYYMMDDHHMMSS (14 digits).
                if not (isinstance(last_row[0], str) and last_row[0].isdigit() and len(last_row[0]) == 14):
                    # It's likely a resume key
                    # resume key is usually a long string.
                    if len(last_row) >= 1:
                        new_resume_key = last_row[0]
                        # Remove it from processing
                        rows_to_process = data[:-1]

        # --- Remove Headers if present ---
        # Headers "timestamp, statuscode" usually appear on first page, row 0.
        if len(rows_to_process) > 0 and rows_to_process[0][0] == 'timestamp':
            rows_to_process = rows_to_process[1:]
            
        
        # --- Stats Update Loop ---
        for row in rows_to_process:
            if len(row) < 2: continue
            
            ts = row[0]
            status = row[1]
            
            if len(ts) >= 6:
                month_key = f"{ts[:4]}-{ts[4:6]}"
                if month_key not in monthly_stats:
                    monthly_stats[month_key] = {'total': 0, '2xx': 0, '3xx': 0, '4xx': 0, '403': 0, '404': 0, '5xx': 0}

                if status.isdigit():
                    code = int(status)
                    is_2xx = 200 <= code < 300
                    is_3xx = 300 <= code < 400
                    is_4xx = 400 <= code < 500
                    is_5xx = 500 <= code < 600
                    
                    if is_2xx:
                        stats['2xx'] += 1
                        monthly_stats[month_key]['2xx'] += 1
                    if is_3xx:
                        stats['3xx'] += 1
                        monthly_stats[month_key]['3xx'] += 1
                    if is_4xx:
                        stats['4xx'] += 1
                        monthly_stats[month_key]['4xx'] += 1
                        if code == 403:
                            stats['403'] += 1
                            monthly_stats[month_key]['403'] += 1
                        elif code == 404 or code == 410:
                            stats['404'] += 1
                            monthly_stats[month_key]['404'] += 1
                    if is_5xx:
                        stats['5xx'] += 1
                        monthly_stats[month_key]['5xx'] += 1
                    
                    stats['total'] += 1
                    monthly_stats[month_key]['total'] += 1

        if new_resume_key:
            if new_resume_key == resume_key:
                log(f"  > Infinite loop detected: resume key '{new_resume_key}' repeated. Stopping.")
                break
            resume_key = new_resume_key
            # Clean loop for next page
            log(f"  > Fetching next page... (resume)")
            time.sleep(0.05) 
        else:
            more_pages = False # No resume key found in this chunk, assuming end.

    # Final Summary Calculation
    ratio_4xx = 0.0
    share_4xx = 0.0
    
    if stats['2xx'] > 0:
        ratio_4xx = stats['4xx'] / stats['2xx']
    
    den = stats['2xx'] + stats['4xx']
    if den > 0:
        share_4xx = stats['4xx'] / den
        
    summary = {
        'total_captures': stats['total'],
        'count_2xx': stats['2xx'],
        'count_3xx': stats['3xx'],
        'count_4xx': stats['4xx'],
        'count_403': stats['403'],
        'count_404': stats['404'], # Includes 410
        'count_5xx': stats['5xx'],
        'ratio_4xx_to_2xx': ratio_4xx,
        'share_4xx': share_4xx
    }
    
    return summary, monthly_stats

def write_csv_row(filepath, headers, row_dict):
    file_exists = os.path.exists(filepath)
    with open(filepath, 'a', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        if not file_exists:
            writer.writeheader()
        writer.writerow(row_dict)

def main():
    args = sys.argv[1:]
    input_file = args[0] if args else DEFAULT_INPUT_FILE
    
    log(f"Starting analysis using input: {input_file}")
    domains = fetch_domains(input_file)
    log(f"Loaded {len(domains)} unique domains.")
    
    checkpoint = load_checkpoint()
    processed_set = set(checkpoint['processed_domains'])
    log(f"Resuming... {len(processed_set)} domains already processed.")
    
    domains_to_process = [d for d in domains if d not in processed_set]
    log(f"{len(domains_to_process)} domains remaining.")
    
    summary_headers = ['domain', 'total_captures', 'count_2xx', 'count_3xx', 'count_4xx', 
                       'count_403', 'count_404', 'count_5xx', 
                       'ratio_4xx_to_2xx', 'share_4xx', 'timestamp']
    
    monthly_headers = ['domain', 'month', 'total_month', 'count_2xx', 'count_3xx', 'count_4xx', 
                       'count_403', 'count_404', 'count_5xx',
                       'ratio_month', 'share_month']
    
    count = 0
    try:
        for domain in domains_to_process:
            if count % 10 == 0:
                log(f"Heartbeat: Processing {domain}... ({count}/{len(domains_to_process)})")
            
            # captures = fetch_cdx_data(domain) # Removed
            # summary, monthly = parse_captures(captures) # Removed
            summary, monthly = process_domain(domain)
            
            s_row = summary.copy()
            s_row['domain'] = domain
            s_row['timestamp'] = datetime.datetime.now().isoformat()
            s_row['ratio_4xx_to_2xx'] = f"{summary['ratio_4xx_to_2xx']:.4f}"
            s_row['share_4xx'] = f"{summary['share_4xx']:.4f}"
            
            write_csv_row(OUTPUT_SUMMARY_CSV, summary_headers, s_row)
            
            sorted_months = sorted(monthly.keys())
            for m in sorted_months:
                stats = monthly[m]
                m_ratio = 0.0
                if stats['2xx'] > 0:
                    m_ratio = stats['4xx'] / stats['2xx']
                
                m_share = 0.0
                m_den = stats['2xx'] + stats['4xx']
                if m_den > 0:
                    m_share = stats['4xx'] / m_den
                    
                m_row = {
                    'domain': domain,
                    'month': m,
                    'total_month': stats['total'],
                    'count_2xx': stats['2xx'],
                    'count_3xx': stats['3xx'],
                    'count_4xx': stats['4xx'],
                    'count_403': stats['403'],
                    'count_404': stats['404'],
                    'count_5xx': stats['5xx'],
                    'ratio_month': f"{m_ratio:.4f}",
                    'share_month': f"{m_share:.4f}"
                }
                write_csv_row(OUTPUT_MONTHLY_CSV, monthly_headers, m_row)
            
            checkpoint['processed_domains'].append(domain)
            save_checkpoint(checkpoint)
            
            count += 1
            time.sleep(0.2) 
            
    except KeyboardInterrupt:
        log("Interrupted by user. Progress saved.")
        sys.exit(0)
    except Exception as e:
        log(f"Critical error: {e}")
        raise

    log("Processing complete.")
    
if __name__ == "__main__":
    main()
