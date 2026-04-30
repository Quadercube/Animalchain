// js/database.js

const supabaseClient = window.supabase.createClient(
  ANIMALCHAIN_CONFIG.supabaseUrl,
  ANIMALCHAIN_CONFIG.supabaseKey
);

window.AnimalchainDB = {
  loadApprovedAnimals,
  suggestAnimal,
  createOnlineGame,
  findGameByCode,
  loadGameById,
  loadGamePlayers,
  joinOnlineGame,
  loadGameMoves,
  saveOnlineMove,
  updateOnlineGameAfterMove,
  findAnimalInList,
  getRandomAnimalByFirstLetter,
  cleanPlayerName,
  cleanAnimalName,
  normalizeAnimalName,
  getFirstLetter,
  getLastLetter,
  normalizeLobbyCode,
  generateLobbyCode,
  toTitleCase,
  escapeHtml
};

async function loadApprovedAnimals() {
  const { data, error } = await supabaseClient
    .from("animals")
    .select("id, name, normalized_name, first_letter, last_letter, status")
    .eq("status", "approved")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Tierdatenbank konnte nicht geladen werden: ${error.message}`);
  }

  return data || [];
}

async function suggestAnimal(name) {
  const cleanName = cleanAnimalName(name);
  const normalizedName = normalizeAnimalName(cleanName);

  if (!cleanName || !normalizedName) {
    throw new Error("Bitte gib einen gültigen Tiernamen ein.");
  }

  const { data, error } = await supabaseClient
    .from("animal_suggestions")
    .insert({
      name: toTitleCase(cleanName),
      normalized_name: normalizedName,
      first_letter: getFirstLetter(normalizedName),
      last_letter: getLastLetter(normalizedName),
      status: "pending"
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Tier-Vorschlag konnte nicht gespeichert werden: ${error.message}`);
  }

  return data;
}

async function createOnlineGame(code, guestName, maxPlayers = 4) {
  const normalizedCode = normalizeLobbyCode(code);
  const cleanGuestName = cleanPlayerName(guestName);

  if (!normalizedCode) {
    throw new Error("Lobby-Code fehlt.");
  }

  if (!cleanGuestName) {
    throw new Error("Gastname fehlt.");
  }

  const { data: game, error: gameError } = await supabaseClient
    .from("games")
    .insert({
      code: normalizedCode,
      status: "waiting",
      max_players: maxPlayers,
      last_animal: "Turmfalke",
      current_required_letter: "e",
      current_turn_order: 1
    })
    .select()
    .single();

  if (gameError) {
    throw new Error(`Lobby konnte nicht erstellt werden: ${gameError.message}`);
  }

  const { data: player, error: playerError } = await supabaseClient
    .from("game_players")
    .insert({
      game_id: game.id,
      user_id: null,
      guest_name: cleanGuestName,
      turn_order: 1
    })
    .select()
    .single();

  if (playerError) {
    throw new Error(`Spieler konnte nicht erstellt werden: ${playerError.message}`);
  }

  return { game, player };
}

async function findGameByCode(code) {
  const normalizedCode = normalizeLobbyCode(code);

  if (!normalizedCode) {
    throw new Error("Lobby-Code fehlt.");
  }

  const { data, error } = await supabaseClient
    .from("games")
    .select("*")
    .eq("code", normalizedCode)
    .single();

  if (error) {
    throw new Error("Lobby wurde nicht gefunden.");
  }

  return data;
}

async function loadGameById(gameId) {
  if (!gameId) {
    throw new Error("Game-ID fehlt.");
  }

  const { data, error } = await supabaseClient
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();

  if (error) {
    throw new Error(`Lobby konnte nicht geladen werden: ${error.message}`);
  }

  return data;
}

async function loadGamePlayers(gameId) {
  if (!gameId) {
    throw new Error("Game-ID fehlt.");
  }

  const { data, error } = await supabaseClient
    .from("game_players")
    .select("*")
    .eq("game_id", gameId)
    .order("turn_order", { ascending: true });

  if (error) {
    throw new Error(`Spieler konnten nicht geladen werden: ${error.message}`);
  }

  return data || [];
}

