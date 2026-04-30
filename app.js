// app.js
const STORAGE_KEY = "animalchain_state_v1";

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

init();

function init() {
  bindEvents();
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

function handleGuestSubmit(event) {
  event.preventDefault();

  const name = cleanName(elements.guestName.value);
  if (!name) {
    setMessage("Bitte gib einen Gastnamen ein.", "warning");
    return;
  }

  state.guestName = name;
  ensureHostPlayer();
  saveState();
  renderAll();
  setMessage(`Gastname gespeichert: ${name}`, "success");
}

function renderGuest() {
  elements.currentGuestName.textContent = state.guestName;
  elements.guestName.value = state.guestName === "Gast" ? "" : state.guestName;
}

function createLobby() {
  state.lobbyCode = generateLobbyCode();
  state.players = [];
  ensureHostPlayer();
  saveState();
  renderAll();
  setMessage(`Lobby ${state.lobbyCode} erstellt. Gib den Code deinem Freund.`, "success");
}

function joinLobby(event) {
  event.preventDefault();

  const code = normalizeLobbyCode(elements.joinCode.value);
  if (code.length < 4) {
    setMessage("Bitte gib einen gültigen Lobby-Code ein.", "warning");
    return;
  }

  state.lobbyCode = code;
  ensureHostPlayer();
  saveState();
  renderAll();
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

function ensureHostPlayer() {
  const hostExists = state.players.some((player) => player.role === "Host");

  if (!hostExists) {
    state.players.unshift({
      id: crypto.randomUUID(),
      name: state.guestName,
      role: "Host"
    });
    return;
  }

  state.players = state.players.map((player) => (
    player.role === "Host" ? { ...player, name: state.guestName } : player
  ));
}

function addFakePlayer() {
  if (!state.lobbyCode) {
    createLobby();
  }

  const names = ["moboop", "FalkeKing", "ZooPro", "PandaBoss", "Wolfi"];
  const usedNames = new Set(state.players.map((player) => player.name));
  const nextName = names.find((name) => !usedNames.has(name)) || `Gast ${state.players.length + 1}`;

  if (state.players.length >= 4) {
    setMessage("Für diese Demo sind maximal 4 Spieler in der Lobby.", "warning");
    return;
  }

  state.players.push({
    id: crypto.randomUUID(),
    name: nextName,
    role: "Gast"
  });

  saveState();
  renderPlayers();
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
      ${player.role === "Host" ? `<span class="host-pill">Host</span>` : ""}
    </article>
  `).join("");
}

function handleStrictModeChange() {
  state.strictMode = elements.strictModeToggle.checked;
  saveState();
}

function playAnimal(event) {
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
    setMessage(`"${animalName}" ist noch nicht in der lokalen Tierliste.`, "error");
    return;
  }

  if (state.moves.some((move) => normalizeAnimal(move.animal) === normalizedAnimal)) {
    setMessage(`"${animalName}" wurde in dieser Runde schon gespielt.`, "error");
    return;
  }

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

  if (!hasAnimal(move.animal)) {
    state.animals.push(move.animal);
    sortAnimals();
  }

  elements.animalInput.value = "";
  saveState();
  renderAll();
  setMessage(`${move.playerName} hat "${move.animal}" gespielt.`, "success");
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

function startNewRound() {
  const startAnimals = ["Turmfalke", "Hase", "Eisbär", "Roter Panda", "Delfin", "Giraffe"];
  const startAnimal = startAnimals[Math.floor(Math.random() * startAnimals.length)];

  state.lastAnimal = startAnimal;
  state.requiredLetter = getLastLetter(normalizeAnimal(startAnimal)).toUpperCase();
  state.moves = [];
  state.currentTurnIndex = 0;

  saveState();
  renderAll();
  setMessage(`Neue Runde gestartet. Erstes Tier: ${startAnimal}`, "success");
}

function addAnimal(event) {
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

  state.animals.push(toTitleCase(animalName));
  sortAnimals();
  elements.newAnimalInput.value = "";

  saveState();
  renderAnimals();
  setMessage(`"${toTitleCase(animalName)}" wurde lokal hinzugefügt.`, "success");
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

function hasAnimal(name) {
  const normalizedName = normalizeAnimal(name);
  return state.animals.some((animal) => normalizeAnimal(animal) === normalizedName);
}

function sortAnimals() {
  state.animals = [...new Set(state.animals.map(toTitleCase))].sort((a, b) => (
    a.localeCompare(b, "de")
  ));
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
  const number = Math.floor(10 + Math.random() * 90);
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
