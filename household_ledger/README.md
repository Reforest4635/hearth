# Household Ledger — Home Assistant add-on

Family bill tracker with pay periods, paid checkmarks per month, and a debt overview.
Runs behind Home Assistant Ingress (your HA login protects it) and stores data in
the add-on's /data volume, shared across every device you sign in from.

## Install

1. Copy this whole `household_ledger` folder into the `/addons` directory on your
   Home Assistant box (Samba, the File editor add-on, or SSH all work):
   `/addons/household_ledger/`
2. In HA go to **Settings → Add-ons → Add-on Store**, open the **⋮ menu (top right)
   → Check for updates**, then refresh the page.
3. A new section **Local add-ons** appears with **Household Ledger**. Open it and
   click **Install** (first install builds the image — takes a minute).
4. Click **Start**, and enable **Show in sidebar**.

"Ledger" now appears in your sidebar, works in the companion app, and through
Nabu Casa remote access.

## Where's my data?

`/addon_configs`-style persistence: the app state lives in the add-on's private
`/data/state.json`. It survives restarts and add-on updates. Uninstalling the
add-on deletes it — take a copy first if you ever remove it.

## Updating the app

Replace the contents of `public/` with a new build, bump `version:` in
`config.yaml`, then in the add-on page click ⋮ → Rebuild.
