# Animalchain

Mehrseitiges Tierketten-Spiel mit **nur einer JavaScript-Datei**.

## Struktur

```text
index.html
practice.html
online.html
local.html
assets/styles.css
js/app.js
sql/required_schema.sql
README.md
```

## Wichtig

In `js/app.js` eintragen:

```js
const ANIMALCHAIN_CONFIG = {
  supabaseUrl: "https://DEIN-PROJEKT.supabase.co",
  supabaseKey: "DEIN_PUBLIC_PUBLISHABLE_KEY"
};
```

Nur `anon` / `publishable` Key verwenden. Niemals `service_role` oder Datenbankpasswort.

## Supabase

Den Inhalt von `sql/required_schema.sql` einmal im Supabase SQL Editor ausführen.

## GitHub Pages

Nicht den ZIP-Ordner selbst hochladen, sondern den Inhalt des entpackten Ordners.
