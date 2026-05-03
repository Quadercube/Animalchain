// js/app.js
// HIER EINTRAGEN: Supabase Project URL + publishable/anon key.
// Niemals service_role key oder database password hier einfügen.

const ANIMALCHAIN_CONFIG = {
  supabaseUrl: "https://xbncxguszajafewaullp.supabase.co",
  supabaseKey: "DEIN_PUBLIC_PUBLISHABLE_KEY_HIER"
};

const supabaseClient = window.supabase.createClient(
  ANIMALCHAIN_CONFIG.supabaseUrl,
  ANIMALCHAIN_CONFIG.supabaseKey
);

const page = document.body.dataset.page;

document.addEventListener("DOMContentLoaded", () => {
  if (page === "practice") initPracticePage();
  if (page === "online") initOnlinePage();
  if (page === "local") initLocalPage();
});

async function loadApprovedAnimals() {
  const { data, error } = await supabaseClient
    .from("animals")
    .select("id, name, normalized_name, first_letter, last_letter, status")
    .eq("status", "approved")
    .order("name", { ascending: true });

  if (error) throw new Error(`Tierdatenbank konnte nicht geladen werden: ${error.message}`);
  return data || [];
}

async function suggestAnimal(name) {
  const cleanName = cleanAnimalName(name);
  const normalizedName = normalizeAnimalName(cleanName);

  if (!cleanName || !normalizedName) throw new Error("Bitte gib einen gültigen Tiernamen ein.");

  const { error } = await supabaseClient.from("animal_suggestions").insert({
    name: toTitleCase(cleanName),
    normalized_name: normalizedName,
    first_letter: getFirstLetter(normalizedName),
    last_letter: getLastLetter(normalizedName),
    status: "pending"
  });

  if (error) throw new Error(`Tier-Vorschlag konnte nicht gespeichert werden: ${error.message}`);
}

