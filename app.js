// app.js
const STORAGE_KEY = "animalchain_state_v2";

const SUPABASE_URL = "https://xbncxguszajafewaullp.supabase.co";
const SUPABASE_KEY = "DEIN_PUBLIC_ANON_KEY_HIER_EINFÜGEN";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DEFAULT_ANIMALS = [
  "Aal", "Ameise", "Antilope", "Ara", "Bär", "Biber", "Biene", "Bonobo",
  "Dachs", "Delfin", "Dingo", "Eisbär", "Eidechse", "Eichhörnchen", "Esel",
  "Falke", "Fuchs", "Gans", "Gepard", "Giraffe", "Gorilla", "Hamster",
  "Hase", "Hirsch", "Hund", "Igel", "Jaguar", "Kamel", "Katze", "Koala",
  "Krokodil", "Kuh", "Lama", "Leopard", "Luchs", "Marder", "Maus",
  "Meerschweinchen", "Nashorn", "Nilpferd", "Otter", "Panda", "Papagei",
  "Pferd", "Pinguin", "Qualle", "Rabe", "Reh", "Roter Panda", "Schaf",
  "Schlange", "Tiger", "Turmfalke", "Uhu", "Wal", "Wolf", "Zebra", "Ziege"
];

const state = loadState();

const elements = {
  guestForm: document.querySelector("#guestForm"),
  guestName: document.querySelector("#guestName"),
  currentGuestName: document.querySelector("#currentGuestName"),
  createLobbyButton: document.querySelector("#createLobbyButton"),
  joinLobbyForm: document.querySelector("#joinLobbyForm"),
  joinCode: document.querySelector("#joinCode"),
  lobbyTicket: document.querySelector("#lobbyTicket"),
  activeLobbyCode: document.querySelector("#activeLobbyCode"),
  copyLobbyButton: document.querySelector("#copyLobbyButton"),
  addFakePlayerButton: document.querySelector("#addFakePlayerButton"),
  playersList: document.querySelector("#playersList"),
  strictModeToggle: document.querySelector("#strictModeToggle"),
  turnBadge: document.querySelector("#turnBadge"),
  lastAnimal: document.querySelector("#lastAnimal"),
  requiredLetter: document.querySelector("#requiredLetter"),
  moveCount: document.querySelector("#moveCount"),
  animalForm: document.querySelector("#animalForm"),
  animalInput: document.querySelector("#animalInput"),
  gameMessage: document.querySelector("#gameMessage"),
  hintButton: document.querySelector("#hintButton"),
  newRoundButton: document.querySelector("#newRoundButton"),
  movesList: document.querySelector("#movesList"),
  addAnimalForm: document.querySelector("#addAnimalForm"),
  newAnimalInput: document.querySelector("#newAnimalInput"),
  animalSearch: document.querySelector("#animalSearch"),
  animalList: document.querySelector("#animalList"),
  animalCount: document.querySelector("#animalCount"),
  resetAppButton: document.querySelector("#resetAppButton")
};

let lobbyRefreshTimer = null;

init();

async function init() {
  bindEvents();
  renderAll();
  await loadAnimalsFromSupabase();

  if (state.currentGameId) {
    await refreshLobbyFromSupabase();
    startLobbyRefresh();
  }

  renderAll();
}

function bindEvents() {
  elements.guestForm.addEventListener("submit", handleGuestSubmit);
  elements.createLobbyButton.addEventListener("click", createLobby);
  elements.joinLobbyForm.addEventListener("submit", joinLobby);
  elements.copyLobbyButton.addEventListener("click", copyLobbyCode);
  elements.addFakePlayerButton.addEventListener("click", addFakePlayer);
  elements.strictModeToggle.addEventListener("change", handleStrictModeChange);
  elements.animalForm.addEventListener("submit", playAnimal);
  elements.hintButton.addEventListener("click", showHint);
  elements.newRoundButton.addEventListener("click", startNewRound);
  elements.addAnimalForm.addEventListener("submit", addAnimal);
  elements.animalSearch.addEventListener("input", renderAnimals);
  elements.resetAppButton.addEventListener("click", resetApp);
}

