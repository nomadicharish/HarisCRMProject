#!/bin/sh
set -eu

if [ "${MALWARE_SCAN_REQUIRED:-false}" = "true" ]; then
  echo "Updating ClamAV signatures..."
  if ! freshclam --config-file=/etc/clamav/freshclam.conf; then
    echo "ClamAV signature update failed; attempting to use the existing signature database." >&2
  fi

  clamd --config-file=/etc/clamav/clamd.conf &
  clamd_pid=$!

  attempt=0
  while ! nc -z 127.0.0.1 3310; do
    if ! kill -0 "$clamd_pid" 2>/dev/null; then
      echo "ClamAV stopped before it became ready." >&2
      exit 1
    fi

    attempt=$((attempt + 1))
    if [ "$attempt" -ge 60 ]; then
      echo "Timed out waiting for ClamAV to become ready." >&2
      exit 1
    fi
    sleep 1
  done
  echo "ClamAV is ready."
else
  echo "Malware scanning is not required for this environment."
fi

echo "Starting API."
exec npm start