function initPracticePage() {
  const state = { animals: [], lastAnimal: "Turmfalke", requiredLetter: "e", moves: [] };
  const el = {
    lastAnimal: document.querySelector("#lastAnimal"),
    requiredLetter: document.querySelector("#requiredLetter"),
    moveCount: document.querySelector("#moveCount"),
    animalForm: document.querySelector("#animalForm"),
    animalInput: document.querySelector("#animalInput"),
    gameMessage: document.querySelector("#gameMessage"),
    hintButton: document.querySelector("#hintButton"),
    newRoundButton: document.querySelector("#newRoundButton"),
    movesList: document.querySelector("#movesList"),
    suggestForm: document.querySelector("#suggestForm"),
    suggestInput: document.querySelector("#suggestInput"),
    animalCount: document.querySelector("#animalCount")
  };

  el.animalForm.addEventListener("submit", handlePlayerMove);
  el.hintButton.addEventListener("click", showHint);
  el.newRoundButton.addEventListener("click", () => startNewRound(true));
  el.suggestForm.addEventListener("submit", handleSuggestAnimal);
  init();

  async function init() {
    try {
      state.animals = await loadApprovedAnimals();
      if (state.animals.length === 0) {
        setMessage("Keine Tiere in Supabase gefunden. Prüfe deine animals-Tabelle.", "warning");
        render();
        return;
      }
      startNewRound(false);
      setMessage("Tierdatenbank geladen. Du bist dran.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    }
    render();
  }

  function startNewRound(showMessage) {
    const startAnimal = pickRandomAnimal(state.animals) || { name: "Turmfalke" };
    state.lastAnimal = startAnimal.name;
    state.requiredLetter = getLastLetter(startAnimal.name);
    state.moves = [];
    render();
    if (showMessage) setMessage(`Neue Runde. Starttier: ${state.lastAnimal}`, "success");
  }

  async function handlePlayerMove(event) {
    event.preventDefault();
    const animalName = cleanAnimalName(el.animalInput.value);
    const validation = validateAnimal(animalName);

    if (!validation.ok) {
      setMessage(validation.message, validation.type);
      return;
    }

    addMove("Du", animalName);
    el.animalInput.value = "";
    render();
    await wait(450);
    computerMove();
  }

  function computerMove() {
    const options = getAvailableAnimalsForLetter(state.animals, state.requiredLetter, state.moves);
    if (options.length === 0) {
      setMessage(`Der Computer findet kein Tier mit ${state.requiredLetter.toUpperCase()}. Du gewinnst!`, "success");
      return;
    }
    const animal = options[Math.floor(Math.random() * options.length)];
    addMove("Computer", animal.name);
    render();
    setMessage(`Computer spielt: ${animal.name}. Jetzt brauchst du ${state.requiredLetter.toUpperCase()}.`, "success");
  }

  function validateAnimal(animalName) {
    if (!animalName) return { ok: false, type: "warning", message: "Bitte gib ein Tier ein." };
    const normalizedName = normalizeAnimalName(animalName);

    if (getFirstLetter(normalizedName) !== state.requiredLetter) {
      return { ok: false, type: "error", message: `Dein Tier muss mit ${state.requiredLetter.toUpperCase()} anfangen.` };
    }
    if (!findAnimal(state.animals, animalName)) {
      return { ok: false, type: "error", message: `"${animalName}" ist nicht in der Supabase-Tierdatenbank. Du kannst es unten vorschlagen.` };
    }
    if (state.moves.some((move) => normalizeAnimalName(move.animal) === normalizedName)) {
      return { ok: false, type: "error", message: `"${animalName}" wurde schon gespielt.` };
    }
    return { ok: true };
  }

  function addMove(playerName, animalName) {
    state.moves.push({ playerName, animal: toTitleCase(animalName) });
    state.lastAnimal = toTitleCase(animalName);
    state.requiredLetter = getLastLetter(animalName);
  }

  function showHint() {
    const options = getAvailableAnimalsForLetter(state.animals, state.requiredLetter, state.moves);
    if (options.length === 0) {
      setMessage(`Kein Tipp für ${state.requiredLetter.toUpperCase()} gefunden.`, "warning");
      return;
    }
    const hint = options[Math.floor(Math.random() * options.length)];
    setMessage(`Tipp: ${hint.name}`, "success");
  }

  async function handleSuggestAnimal(event) {
    event.preventDefault();
    const animalName = cleanAnimalName(el.suggestInput.value);
    if (!animalName) {
      setMessage("Bitte gib ein Tier ein.", "warning");
      return;
    }
    try {
      await suggestAnimal(animalName);
      el.suggestInput.value = "";
      setMessage(`"${toTitleCase(animalName)}" wurde in Supabase vorgeschlagen.`, "success");
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  function render() {
    el.lastAnimal.textContent = state.lastAnimal;
    el.requiredLetter.textContent = state.requiredLetter.toUpperCase();
    el.moveCount.textContent = String(state.moves.length);
    el.animalCount.textContent = `${state.animals.length} Tiere aus Supabase geladen`;
    el.movesList.innerHTML = state.moves.length
      ? state.moves.map((move) => `<li><strong>${escapeHtml(move.animal)}</strong><span class="hint">von ${escapeHtml(move.playerName)}</span></li>`).join("")
      : `<li><strong>${escapeHtml(state.lastAnimal)}</strong><span class="hint">Starttier</span></li>`;
  }

  function setMessage(text, type = "") {
    el.gameMessage.textContent = text;
    el.gameMessage.className = `message ${type}`.trim();
  }
}

function initOnlinePage() {
  const state = { guestName: "Gast", game: null, localPlayer: null, players: [], moves: [], animals: [], refreshTimer: null };
  const el = {
    guestForm: document.querySelector("#guestForm"),
    guestName: document.querySelector("#guestName"),
    currentGuestName: document.querySelector("#currentGuestName"),
    createLobbyButton: document.querySelector("#createLobbyButton"),
    copyLobbyButton: document.querySelector("#copyLobbyButton"),
    activeLobbyCode: document.querySelector("#activeLobbyCode"),
    joinLobbyForm: document.querySelector("#joinLobbyForm"),
    joinCode: document.querySelector("#joinCode"),
    onlineMessage: document.querySelector("#onlineMessage"),
    playersList: document.querySelector("#playersList"),
    lastAnimal: document.querySelector("#lastAnimal"),
    requiredLetter: document.querySelector("#requiredLetter"),
    turnPlayer: document.querySelector("#turnPlayer"),
    onlineAnimalForm: document.querySelector("#onlineAnimalForm"),
    onlineAnimalInput: document.querySelector("#onlineAnimalInput"),
    onlineMovesList: document.querySelector("#onlineMovesList")
  };

  el.guestForm.addEventListener("submit", handleGuestName);
  el.createLobbyButton.addEventListener("click", createLobby);
  el.copyLobbyButton.addEventListener("click", copyLobbyCode);
  el.joinLobbyForm.addEventListener("submit", joinLobby);
  el.onlineAnimalForm.addEventListener("submit", playOnlineAnimal);
  init();

  async function init() {
    try {
      state.animals = await loadApprovedAnimals();
      setMessage("Online-Modus bereit.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    }
    render();
  }

  function handleGuestName(event) {
    event.preventDefault();
    const name = cleanPlayerName(el.guestName.value);
    if (!name) {
      setMessage("Bitte gib einen Gastnamen ein.", "warning");
      return;
    }
    state.guestName = name;
    render();
    setMessage(`Gastname gespeichert: ${name}`, "success");
  }

  async function createLobby() {
    try {
      const code = generateLobbyCode();
      const { data: game, error: gameError } = await supabaseClient.from("games").insert({
        code,
        status: "waiting",
        max_players: 4,
        last_animal: "Turmfalke",
        current_required_letter: "e",
        current_turn_order: 1
      }).select().single();
      if (gameError) throw new Error(gameError.message);

      const { data: player, error: playerError } = await supabaseClient.from("game_players").insert({
        game_id: game.id,
        user_id: null,
        guest_name: state.guestName,
        turn_order: 1
      }).select().single();
      if (playerError) throw new Error(playerError.message);

      state.game = game;
      state.localPlayer = player;
      await refreshOnlineGame();
      startAutoRefresh();
      setMessage(`Lobby ${game.code} erstellt.`, "success");
    } catch (error) {
      setMessage(`Lobby konnte nicht erstellt werden: ${error.message}`, "error");
    }
  }

  async function joinLobby(event) {
    event.preventDefault();
    const code = normalizeLobbyCode(el.joinCode.value);
    if (!code) {
      setMessage("Bitte gib einen Lobby-Code ein.", "warning");
      return;
    }

    try {
      const { data: game, error: gameError } = await supabaseClient.from("games").select("*").eq("code", code).single();
      if (gameError) throw new Error("Lobby wurde nicht gefunden.");

      const players = await loadGamePlayers(game.id);
      if (players.length >= game.max_players) throw new Error("Diese Lobby ist voll.");

      const { data: player, error: playerError } = await supabaseClient.from("game_players").insert({
        game_id: game.id,
        user_id: null,
        guest_name: state.guestName,
        turn_order: players.length + 1
      }).select().single();
      if (playerError) throw new Error(playerError.message);

      await supabaseClient.from("games").update({ status: "playing" }).eq("id", game.id);

      state.game = game;
      state.localPlayer = player;
      await refreshOnlineGame();
      startAutoRefresh();
      setMessage(`Du bist Lobby ${code} beigetreten.`, "success");
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function loadGamePlayers(gameId) {
    const { data, error } = await supabaseClient.from("game_players").select("*").eq("game_id", gameId).order("turn_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function loadGameMoves(gameId) {
    const { data, error } = await supabaseClient.from("moves").select("*").eq("game_id", gameId).order("move_number", { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function refreshOnlineGame() {
    if (!state.game) return;
    const { data: game, error: gameError } = await supabaseClient.from("games").select("*").eq("id", state.game.id).single();
    if (gameError) {
      setMessage(gameError.message, "error");
      return;
    }
    state.game = game;
    state.players = await loadGamePlayers(game.id);
    state.moves = await loadGameMoves(game.id);
    render();
  }

  function startAutoRefresh() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(refreshOnlineGame, 2500);
  }

  async function playOnlineAnimal(event) {
    event.preventDefault();
    if (!state.game || !state.localPlayer) {
      setMessage("Erstelle oder betrete zuerst eine Lobby.", "warning");
      return;
    }

    const currentPlayer = getCurrentOnlinePlayer();
    if (!currentPlayer || currentPlayer.id !== state.localPlayer.id) {
      setMessage("Du bist gerade nicht dran.", "warning");
      return;
    }

    const animalName = cleanAnimalName(el.onlineAnimalInput.value);
    const validation = validateOnlineAnimal(animalName);
    if (!validation.ok) {
      setMessage(validation.message, validation.type);
      return;
    }

    const normalizedAnimal = normalizeAnimalName(animalName);
    const nextLetter = getLastLetter(normalizedAnimal);
    const nextTurnOrder = getNextTurnOrder();
    const moveNumber = state.moves.length + 1;

    try {
      const { error: moveError } = await supabaseClient.from("moves").insert({
        game_id: state.game.id,
        game_player_id: state.localPlayer.id,
        player_id: null,
        animal_name: toTitleCase(animalName),
        normalized_animal_name: normalizedAnimal,
        guest_name: state.guestName,
        required_letter: state.game.current_required_letter || "e",
        next_required_letter: nextLetter,
        move_number: moveNumber
      });
      if (moveError) throw new Error(moveError.message);

      const { error: gameError } = await supabaseClient.from("games").update({
        last_animal: toTitleCase(animalName),
        current_required_letter: nextLetter,
        current_turn_order: nextTurnOrder,
        status: "playing"
      }).eq("id", state.game.id);
      if (gameError) throw new Error(gameError.message);

      el.onlineAnimalInput.value = "";
      await refreshOnlineGame();
      setMessage(`${state.guestName} hat ${toTitleCase(animalName)} gespielt.`, "success");
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  function validateOnlineAnimal(animalName) {
    if (!animalName) return { ok: false, type: "warning", message: "Bitte gib ein Tier ein." };
    const normalizedAnimal = normalizeAnimalName(animalName);
    const requiredLetter = (state.game.current_required_letter || "e").toLowerCase();

    if (getFirstLetter(normalizedAnimal) !== requiredLetter) {
      return { ok: false, type: "error", message: `Das Tier muss mit ${requiredLetter.toUpperCase()} anfangen.` };
    }
    if (!findAnimal(state.animals, animalName)) {
      return { ok: false, type: "error", message: `"${animalName}" ist nicht in der Tierdatenbank.` };
    }
    if (state.moves.some((move) => move.normalized_animal_name === normalizedAnimal)) {
      return { ok: false, type: "error", message: `"${animalName}" wurde schon gespielt.` };
    }
    return { ok: true };
  }

  function getCurrentOnlinePlayer() {
    if (!state.game || state.players.length === 0) return null;
    return state.players.find((player) => player.turn_order === state.game.current_turn_order) || state.players[0];
  }

  function getNextTurnOrder() {
    if (state.players.length === 0) return 1;
    const index = state.players.findIndex((player) => player.turn_order === state.game.current_turn_order);
    return state.players[(index + 1 + state.players.length) % state.players.length].turn_order;
  }

  async function copyLobbyCode() {
    if (!state.game) return;
    try {
      await navigator.clipboard.writeText(state.game.code);
      setMessage("Lobby-Code kopiert.", "success");
    } catch {
      setMessage("Kopieren ging nicht. Markiere den Code manuell.", "warning");
    }
  }

  function render() {
    el.currentGuestName.textContent = state.guestName;
    el.activeLobbyCode.textContent = state.game ? state.game.code : "----";
    el.playersList.innerHTML = state.players.length
      ? state.players.map((player, index) => `<article class="player-row"><strong>${escapeHtml(player.guest_name)}</strong><span>${index === 0 ? '<span class="pill">Host</span>' : ""} ${player.id === state.localPlayer?.id ? '<span class="pill">Du</span>' : ""}</span></article>`).join("")
      : `<p class="hint">Noch keine Lobby.</p>`;

    const currentPlayer = getCurrentOnlinePlayer();
    el.lastAnimal.textContent = state.game?.last_animal || "Turmfalke";
    el.requiredLetter.textContent = (state.game?.current_required_letter || "e").toUpperCase();
    el.turnPlayer.textContent = currentPlayer ? currentPlayer.guest_name : "---";
    el.onlineMovesList.innerHTML = state.moves.length
      ? state.moves.map((move) => `<li><strong>${escapeHtml(move.animal_name)}</strong><span class="hint">von ${escapeHtml(move.guest_name || "Gast")}</span></li>`).join("")
      : `<li><strong>Turmfalke</strong><span class="hint">Starttier</span></li>`;
  }

  function setMessage(text, type = "") {
    el.onlineMessage.textContent = text;
    el.onlineMessage.className = `message ${type}`.trim();
  }
}

function initLocalPage() {
  const state = { animals: [], players: [], currentTurnIndex: 0, lastAnimal: "Turmfalke", requiredLetter: "e", moves: [] };
  const el = {
    localPlayerForm: document.querySelector("#localPlayerForm"),
    localPlayerName: document.querySelector("#localPlayerName"),
    localNewRoundButton: document.querySelector("#localNewRoundButton"),
    localHintButton: document.querySelector("#localHintButton"),
    localMessage: document.querySelector("#localMessage"),
    localPlayersList: document.querySelector("#localPlayersList"),
    lastAnimal: document.querySelector("#lastAnimal"),
    requiredLetter: document.querySelector("#requiredLetter"),
    turnPlayer: document.querySelector("#turnPlayer"),
    localAnimalForm: document.querySelector("#localAnimalForm"),
    localAnimalInput: document.querySelector("#localAnimalInput"),
    localMovesList: document.querySelector("#localMovesList")
  };

  el.localPlayerForm.addEventListener("submit", addPlayer);
  el.localNewRoundButton.addEventListener("click", () => startNewRound(true));
  el.localHintButton.addEventListener("click", showHint);
  el.localAnimalForm.addEventListener("submit", playAnimal);
  init();

  async function init() {
    try {
      state.animals = await loadApprovedAnimals();
      state.players = [{ name: "Spieler 1" }, { name: "Spieler 2" }];
      startNewRound(false);
      setMessage("Lokaler Modus bereit.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    }
    render();
  }

  function addPlayer(event) {
    event.preventDefault();
    const name = cleanPlayerName(el.localPlayerName.value);
    if (!name) {
      setMessage("Bitte gib einen Spielernamen ein.", "warning");
      return;
    }
    if (state.players.length >= 8) {
      setMessage("Maximal 8 Spieler.", "warning");
      return;
    }
    state.players.push({ name });
    el.localPlayerName.value = "";
    render();
  }

  function startNewRound(showMessage) {
    const startAnimal = pickRandomAnimal(state.animals) || { name: "Turmfalke" };
    state.lastAnimal = startAnimal.name;
    state.requiredLetter = getLastLetter(startAnimal.name);
    state.moves = [];
    state.currentTurnIndex = 0;
    render();
    if (showMessage) setMessage(`Neue Runde. Starttier: ${state.lastAnimal}`, "success");
  }

  function playAnimal(event) {
    event.preventDefault();
    const animalName = cleanAnimalName(el.localAnimalInput.value);
    const validation = validateAnimal(animalName);
    if (!validation.ok) {
      setMessage(validation.message, validation.type);
      return;
    }

    const player = getCurrentPlayer();
    state.moves.push({ playerName: player.name, animal: toTitleCase(animalName) });
    state.lastAnimal = toTitleCase(animalName);
    state.requiredLetter = getLastLetter(animalName);
    state.currentTurnIndex = (state.currentTurnIndex + 1) % state.players.length;

    el.localAnimalInput.value = "";
    render();
    setMessage(`${player.name} hat ${toTitleCase(animalName)} gespielt.`, "success");
  }

  function validateAnimal(animalName) {
    if (!animalName) return { ok: false, type: "warning", message: "Bitte gib ein Tier ein." };
    const normalizedName = normalizeAnimalName(animalName);
    if (getFirstLetter(normalizedName) !== state.requiredLetter) {
      return { ok: false, type: "error", message: `Das Tier muss mit ${state.requiredLetter.toUpperCase()} anfangen.` };
    }
    if (!findAnimal(state.animals, animalName)) {
      return { ok: false, type: "error", message: `"${animalName}" ist nicht in der Tierdatenbank.` };
    }
    if (state.moves.some((move) => normalizeAnimalName(move.animal) === normalizedName)) {
      return { ok: false, type: "error", message: `"${animalName}" wurde schon gespielt.` };
    }
    return { ok: true };
  }

  function showHint() {
    const options = getAvailableAnimalsForLetter(state.animals, state.requiredLetter, state.moves);
    if (options.length === 0) {
      setMessage(`Kein Tipp für ${state.requiredLetter.toUpperCase()} gefunden.`, "warning");
      return;
    }
    const hint = options[Math.floor(Math.random() * options.length)];
    setMessage(`Tipp: ${hint.name}`, "success");
  }

  function getCurrentPlayer() {
    return state.players[state.currentTurnIndex] || { name: "Spieler" };
  }

  function render() {
    const player = getCurrentPlayer();
    el.localPlayersList.innerHTML = state.players.map((item, index) => `<article class="player-row"><strong>${escapeHtml(item.name)}</strong>${index === state.currentTurnIndex ? '<span class="pill">dran</span>' : ""}</article>`).join("");
    el.lastAnimal.textContent = state.lastAnimal;
    el.requiredLetter.textContent = state.requiredLetter.toUpperCase();
    el.turnPlayer.textContent = player.name;
    el.localMovesList.innerHTML = state.moves.length
      ? state.moves.map((move) => `<li><strong>${escapeHtml(move.animal)}</strong><span class="hint">von ${escapeHtml(move.playerName)}</span></li>`).join("")
      : `<li><strong>${escapeHtml(state.lastAnimal)}</strong><span class="hint">Starttier</span></li>`;
  }

  function setMessage(text, type = "") {
    el.localMessage.textContent = text;
    el.localMessage.className = `message ${type}`.trim();
  }
}

function findAnimal(animals, animalName) {
  const normalizedName = normalizeAnimalName(animalName);
  return animals.find((animal) => animal.normalized_name === normalizedName) || null;
}

function getAvailableAnimalsForLetter(animals, firstLetter, moves = []) {
  const usedAnimals = new Set(moves.map((move) => normalizeAnimalName(move.animal)));
  const letter = String(firstLetter || "").toLowerCase();
  return animals.filter((animal) => animal.first_letter === letter && !usedAnimals.has(animal.normalized_name));
}

function pickRandomAnimal(animals) {
  if (!animals.length) return null;
  return animals[Math.floor(Math.random() * animals.length)];
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanPlayerName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function cleanAnimalName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
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
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function generateLobbyCode() {
  const words = ["WOLF", "FALK", "PANDA", "LUCHS", "ZEBRA", "BIBER"];
  const word = words[Math.floor(Math.random() * words.length)];
  const number = Math.floor(100 + Math.random() * 900);
  return `${word}${number}`.slice(0, 8);
}

function toTitleCase(value) {
  return String(value || "").trim().toLowerCase().split(" ").map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : "").join(" ");
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