function loadState() {
  const fallback = {
    guestName: "Gast",
    lobbyCode: "",
    currentGameId: "",
    localSeatId: "",
    players: [],
    strictMode: true,
    animals: [...DEFAULT_ANIMALS],
    lastAnimal: "Turmfalke",
    requiredLetter: "E",
    moves: [],
    currentTurnIndex: 0
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...fallback, ...saved } : fallback;
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderAll() {
  renderGuest();
  renderLobby();
  renderPlayers();
  renderGame();
  renderAnimals();
}

async function loadAnimalsFromSupabase() {
  const { data, error } = await supabaseClient
    .from("animals")
    .select("name")
    .order("name", { ascending: true });

  if (error) {
    setMessage(`Supabase-Tiere konnten nicht geladen werden: ${error.message}`, "warning");
    return;
  }

  const onlineAnimals = data.map((animal) => animal.name);
  state.animals = uniqueAnimals([...DEFAULT_ANIMALS, ...onlineAnimals]);
  saveState();
}

function handleGuestSubmit(event) {
  event.preventDefault();

  const name = cleanName(elements.guestName.value);
  if (!name) {
    setMessage("Bitte gib einen Gastnamen ein.", "warning");
    return;
  }

  state.guestName = name;
  saveState();
  renderAll();
  setMessage(`Gastname gespeichert: ${name}`, "success");
}

function renderGuest() {
  elements.currentGuestName.textContent = state.guestName;
  elements.guestName.value = state.guestName === "Gast" ? "" : state.guestName;
}

async function createLobby() {
  const code = generateLobbyCode();

  const { data: game, error: gameError } = await supabaseClient
    .from("games")
    .insert({
      code,
      status: "waiting",
      max_players: 4,
      last_animal: "Turmfalke",
      current_required_letter: "e",
      current_turn_order: 1
    })
    .select()
    .single();

  if (gameError) {
    setMessage(`Lobby konnte nicht erstellt werden: ${gameError.message}`, "error");
    return;
  }

  const { data: player, error: playerError } = await supabaseClient
    .from("game_players")
    .insert({
      game_id: game.id,
      user_id: null,
      guest_name: state.guestName,
      turn_order: 1
    })
    .select()
    .single();

  if (playerError) {
    setMessage(`Spieler konnte nicht erstellt werden: ${playerError.message}`, "error");
    return;
  }

  state.lobbyCode = game.code;
  state.currentGameId = game.id;
  state.localSeatId = player.id;
  state.players = [];
  state.moves = [];
  state.lastAnimal = "Turmfalke";
  state.requiredLetter = "E";
  state.currentTurnIndex = 0;

  saveState();
  await refreshLobbyFromSupabase();
  startLobbyRefresh();
  setMessage(`Lobby ${state.lobbyCode} erstellt. Gib den Code deinem Freund.`, "success");
}

async function joinLobby(event) {
  event.preventDefault();

  const code = normalizeLobbyCode(elements.joinCode.value);
  if (code.length < 4) {
    setMessage("Bitte gib einen gültigen Lobby-Code ein.", "warning");
    return;
  }

  const { data: game, error: gameError } = await supabaseClient
    .from("games")
    .select("*")
    .eq("code", code)
    .single();

  if (gameError || !game) {
    setMessage(`Lobby ${code} wurde nicht gefunden.`, "error");
    return;
  }

  const { data: players, error: playersError } = await supabaseClient
    .from("game_players")
    .select("*")
    .eq("game_id", game.id)
    .order("turn_order", { ascending: true });

  if (playersError) {
    setMessage(`Lobby-Spieler konnten nicht geladen werden: ${playersError.message}`, "error");
    return;
  }

  if (players.length >= game.max_players) {
    setMessage("Diese Lobby ist voll.", "warning");
    return;
  }

  const nextTurnOrder = players.length + 1;

  const { data: player, error: playerError } = await supabaseClient
    .from("game_players")
    .insert({
      game_id: game.id,
      user_id: null,
      guest_name: state.guestName,
      turn_order: nextTurnOrder
    })
    .select()
    .single();

  if (playerError) {
    setMessage(`Beitritt fehlgeschlagen: ${playerError.message}`, "error");
    return;
  }

  await supabaseClient
    .from("games")
    .update({ status: "playing" })
    .eq("id", game.id);

  state.lobbyCode = game.code;
  state.currentGameId = game.id;
  state.localSeatId = player.id;

  saveState();
  await refreshLobbyFromSupabase();
  startLobbyRefresh();
  setMessage(`Du bist Lobby ${code} beigetreten.`, "success");
}

function renderLobby() {
  const hasLobby = Boolean(state.lobbyCode);

  elements.lobbyTicket.hidden = !hasLobby;
  elements.activeLobbyCode.textContent = hasLobby ? state.lobbyCode : "----";
  elements.strictModeToggle.checked = state.strictMode;
}

async function copyLobbyCode() {
  if (!state.lobbyCode) return;

  try {
    await navigator.clipboard.writeText(state.lobbyCode);
    setMessage("Lobby-Code kopiert.", "success");
  } catch {
    setMessage("Kopieren ging nicht. Markiere den Code manuell.", "warning");
  }
}

async function addFakePlayer() {
  if (!state.currentGameId) {
    await createLobby();
  }

  const names = ["moboop", "FalkeKing", "ZooPro", "PandaBoss", "Wolfi"];
  const usedNames = new Set(state.players.map((player) => player.name));
  const nextName = names.find((name) => !usedNames.has(name)) || `Gast ${state.players.length + 1}`;

  if (state.players.length >= 4) {
    setMessage("Maximal 4 Spieler in der Lobby.", "warning");
    return;
  }

  const { error } = await supabaseClient
    .from("game_players")
    .insert({
      game_id: state.currentGameId,
      user_id: null,
      guest_name: nextName,
      turn_order: state.players.length + 1
    });

  if (error) {
    setMessage(`Testspieler konnte nicht gespeichert werden: ${error.message}`, "error");
    return;
  }

  await refreshLobbyFromSupabase();
}

function renderPlayers() {
  if (state.players.length === 0) {
    elements.playersList.innerHTML = `<p class="hint">Noch keine Lobby. Erstelle eine Lobby oder tritt einer bei.</p>`;
    return;
  }

  elements.playersList.innerHTML = state.players.map((player, index) => `
    <article class="player-row">
      <span class="player-avatar">${escapeHtml(player.name.slice(0, 1).toUpperCase())}</span>
      <span class="player-meta">
        <strong>${escapeHtml(player.name)}</strong>
        <span>Spieler ${index + 1}</span>
      </span>
      ${index === 0 ? `<span class="host-pill">Host</span>` : ""}
      ${player.id === state.localSeatId ? `<span class="host-pill">Du</span>` : ""}
    </article>
  `).join("");
}

function handleStrictModeChange() {
  state.strictMode = elements.strictModeToggle.checked;
  saveState();
}

async function playAnimal(event) {
  event.preventDefault();

  const animalName = cleanAnimal(elements.animalInput.value);
  if (!animalName) {
    setMessage("Bitte gib ein Tier ein.", "warning");
    return;
  }

  const normalizedAnimal = normalizeAnimal(animalName);
  const firstLetter = getFirstLetter(normalizedAnimal);
  const requiredLetter = state.requiredLetter.toLowerCase();

  if (firstLetter !== requiredLetter) {
    setMessage(`Dieses Tier muss mit ${state.requiredLetter.toUpperCase()} anfangen.`, "error");
    return;
  }

  if (state.strictMode && !hasAnimal(animalName)) {
    setMessage(`"${animalName}" ist noch nicht in der Tierdatenbank.`, "error");
    return;
  }

  if (state.moves.some((move) => normalizeAnimal(move.animal) === normalizedAnimal)) {
    setMessage(`"${animalName}" wurde in dieser Runde schon gespielt.`, "error");
    return;
  }

  const player = getCurrentPlayer();

  if (state.currentGameId && player.id !== state.localSeatId) {
    setMessage(`${player.name} ist dran. Warte auf deinen Zug.`, "warning");
    return;
  }

  if (!hasAnimal(animalName)) {
    await suggestAnimal(animalName);
    state.animals.push(toTitleCase(animalName));
    sortAnimals();
  }

  if (state.currentGameId) {
    await playOnlineAnimal(animalName, normalizedAnimal);
    return;
  }

  playLocalAnimal(animalName, normalizedAnimal);
}

function playLocalAnimal(animalName, normalizedAnimal) {
  const player = getCurrentPlayer();
  const move = {
    id: crypto.randomUUID(),
    animal: toTitleCase(animalName),
    playerName: player.name,
    createdAt: new Date().toISOString()
  };

  state.moves.push(move);
  state.lastAnimal = move.animal;
  state.requiredLetter = getLastLetter(normalizedAnimal).toUpperCase();
  state.currentTurnIndex = getNextTurnIndex();

  elements.animalInput.value = "";
  saveState();
  renderAll();
  setMessage(`${move.playerName} hat "${move.animal}" gespielt.`, "success");
}

async function playOnlineAnimal(animalName, normalizedAnimal) {
  const nextRequiredLetter = getLastLetter(normalizedAnimal);
  const nextTurnOrder = getNextOnlineTurnOrder();
  const moveNumber = state.moves.length + 1;

  const { error: moveError } = await supabaseClient
    .from("moves")
    .insert({
      game_id: state.currentGameId,
      game_player_id: state.localSeatId,
      player_id: null,
      animal_name: toTitleCase(animalName),
      normalized_animal_name: normalizedAnimal,
      guest_name: state.guestName,
      required_letter: state.requiredLetter.toLowerCase(),
      next_required_letter: nextRequiredLetter,
      move_number: moveNumber
    });

  if (moveError) {
    setMessage(`Spielzug konnte nicht gespeichert werden: ${moveError.message}`, "error");
    return;
  }

  const { error: gameError } = await supabaseClient
    .from("games")
    .update({
      last_animal: toTitleCase(animalName),
      current_required_letter: nextRequiredLetter,
      current_turn_order: nextTurnOrder,
      status: "playing"
    })
    .eq("id", state.currentGameId);

  if (gameError) {
    setMessage(`Lobby konnte nicht aktualisiert werden: ${gameError.message}`, "error");
    return;
  }

  elements.animalInput.value = "";
  await refreshLobbyFromSupabase();
  setMessage(`${state.guestName} hat "${toTitleCase(animalName)}" gespielt.`, "success");
}

async function suggestAnimal(animalName) {
  const normalizedName = normalizeAnimal(animalName);

  const { error } = await supabaseClient
    .from("animal_suggestions")
    .insert({
      name: toTitleCase(animalName),
      normalized_name: normalizedName,
      first_letter: getFirstLetter(normalizedName),
      last_letter: getLastLetter(normalizedName),
      status: "pending"
    });

  if (error) {
    setMessage(`Tier-Vorschlag konnte nicht gespeichert werden: ${error.message}`, "warning");
  }
}

function renderGame() {
  const player = getCurrentPlayer();

  elements.turnBadge.textContent = `${player.name} ist dran`;
  elements.lastAnimal.textContent = state.lastAnimal;
  elements.requiredLetter.textContent = state.requiredLetter.toUpperCase();
  elements.moveCount.textContent = String(state.moves.length);

  elements.movesList.innerHTML = state.moves.length
    ? state.moves.map((move) => `
        <li>
          <strong>${escapeHtml(move.animal)}</strong>
          <span class="hint">von ${escapeHtml(move.playerName)}</span>
        </li>
      `).join("")
    : `<li><strong>${escapeHtml(state.lastAnimal)}</strong> <span class="hint">Starttier</span></li>`;
}

function showHint() {
  const available = state.animals.filter((animal) => {
    return getFirstLetter(normalizeAnimal(animal)) === state.requiredLetter.toLowerCase()
      && !state.moves.some((move) => normalizeAnimal(move.animal) === normalizeAnimal(animal));
  });

  if (available.length === 0) {
    setMessage(`Kein Tipp für ${state.requiredLetter.toUpperCase()} gefunden.`, "warning");
    return;
  }

  const hint = available[Math.floor(Math.random() * available.length)];
  setMessage(`Tipp: ${hint}`, "success");
}

async function startNewRound() {
  const startAnimals = ["Turmfalke", "Hase", "Eisbär", "Roter Panda", "Delfin", "Giraffe"];
  const startAnimal = startAnimals[Math.floor(Math.random() * startAnimals.length)];
  const requiredLetter = getLastLetter(normalizeAnimal(startAnimal));

  if (state.currentGameId) {
    const { error } = await supabaseClient
      .from("games")
      .update({
        last_animal: startAnimal,
        current_required_letter: requiredLetter,
        current_turn_order: 1,
        status: "playing"
      })
      .eq("id", state.currentGameId);

    if (error) {
      setMessage(`Neue Runde konnte nicht gestartet werden: ${error.message}`, "error");
      return;
    }

    state.moves = [];
    state.lastAnimal = startAnimal;
    state.requiredLetter = requiredLetter.toUpperCase();
    state.currentTurnIndex = 0;

    saveState();
    renderAll();
    setMessage(`Neue Runde gestartet. Erstes Tier: ${startAnimal}`, "success");
    return;
  }

  state.lastAnimal = startAnimal;
  state.requiredLetter = requiredLetter.toUpperCase();
  state.moves = [];
  state.currentTurnIndex = 0;

  saveState();
  renderAll();
  setMessage(`Neue Runde gestartet. Erstes Tier: ${startAnimal}`, "success");
}

async function addAnimal(event) {
  event.preventDefault();

  const animalName = cleanAnimal(elements.newAnimalInput.value);
  if (!animalName) {
    setMessage("Bitte gib ein Tier ein.", "warning");
    return;
  }

  if (hasAnimal(animalName)) {
    setMessage(`"${animalName}" ist schon in der Liste.`, "warning");
    return;
  }

  await suggestAnimal(animalName);

  state.animals.push(toTitleCase(animalName));
  sortAnimals();
  elements.newAnimalInput.value = "";

  saveState();
  renderAnimals();
  setMessage(`"${toTitleCase(animalName)}" wurde vorgeschlagen und lokal hinzugefügt.`, "success");
}

function renderAnimals() {
  const search = normalizeAnimal(elements.animalSearch.value || "");
  const animals = state.animals
    .filter((animal) => normalizeAnimal(animal).includes(search))
    .slice(0, 200);

  elements.animalCount.textContent = `${state.animals.length} Tiere`;
  elements.animalList.innerHTML = animals.map((animal) => (
    `<span class="animal-chip">${escapeHtml(animal)}</span>`
  )).join("");
}

function resetApp() {
  const confirmed = confirm("Wirklich alles lokal zurücksetzen?");
  if (!confirmed) return;

  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

async function refreshLobbyFromSupabase() {
  if (!state.currentGameId) return;

  const { data: game, error: gameError } = await supabaseClient
    .from("games")
    .select("*")
    .eq("id", state.currentGameId)
    .single();

  if (gameError) {
    setMessage(`Lobby konnte nicht geladen werden: ${gameError.message}`, "warning");
    return;
  }

  const { data: players, error: playersError } = await supabaseClient
    .from("game_players")
    .select("*")
    .eq("game_id", state.currentGameId)
    .order("turn_order", { ascending: true });

  if (playersError) {
    setMessage(`Spieler konnten nicht geladen werden: ${playersError.message}`, "warning");
    return;
  }

  const { data: moves, error: movesError } = await supabaseClient
    .from("moves")
    .select("*")
    .eq("game_id", state.currentGameId)
    .order("move_number", { ascending: true });

  if (movesError) {
    setMessage(`Spielzüge konnten nicht geladen werden: ${movesError.message}`, "warning");
    return;
  }

  state.lobbyCode = game.code;
  state.lastAnimal = game.last_animal || "Turmfalke";
  state.requiredLetter = (game.current_required_letter || "e").toUpperCase();
  state.currentTurnIndex = Math.max((game.current_turn_order || 1) - 1, 0);

  state.players = players.map((player) => ({
    id: player.id,
    name: player.guest_name,
    role: player.turn_order === 1 ? "Host" : "Gast",
    turnOrder: player.turn_order
  }));

  state.moves = moves.map((move) => ({
    id: move.id,
    animal: move.animal_name,
    playerName: move.guest_name || "Gast",
    createdAt: move.created_at
  }));

  saveState();
  renderAll();
}

function startLobbyRefresh() {
  if (lobbyRefreshTimer) {
    clearInterval(lobbyRefreshTimer);
  }

  lobbyRefreshTimer = setInterval(refreshLobbyFromSupabase, 2500);
}

function getCurrentPlayer() {
  if (state.players.length === 0) {
    return { id: "solo", name: state.guestName, role: "Solo" };
  }

  return state.players[state.currentTurnIndex] || state.players[0];
}

function getNextTurnIndex() {
  if (state.players.length === 0) return 0;
  return (state.currentTurnIndex + 1) % state.players.length;
}

function getNextOnlineTurnOrder() {
  if (state.players.length === 0) return 1;
  return ((state.currentTurnIndex + 1) % state.players.length) + 1;
}

function hasAnimal(name) {
  const normalizedName = normalizeAnimal(name);
  return state.animals.some((animal) => normalizeAnimal(animal) === normalizedName);
}

function uniqueAnimals(animals) {
  const normalizedMap = new Map();

  animals.forEach((animal) => {
    const cleanAnimalName = toTitleCase(animal);
    const normalizedAnimalName = normalizeAnimal(cleanAnimalName);

    if (normalizedAnimalName) {
      normalizedMap.set(normalizedAnimalName, cleanAnimalName);
    }
  });

  return [...normalizedMap.values()].sort((a, b) => a.localeCompare(b, "de"));
}

function sortAnimals() {
  state.animals = uniqueAnimals(state.animals);
}

function setMessage(text, type = "") {
  elements.gameMessage.textContent = text;
  elements.gameMessage.className = `message ${type}`.trim();
}

function cleanName(value) {
  return value.trim().replace(/\s+/g, " ").slice(0, 24);
}

function cleanAnimal(value) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeAnimal(value) {
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

function generateLobbyCode() {
  const words = ["WOLF", "FALK", "PANDA", "LUCHS", "ZEBRA", "BIBER"];
  const word = words[Math.floor(Math.random() * words.length)];
  const number = Math.floor(100 + Math.random() * 900);
  return `${word}${number}`.slice(0, 8);
}

function normalizeLobbyCode(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function toTitleCase(value) {
  return value
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
