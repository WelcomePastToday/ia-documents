#!/usr/bin/env python3
"""
Select Targets for Drill-Down

Reads the 'resistance_fast_scan.csv' and selects a stratified sample of domains
for detailed monthly analysis, prioritizing 100% blocked, then 90%+, etc.
"""

import csv
import sys
import os

INPUT_FILE = 'resistance_fast_scan.csv'
OUTPUT_FILE = 'top_blocked_domains.txt'

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"Error: {INPUT_FILE} not found. Run fast_scan.py first!")
        sys.exit(1)
        
    domains = []
    with open(INPUT_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            row['share_403'] = float(row.get('share_403', 0))
            row['total_sample'] = int(row.get('total_sample', 0))
            domains.append(row)
            
    # Filter out insignificant (too few captures to decide)
    # e.g. at least 10 captures
    valid = [d for d in domains if d['total_sample'] >= 10]
    
    # Sort by block rate descending
    valid.sort(key=lambda x: x['share_403'], reverse=True)
    
    selected = []
    
    # Strategy: 
    # 1. Take top 20 with 100% block rate (share_403 >= 0.99)
    # 2. Take top 20 with > 50% block rate
    # 3. Take top 10 with any 403s
    # 4. Total limit ~ 100
    
    # 1. Absolute Blockers (>99%)
    blockers_100 = [d for d in valid if d['share_403'] >= 0.99]
    print(f"Found {len(blockers_100)} domains with >99% block rate.")
    selected.extend(blockers_100[:50]) # Take up to 50
    
    # 2. Heavy Blockers (50% - 99%)
    blockers_heavy = [d for d in valid if 0.50 <= d['share_403'] < 0.99]
    print(f"Found {len(blockers_heavy)} domains with 50-99% block rate.")
    selected.extend(blockers_heavy)
    
    # 3. Light Blockers (1% - 50%)
    blockers_light = [d for d in valid if 0.01 <= d['share_403'] < 0.50]
    print(f"Found {len(blockers_light)} domains with 1-50% block rate.")
    selected.extend(blockers_light)
    
    # Dedup and output
    # (Though logic above ensures disjoint sets)
    
    print(f"\nSelected {len(selected)} total domains for deep drill-down.")
    
    with open(OUTPUT_FILE, 'w') as f:
        for item in selected:
            f.write(f"{item['domain']}\n")
            
    print(f"Saved list to {OUTPUT_FILE}")
    print(f"Now run: python3 ia-documents/scripts/measure_resistance.py {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
