# Animalchain

Mehrseitiges Animalchain-Interface mit Supabase.

## Seiten

- `index.html` Startseite
- `practice.html` Übungsmodus gegen Computer
- `online.html` Online-Lobby für verschiedene Geräte
- `local.html` Mehrspieler an einem Gerät

## Setup

1. `sql/required_schema_updates.sql` in Supabase im SQL Editor ausführen.
2. In `js/config.js` deine Supabase URL und deinen anon/publishable key eintragen.
3. Alle Dateien ins GitHub Repository hochladen.
4. GitHub Pages aktivieren.

## Wichtig

Die Tierliste wird aus Supabase geladen. Es gibt keine lokale Tierdatenbank und kein `localStorage`.

Der anon/publishable key darf in GitHub stehen. Nicht veröffentlichen:

- service_role key
- database password
- JWT secret
