// js/config.js
// Hier Supabase Project URL und anon/publishable key eintragen.
// Niemals service_role key oder database password hier einfügen.

const ANIMALCHAIN_CONFIG = {
  supabaseUrl: "https://DEIN-PROJEKT.supabase.co",
  supabaseKey: "DEIN_PUBLIC_ANON_ODER_PUBLISHABLE_KEY"
};

const supabaseClient = window.supabase.createClient(
  ANIMALCHAIN_CONFIG.supabaseUrl,
  ANIMALCHAIN_CONFIG.supabaseKey
);
