# Household Ledger (v2 — SQLite)

Bills with pay periods and payment links, editable debts, plus Home maintenance
and Garden tabs with interval scheduling ("every N days since last done") and
per-task completion history.

Data: SQLite at /share/household_ledger/ledger.db (WAL mode). On first start it
imports your old state.json automatically and renames it to state.json.imported.
Browse the database with the SQLite Web add-on if you like.

Backup: cp /share/household_ledger/ledger.db /config/ledger-backup.db