async function joinOnlineGame(game, guestName) {
  const cleanGuestName = cleanPlayerName(guestName);

  if (!game || !game.id) {
    throw new Error("Lobby ist ungültig.");
  }

  if (!cleanGuestName) {
    throw new Error("Gastname fehlt.");
  }

  const players = await loadGamePlayers(game.id);

  if (players.length >= game.max_players) {
    throw new Error("Diese Lobby ist voll.");
  }

  const { data: player, error: playerError } = await supabaseClient
    .from("game_players")
    .insert({
      game_id: game.id,
      user_id: null,
      guest_name: cleanGuestName,
      turn_order: players.length + 1
    })
    .select()
    .single();

  if (playerError) {
    throw new Error(`Beitritt fehlgeschlagen: ${playerError.message}`);
  }

  const { error: updateError } = await supabaseClient
    .from("games")
    .update({ status: "playing" })
    .eq("id", game.id);

  if (updateError) {
    throw new Error(`Lobby konnte nicht gestartet werden: ${updateError.message}`);
  }

  return player;
}

async function loadGameMoves(gameId) {
  if (!gameId) {
    throw new Error("Game-ID fehlt.");
  }

  const { data, error } = await supabaseClient
    .from("moves")
    .select("*")
    .eq("game_id", gameId)
    .order("move_number", { ascending: true });

  if (error) {
    throw new Error(`Spielzüge konnten nicht geladen werden: ${error.message}`);
  }

  return data || [];
}

async function saveOnlineMove({
  gameId,
  gamePlayerId,
  guestName,
  animalName,
  requiredLetter,
  moveNumber
}) {
  const cleanAnimal = cleanAnimalName(animalName);
  const normalizedAnimal = normalizeAnimalName(cleanAnimal);
  const nextRequiredLetter = getLastLetter(normalizedAnimal);

  if (!gameId) {
    throw new Error("Spiel fehlt.");
  }

  if (!gamePlayerId) {
    throw new Error("Spieler fehlt.");
  }

  if (!cleanAnimal || !normalizedAnimal) {
    throw new Error("Tiername ist ungültig.");
  }

  const { data: move, error } = await supabaseClient
    .from("moves")
    .insert({
      game_id: gameId,
      game_player_id: gamePlayerId,
      player_id: null,
      animal_name: toTitleCase(cleanAnimal),
      normalized_animal_name: normalizedAnimal,
      guest_name: cleanPlayerName(guestName) || "Gast",
      required_letter: String(requiredLetter || "").toLowerCase(),
      next_required_letter: nextRequiredLetter,
      move_number: moveNumber
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Spielzug konnte nicht gespeichert werden: ${error.message}`);
  }

  return move;
}

async function updateOnlineGameAfterMove(gameId, animalName, nextRequiredLetter, nextTurnOrder) {
  if (!gameId) {
    throw new Error("Game-ID fehlt.");
  }

  const { error } = await supabaseClient
    .from("games")
    .update({
      last_animal: toTitleCase(animalName),
      current_required_letter: String(nextRequiredLetter || "").toLowerCase(),
      current_turn_order: nextTurnOrder,
      status: "playing"
    })
    .eq("id", gameId);

  if (error) {
    throw new Error(`Lobby konnte nicht aktualisiert werden: ${error.message}`);
  }
}

function findAnimalInList(animals, animalName) {
  const normalizedName = normalizeAnimalName(animalName);

  return animals.find((animal) => animal.normalized_name === normalizedName) || null;
}

function getRandomAnimalByFirstLetter(animals, firstLetter, usedNames = []) {
  const normalizedUsedNames = new Set(usedNames.map(normalizeAnimalName));
  const letter = String(firstLetter || "").toLowerCase();

  const matches = animals.filter((animal) => {
    return animal.first_letter === letter && !normalizedUsedNames.has(animal.normalized_name);
  });

  if (matches.length === 0) {
    return null;
  }

  return matches[Math.floor(Math.random() * matches.length)];
}

function cleanPlayerName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
}

function cleanAnimalName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeAnimalName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z\s-]/g, "")
    .replace(/\s+/g, " ");
}

function getFirstLetter(value) {
  return normalizeAnimalName(value).replace(/[^a-z]/g, "").charAt(0) || "";
}

function getLastLetter(value) {
  const letters = normalizeAnimalName(value).replace(/[^a-z]/g, "");

  return letters.charAt(letters.length - 1) || "";
}

function normalizeLobbyCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function generateLobbyCode() {
  const words = ["WOLF", "FALK", "PANDA", "LUCHS", "ZEBRA", "BIBER"];
  const word = words[Math.floor(Math.random() * words.length)];
  const number = Math.floor(100 + Math.random() * 900);

  return `${word}${number}`.slice(0, 8);
}

function toTitleCase(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(" ")
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : "")
    .join(" ");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character]));
}
