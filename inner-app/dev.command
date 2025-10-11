

#!/usr/bin/env bash
cd "$(dirname "$0")"
# Ensure the script is executable
chmod +x ./dev.sh 2>/dev/null || true
# Launch the tunnel start script
exec ./dev.sh