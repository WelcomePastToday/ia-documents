#!/usr/bin/env python3
"""
Analyze Resistance Results

Reads the CSV outputs from measure_resistance.py and generates a readable report
highlighting the top resisting federal domains, distinguishing between blocks (403),
missing content (404), and errors.
"""

import csv
import sys
import os

SUMMARY_FILE = 'resistance_summary.csv'
MONTHLY_FILE = 'resistance_monthly.csv'

def main():
    if not os.path.exists(SUMMARY_FILE):
        print(f"Error: {SUMMARY_FILE} not found. Run measure_resistance.py first.")
        sys.exit(1)

    print("Loading data...")
    
    # Load Summary
    domains = []
    with open(SUMMARY_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Convert numeric fields
            for k in ['count_4xx', 'count_2xx', 'count_3xx', 'total_captures', 'count_403', 'count_404', 'count_5xx']:
                row[k] = int(row.get(k, 0))
            row['share_4xx'] = float(row.get('share_4xx', 0))
            domains.append(row)
            
    # Filter
    filtered = [d for d in domains if d['total_captures'] > 5]
    
    # Sort by Share 403 Descending (Most "Active" Resistance), then Share 4xx
    filtered.sort(key=lambda x: (float(x['count_403'])/x['total_captures'] if x['total_captures']>0 else 0, x['share_4xx']), reverse=True)
    
    print(f"\n=== Top 20 Domains by Hard Block (403) Share (Min 5 captures) ===")
    print(f"{'Rank':<5} {'Domain':<30} {'Block% (403)':<14} {'4xx%':<8} {'2xx':<6} {'3xx':<6} {'403':<6} {'404':<6}")
    print("-" * 100)
    
    top_domains = filtered[:20]
    for i, d in enumerate(top_domains, 1):
        share_403 = 0.0
        if d['total_captures'] > 0:
            share_403 = d['count_403'] / d['total_captures']
            
        print(f"{i:<5} {d['domain']:<30} {share_403:.2%}          {d['share_4xx']:.2%}    {d['count_2xx']:<6} {d['count_3xx']:<6} {d['count_403']:<6} {d['count_404']:<6}")
        
    print("\n\n=== Top Domains by Absolute 403 Volume ===")
    by_403_vol = sorted(domains, key=lambda x: x['count_403'], reverse=True)
    print(f"{'Rank':<5} {'Domain':<30} {'403 Count':<10} {'Total Caps':<10} {'Block%':<10}")
    print("-" * 75)
    for i, d in enumerate(by_403_vol[:10], 1):
         share = 0
         if d['total_captures'] > 0:
             share = d['count_403'] / d['total_captures']
         print(f"{i:<5} {d['domain']:<30} {d['count_403']:<10} {d['total_captures']:<10} {share:.2%}")

    if os.path.exists(MONTHLY_FILE):
        print("\n\n=== Monthly Trends for Top 5 Resisters (Block Rate) ===")
        monthly_data = {} 
        with open(MONTHLY_FILE, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                d = row['domain']
                if d not in monthly_data:
                    monthly_data[d] = []
                monthly_data[d].append(row)
        
        for d_obj in top_domains[:5]:
            d = d_obj['domain']
            print(f"\nDomain: {d}")
            m_rows = monthly_data.get(d, [])
            m_rows.sort(key=lambda x: x['month'])
            # Print header for monthly table
            print(f"  {'Month':<8}   {'2xx':<6} {'3xx':<6} {'4xx':<6} {'403':<6}   {'Block%':<8}")
            for m in m_rows:
                total = int(m['total_month'])
                c2xx = m.get('count_2xx', '0')
                c3xx = m.get('count_3xx', '0')
                c4xx = m.get('count_4xx', '0')
                c403 = int(m.get('count_403', '0'))
                
                block_rate = 0.0
                if total > 0:
                    block_rate = c403 / total
                
                print(f"  {m['month']:<8} : {c2xx:<6} {c3xx:<6} {c4xx:<6} {c403:<6}   {block_rate:.1%}")
                
if __name__ == "__main__":
    main()
