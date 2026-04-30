// js/database.js

const supabaseClient = window.supabase.createClient(
  ANIMALCHAIN_CONFIG.supabaseUrl,
  ANIMALCHAIN_CONFIG.supabaseKey
);

async function loadApprovedAnimals() {
  const { data, error } = await supabaseClient
    .from("animals")
    .select("name, normalized_name, first_letter, last_letter")
    .eq("status", "approved")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function suggestAnimal(name) {
  const normalizedName = normalizeAnimalName(name);

  const { error } = await supabaseClient
    .from("animal_suggestions")
    .insert({
      name: toTitleCase(name),
      normalized_name: normalizedName,
      first_letter: getFirstLetter(normalizedName),
      last_letter: getLastLetter(normalizedName),
      status: "pending"
    });

  if (error) {
    throw new Error(error.message);
  }
}

async function createOnlineGame(code, guestName, maxPlayers = 4) {
  const { data: game, error: gameError } = await supabaseClient
    .from("games")
    .insert({
      code,
      status: "waiting",
      max_players: maxPlayers,
      last_animal: "Turmfalke",
      current_required_letter: "e",
      current_turn_order: 1
    })
    .select()
    .single();

  if (gameError) {
    throw new Error(gameError.message);
  }

  const { data: player, error: playerError } = await supabaseClient
    .from("game_players")
    .insert({
      game_id: game.id,
      user_id: null,
      guest_name: guestName,
      turn_order: 1
    })
    .select()
    .single();

  if (playerError) {
    throw new Error(playerError.message);
  }

  return { game, player };
}

async function findGameByCode(code) {
  const { data, error } = await supabaseClient
    .from("games")
    .select("*")
    .eq("code", code)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function loadGamePlayers(gameId) {
  const { data, error } = await supabaseClient
    .from("game_players")
    .select("*")
    .eq("game_id", gameId)
    .order("turn_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function joinOnlineGame(game, guestName) {
  const players = await loadGamePlayers(game.id);

  if (players.length >= game.max_players) {
    throw new Error("Diese Lobby ist voll.");
  }

  const { data: player, error } = await supabaseClient
    .from("game_players")
    .insert({
      game_id: game.id,
      user_id: null,
      guest_name: guestName,
      turn_order: players.length + 1
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await supabaseClient
    .from("games")
    .update({ status: "playing" })
    .eq("id", game.id);

  return player;
}

async function loadGameMoves(gameId) {
  const { data, error } = await supabaseClient
    .from("moves")
    .select("*")
    .eq("game_id", gameId)
    .order("move_number", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

function normalizeAnimalName(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z\s-]/g, "")
    .replace(/\s+/g, " ");
}

function getFirstLetter(value) {
  return value.replace(/[^a-z]/g, "").charAt(0) || "";
}

function getLastLetter(value) {
  const letters = value.replace(/[^a-z]/g, "");
  return letters.charAt(letters.length - 1) || "";
}

function toTitleCase(value) {
  return value
    .trim()
    .toLowerCase()
    .split(" ")
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : "")
    .join(" ");
}
