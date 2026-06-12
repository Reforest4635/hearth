#!/bin/sh
# node:sqlite is flag-free on newer Node; fall back to the flag on older 22.x
if node -e "require('node:sqlite')" 2>/dev/null; then
  exec node /app/server.js
else
  exec node --experimental-sqlite /app/server.js
fi
