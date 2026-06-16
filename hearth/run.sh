#!/bin/sh
echo "Hearth: starting, node $(node --version 2>&1)"
if node -e "require('node:sqlite')" 2>/dev/null; then
  echo "Hearth: node:sqlite available, launching server"
  exec node /app/server.js
elif node --experimental-sqlite -e "require('node:sqlite')" 2>/dev/null; then
  echo "Hearth: node:sqlite via --experimental-sqlite flag, launching server"
  exec node --experimental-sqlite /app/server.js
else
  echo "Hearth: FATAL — this Node build has no node:sqlite support (need Node >= 22.5)."
  echo "Hearth: node version is $(node --version 2>&1). The add-on cannot start."
  exit 1
fi
