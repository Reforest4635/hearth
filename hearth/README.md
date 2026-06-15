# Hearth

A home management hub that runs as a Home Assistant add-on behind Ingress.
Tabs: Bills, Evergreen (business), Debts, Home (maintenance), Garden — with
room to grow into other areas of running a household.

Data: SQLite at /share/hearth/hearth.db (WAL mode). On first start Hearth
migrates automatically from a previous "Household Ledger" install
(/share/household_ledger/ledger.db) if present. Browse it with the SQLite Web
add-on; back it up with: cp /share/hearth/hearth.db /config/hearth-backup.db
