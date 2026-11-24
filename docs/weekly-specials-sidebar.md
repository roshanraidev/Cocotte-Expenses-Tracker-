# Weekly Specials navigation

Weekly Specials now belongs directly below Recipes in the shared left navigation, with published recipe links and a count. The mobile More sheet uses that same navigation. The former right rail and polling component were removed. No recipes are copied: links reference the existing Recipe IDs.

The SQL selector still enforces restaurant, published status, inclusive Europe/London dates, enabled settings, visible category/recipe and non-archived state. Super Users retain the existing management forms below the library. General Users have read-only navigation.

After the reviewed kitchen migration is installed, transactional PostgreSQL `NOTIFY` events drive a shared authenticated SSE connection. A 20-second heartbeat checks session validity and time-based expiry; it is not the change subscription transport. Connections renew after 55 seconds and reload a database snapshot on reconnect, so missed connection events cannot leave stale records indefinitely. Search, filters and whole-card drag state are independent of the stream.

See [Kitchen notifications](kitchen-notifications.md) for setup, safety and verification. Without the new migration the existing Specials snapshot remains available, but database-triggered live updates and persistent notifications are explicitly not active.
