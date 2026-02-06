#!/bin/bash
# Discovery script to test IA internal access tools

echo "=== 1. Checking Environment Variables (Filtered) ==="
env | grep -E 'IA_|WAYBACK|CDX|PETA|CLUSTER' || echo "No obvious IA env vars found."

echo -e "\n=== 2. Checking Standard IA Tools ==="
for tool in cdx-tool wayback-tool ia petabox-tool hadoop hdfs; do
    if command -v $tool &> /dev/null; then
        echo "[FOUND] $tool is available at $(which $tool)"
        $tool --version 2>/dev/null || echo "  (Version check not standard for $tool)"
    else
        echo "[MISSING] $tool"
    fi
done

echo -e "\n=== 3. Testing Direct CDX Access (Local Cluster) ==="
# Often internal CDX is at a different endpoint or via CLI
# Try localhost standard ports
timeout 2 curl -I http://localhost:8080/cdx 2>/dev/null && echo "Local CDX Service found on 8080" || echo "No CDX on localhost:8080"

echo -e "\n=== 4. Testing Petabox / HDFS Access ==="
# Check if we can list a sample directory
if command -v hadoop &> /dev/null; then
    echo "Attempting to list root HDFS..."
    hadoop fs -ls / 2>/dev/null | head -n 3 || echo "HDFS list failed"
fi

echo -e "\n=== 5. Testing 'ia' CLI tool config ==="
if command -v ia &> /dev/null; then
    ia configure --print 2>/dev/null || echo "'ia' tool not authenticated or configured."
fi
