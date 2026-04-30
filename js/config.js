// js/config.js
// Hier Supabase Project URL und anon/publishable key eintragen.
// Niemals service_role key oder database password hier einfügen.

const ANIMALCHAIN_CONFIG = {
  supabaseUrl: "https:xbncxguszajafewaullp.supabase.co",
  supabaseKey: "sb_publishable_cft_HvPmZgUTVRKI8aFYTg_YMO4HnNF"
};

const supabaseClient = window.supabase.createClient(
  ANIMALCHAIN_CONFIG.supabaseUrl,
  ANIMALCHAIN_CONFIG.supabaseKey
);
