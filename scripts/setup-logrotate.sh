#!/usr/bin/env bash
# Setup pm2-logrotate for sap-mcp-remote and sap-mcp-facilitator
# Run on the VPS: bash setup-logrotate.sh

set -euo pipefail

echo "=== Installing pm2-logrotate module ==="
pm2 install pm2-logrotate || true

echo "=== Configuring pm2-logrotate global defaults ==="
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:workerInterval 30
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

echo "=== Restarting both processes to apply ==="
pm2 restart sap-mcp-remote
pm2 restart sap-mcp-facilitator

echo "=== pm2-logrotate configuration ==="
pm2 conf pm2-logrotate

echo "=== Done. Logs will rotate at 50MB, keep 7 compressed copies. ==="