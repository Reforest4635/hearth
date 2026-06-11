# Household Ledger — Home Assistant add-on repository

Family bill tracker with pay periods, payment links, and a debt overview.
Runs behind Home Assistant Ingress; data persists in the add-on's /data volume.

## Add to Home Assistant

Settings → Add-ons → Add-on Store → ⋮ → Repositories → paste this repo's URL.
For a private repo use: https://YOUR_TOKEN@github.com/YOUR_USERNAME/household-ledger-addon

## Releasing an update

1. Make your changes (app source lives in your build project; copy the new
   build into household_ledger/public)
2. Bump `version:` in household_ledger/config.yaml
3. Commit and push
4. In HA: Add-on Store → ⋮ → Check for updates → Update
