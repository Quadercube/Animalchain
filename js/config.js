// js/config.js
// Hier Supabase Project URL und anon/publishable key eintragen.
// Niemals service_role key oder database password hier einfügen.
const ANIMALCHAIN_CONFIG = {
  supabaseUrl: "https://xbncxguszajafewaullp.supabase.co",
  supabaseKey: "DEINEN_ANON_KEY_HIER_EINFÜGEN"
};
 
const supabaseClient = window.supabase.createClient(
  ANIMALCHAIN_CONFIG.supabaseUrl,
  ANIMALCHAIN_CONFIG.supabaseKey
);
 
