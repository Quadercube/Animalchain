// js/app.js

const ANIMALCHAIN_CONFIG = {
  supabaseUrl: "https://xbncxguszajafewaullp.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhibmN4Z3VzemFqYWZld2F1bGxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTMyMjIsImV4cCI6MjA5MzA2OTIyMn0.SmsP4udyYq9SSbVj-70_CyqlkPjyS2lzUM5jhFtRSPQ"
};

const LOCAL_ANIMALS_KEY = "animalchain_local_animals_v3_strict";

const supabaseClient = window.supabase
  ? window.supabase.createClient(ANIMALCHAIN_CONFIG.supabaseUrl, ANIMALCHAIN_CONFIG.supabaseKey, {
      realtime: { params: { eventsPerSecond: 10 } }
    })
  : null;

const page = document.body.dataset.page;
console.log("Animalchain app.js v11 (Hardened) geladen");

if (page === "practice") initPracticePage();
if (page === "online") initOnlinePage();
if (page === "local") initLocalPage();

async function loadApprovedAnimals() {
  ensureSupabase();
  let allAnimals = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseClient
      .from("animals")
      .select("id, name, normalized_name, first_letter, last_letter, status")
      .eq("status", "approved")
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Tierdatenbank konnte nicht geladen werden: ${error.message}`);
    if (!data || data.length === 0) break;
    allAnimals = allAnimals.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return mergeAnimals(allAnimals, loadLocalAnimals());
}

function generateLobbyCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[arr[i] % chars.length];
  return code;
}

// === GEÄNDERT: createGame nutzt jetzt RPC statt direktem INSERT ===
async function createGame({ code, guestName, timerEnabled, turnSeconds }) {
  ensureSupabase();
  const { data, error } = await supabaseClient.rpc("create_game", {
    p_code: code,
    p_guest_name: guestName,
    p_timer_enabled: timerEnabled,
    p_turn_seconds: turnSeconds
  });
  if (error) throw new Error(`Lobby konnte nicht erstellt werden: ${error.message}`);
  return {
    game: data.game,
    player: data.player,
    hostSecret: data.host_secret,
    playerSecret: data.player_secret
  };
}

// === GEÄNDERT: nutzt View statt Tabelle ===
async function findGameByCode(code) {
  ensureSupabase();
  const { data, error } = await supabaseClient
    .from("games_public").select("*").eq("code", normalizeLobbyCode(code)).single();
  if (error) throw new Error("Lobby wurde nicht gefunden.");
  return data;
}

// === GEÄNDERT: nutzt View statt Tabelle ===
async function loadGameById(gameId) {
  ensureSupabase();
  const { data, error } = await supabaseClient
    .from("games_public").select("*").eq("id", gameId).single();
  if (error) throw new Error(`Lobby konnte nicht geladen werden: ${error.message}`);
  return data;
}

// === GEÄNDERT: nutzt View statt Tabelle ===
async function loadGamePlayers(gameId) {
  ensureSupabase();
  const { data, error } = await supabaseClient
    .from("game_players_public").select("*").eq("game_id", gameId).order("turn_order", { ascending: true });
  if (error) throw new Error(`Spieler konnten nicht geladen werden: ${error.message}`);
  return data || [];
}

async function loadGameMoves(gameId) {
  ensureSupabase();
  const { data, error } = await supabaseClient
    .from("moves").select("*").eq("game_id", gameId).order("move_number", { ascending: true });
  if (error) throw new Error(`Spielzüge konnten nicht geladen werden: ${error.message}`);
  return data || [];
}

// === GEÄNDERT: joinGame nutzt jetzt RPC statt direktem INSERT ===
async function joinGame(game, guestName) {
  const { data, error } = await supabaseClient.rpc("join_game", {
    p_code: game.code,
    p_guest_name: guestName
  });
  if (error) throw new Error(`Beitritt fehlgeschlagen: ${error.message}`);
  return {
    player: data.player,
    playerSecret: data.player_secret
  };
}

// SICHERE Aktionen via RPC-Functions
async function rpcMakeMove(gameId, playerId, playerSecret, animalName) {
  const { data, error } = await supabaseClient.rpc("make_move", {
    p_game_id: gameId, p_player_id: playerId,
    p_player_secret: playerSecret, p_animal_name: animalName
  });
  if (error) throw new Error(error.message);
  return data;
}

async function rpcStartGame(gameId, hostSecret, animalName) {
  const { data, error } = await supabaseClient.rpc("start_game", {
    p_game_id: gameId, p_host_secret: hostSecret, p_animal_name: animalName
  });
  if (error) throw new Error(error.message);
  return data;
}

async function rpcKickPlayer(gameId, hostSecret, playerId) {
  const { data, error } = await supabaseClient.rpc("kick_player", {
    p_game_id: gameId, p_host_secret: hostSecret, p_player_id: playerId
  });
  if (error) throw new Error(error.message);
  return data;
}

async function rpcSelfEliminate(gameId, playerId, playerSecret) {
  const { data, error } = await supabaseClient.rpc("self_eliminate", {
    p_game_id: gameId, p_player_id: playerId, p_player_secret: playerSecret
  });
  if (error) throw new Error(error.message);
  return data;
}

function initPracticePage() {
  const state = { animals: [], lastAnimal: "Turmfalke", requiredLetter: "e", moves: [] };
  const el = mapElements({
    lastAnimal: "#practiceLastAnimal", requiredLetter: "#practiceRequiredLetter",
    moveCount: "#practiceMoveCount", animalForm: "#practiceAnimalForm",
    animalInput: "#practiceAnimalInput", message: "#practiceMessage",
    hintButton: "#practiceHintButton", newRoundButton: "#practiceNewRoundButton",
    movesList: "#practiceMovesList"
  });

  el.animalForm.addEventListener("submit", handleMove);
  el.hintButton.addEventListener("click", showHint);
  el.newRoundButton.addEventListener("click", () => startNewRound(true));
  start();

  async function start() {
    try {
      state.animals = await loadApprovedAnimals();
      if (!state.animals.length) { setMessage(el.message, "Keine Tiere in Supabase gefunden.", "warning"); render(); return; }
      startNewRound(false);
      setMessage(el.message, `${state.animals.length} Tiere geladen. Du bist dran.`, "success");
    } catch (error) { setMessage(el.message, error.message, "error"); }
    render();
  }

  function startNewRound(showMessage) {
    const animal = randomItem(state.animals) || { name: "Turmfalke" };
    state.lastAnimal = animal.name;
    state.requiredLetter = getLastLetter(animal.name);
    state.moves = [];
    render();
    if (showMessage) setMessage(el.message, `Neue Runde. Starttier: ${state.lastAnimal}`, "success");
  }

  async function handleMove(event) {
    event.preventDefault();
    const animalName = cleanAnimalName(el.animalInput.value);
    const validation = validatePracticeAnimal(animalName);
    if (!validation.ok) { setMessage(el.message, validation.message, validation.type); return; }
    addMove("Du", animalName);
    el.animalInput.value = "";
    render();
    await sleep(450);
    computerMove();
  }

  function computerMove() {
    const options = availableAnimals(state.animals, state.requiredLetter, state.moves.map((m) => m.animal));
    if (!options.length) {
      setMessage(el.message, `Der Computer findet kein Tier mit ${state.requiredLetter.toUpperCase()}. Du gewinnst!`, "success");
      return;
    }
    const animal = randomItem(options);
    addMove("Computer", animal.name);
    render();
    setMessage(el.message, `Computer spielt: ${animal.name}. Jetzt brauchst du ${state.requiredLetter.toUpperCase()}.`, "success");
  }

  function validatePracticeAnimal(animalName) {
    const normalized = normalizeAnimalName(animalName);
    if (!animalName) return { ok: false, type: "warning", message: "Bitte gib ein Tier ein." };
    if (getFirstLetter(normalized) !== state.requiredLetter)
      return { ok: false, type: "error", message: `Dein Tier muss mit ${state.requiredLetter.toUpperCase()} anfangen.` };
    if (!findAnimal(state.animals, animalName))
      return { ok: false, type: "error", message: `"${animalName}" ist nicht in deiner Tierliste.` };
    if (state.moves.some((m) => normalizeAnimalName(m.animal) === normalized))
      return { ok: false, type: "error", message: `"${animalName}" wurde schon gespielt.` };
    return { ok: true };
  }

  function addMove(playerName, animalName) {
    state.moves.push({ playerName, animal: toTitleCase(animalName) });
    state.lastAnimal = toTitleCase(animalName);
    state.requiredLetter = getLastLetter(animalName);
  }

  function showHint() {
    const options = availableAnimals(state.animals, state.requiredLetter, state.moves.map((m) => m.animal));
    if (!options.length) { setMessage(el.message, `Kein Tipp für ${state.requiredLetter.toUpperCase()} gefunden.`, "warning"); return; }
    setMessage(el.message, `Tipp: ${randomItem(options).name}`, "success");
  }

  function render() {
    el.lastAnimal.textContent = state.lastAnimal || "---";
    el.requiredLetter.textContent = state.requiredLetter ? state.requiredLetter.toUpperCase() : "---";
    el.moveCount.textContent = String(state.moves.length);
    el.movesList.innerHTML = state.moves.length
      ? state.moves.map((m) => `<li><strong>${escapeHtml(m.animal)}</strong><span class="hint">von ${escapeHtml(m.playerName)}</span></li>`).join("")
      : `<li><strong>${escapeHtml(state.lastAnimal)}</strong><span class="hint">Starttier</span></li>`;
  }
}

function initOnlinePage() {
  const state = {
    animals: [], guestName: "Gast",
    game: null, localPlayer: null,
    hostSecret: null, playerSecret: null,
    isHost: false,
    players: [], moves: [],
    countdownTimer: null, realtimeChannel: null, fallbackTimer: null,
    lastSeenTurnKey: null, localTurnStartedAt: null
  };

  const el = mapElements({
    nameForm: "#onlineNameForm", guestName: "#onlineGuestName",
    timerEnabled: "#onlineTimerEnabled", turnSeconds: "#onlineTurnSeconds",
    createLobbyButton: "#onlineCreateLobbyButton",
    lobbyTicket: "#onlineLobbyTicket", lobbyCode: "#onlineLobbyCode",
    copyCodeButton: "#onlineCopyCodeButton",
    joinForm: "#onlineJoinForm", joinCode: "#onlineJoinCode",
    message: "#onlineMessage",
    lastAnimal: "#onlineLastAnimal", requiredLetter: "#onlineRequiredLetter",
    timerDisplay: "#onlineTimerDisplay", turnBadge: "#onlineTurnBadge",
    moveForm: "#onlineMoveForm", animalInput: "#onlineAnimalInput",
    refreshButton: "#onlineRefreshButton", newRoundButton: "#onlineNewRoundButton",
    playersList: "#onlinePlayersList", movesList: "#onlineMovesList"
  });

  const startGameButton = optionalQs("#onlineStartGameButton");
  const localAnimalForm = optionalQs("#onlineLocalAnimalForm");
  const localAnimalInput = optionalQs("#onlineLocalAnimalInput");
  const localAnimalMessage = optionalQs("#onlineLocalAnimalMessage");

  el.nameForm.addEventListener("submit", handleName);
  el.createLobbyButton.addEventListener("click", handleCreateLobby);
  el.copyCodeButton.addEventListener("click", copyLobbyCode);
  el.joinForm.addEventListener("submit", handleJoinLobby);
  el.moveForm.addEventListener("submit", handleMove);
  el.refreshButton.addEventListener("click", refreshLobby);
  el.newRoundButton.addEventListener("click", newRound);
  if (startGameButton) startGameButton.addEventListener("click", handleStartGame);
  if (localAnimalForm && localAnimalInput && localAnimalMessage) {
    localAnimalForm.addEventListener("submit", handleAddLocalAnimal);
  }

  el.playersList.addEventListener("click", async (event) => {
    const kickButton = event.target.closest(".kick-button");
    if (!kickButton) return;
    const playerId = kickButton.dataset.playerId;
    const playerName = kickButton.dataset.playerName;
    if (!playerId) return;
    if (!confirm(`${playerName} wirklich aus der Lobby entfernen?`)) return;
    try {
      await rpcKickPlayer(state.game.id, state.hostSecret, playerId);
      setMessage(el.message, `${playerName} wurde aus der Lobby entfernt.`, "success");
    } catch (error) { setMessage(el.message, error.message, "error"); }
  });

  start();

  async function start() {
    try {
      state.animals = await loadApprovedAnimals();
      setMessage(el.message, `${state.animals.length} Tiere geladen. Erstelle eine Lobby oder tritt einer bei.`, "success");
    } catch (error) { setMessage(el.message, error.message, "error"); }
    render();
  }

  function handleName(event) {
    event.preventDefault();
    state.guestName = cleanPlayerName(el.guestName.value) || "Gast";
    setMessage(el.message, `Name gesetzt: ${state.guestName}`, "success");
  }

  function handleAddLocalAnimal(event) {
    event.preventDefault();
    try {
      const animalName = cleanAnimalName(localAnimalInput.value);
      const normalized = normalizeAnimalName(animalName);
      if (!animalName) { localAnimalMessage.textContent = "Bitte gib ein Tier ein."; return; }
      if (normalized.length < 3) { localAnimalMessage.textContent = "Der Tiername ist zu kurz."; return; }
      if (!/^[a-zäöüßA-ZÄÖÜ\s-]+$/.test(animalName)) {
        localAnimalMessage.textContent = "Bitte nur Buchstaben, Leerzeichen oder Bindestrich verwenden."; return;
      }
      const localAnimal = addLocalAnimal(animalName);
      state.animals = mergeAnimals(state.animals, [localAnimal]);
      localAnimalInput.value = "";
      localAnimalMessage.textContent = `"${toTitleCase(animalName)}" wurde lokal hinzugefügt.`;
      setMessage(el.message, `"${toTitleCase(animalName)}" ist jetzt lokal spielbar.`, "success");
    } catch (error) { localAnimalMessage.textContent = error.message; }
  }

  async function handleCreateLobby() {
    try {
      const code = generateLobbyCode();
      const { game, player, hostSecret, playerSecret } = await createGame({
        code, guestName: state.guestName,
        timerEnabled: el.timerEnabled.checked,
        turnSeconds: Number(el.turnSeconds.value || 60)
      });
      state.game = game;
      state.localPlayer = player;
      state.hostSecret = hostSecret;
      state.playerSecret = playerSecret;
      state.isHost = true;
      state.players = [player];
      state.moves = [];
      el.lobbyTicket.hidden = false;
      el.lobbyCode.textContent = code;
      subscribeToGame(game.id);
      startCountdownTimer();
      render();
      setMessage(el.message, `Lobby ${code} erstellt. Du bist der Host.`, "success");
    } catch (error) { setMessage(el.message, error.message, "error"); }
  }

  async function handleJoinLobby(event) {
    event.preventDefault();
    try {
      const game = await findGameByCode(el.joinCode.value);
      const { player, playerSecret } = await joinGame(game, state.guestName);
      state.game = game;
      state.localPlayer = player;
      state.playerSecret = playerSecret;
      state.hostSecret = null;
      state.isHost = false;
      el.lobbyTicket.hidden = false;
      el.lobbyCode.textContent = game.code;
      await refreshLobby();
      subscribeToGame(game.id);
      startCountdownTimer();
      setMessage(el.message, `Du bist Lobby ${game.code} beigetreten. Warte bis der Host startet.`, "success");
    } catch (error) { setMessage(el.message, error.message, "error"); }
  }

  async function handleStartGame() {
    if (!state.game?.id) { setMessage(el.message, "Du bist in keiner Lobby.", "warning"); return; }
    if (!state.isHost || !state.hostSecret) { setMessage(el.message, "Nur der Host kann starten.", "warning"); return; }
    if (state.players.length < 2) { setMessage(el.message, "Du brauchst mindestens 2 Spieler.", "warning"); return; }
    try {
      const animal = randomItem(state.animals) || { name: "Turmfalke" };
      await rpcStartGame(state.game.id, state.hostSecret, animal.name);
      state.lastSeenTurnKey = null;
      state.localTurnStartedAt = null;
      await refreshLobby();
      setMessage(el.message, `Spiel gestartet! Starttier: ${animal.name}`, "success");
    } catch (error) { setMessage(el.message, error.message, "error"); }
  }

  async function copyLobbyCode() {
    if (!state.game?.code) return;
    try {
      await navigator.clipboard.writeText(state.game.code);
      setMessage(el.message, "Lobby-Code kopiert.", "success");
    } catch {
      setMessage(el.message, "Kopieren ging nicht. Markiere den Code manuell.", "warning");
    }
  }

  function subscribeToGame(gameId) {
    if (state.realtimeChannel) supabaseClient.removeChannel(state.realtimeChannel);
    state.realtimeChannel = supabaseClient
      .channel(`game-${gameId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        async () => { await refreshLobby(); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${gameId}` },
        async (payload) => {
          if (payload.eventType === "DELETE" && payload.old?.id === state.localPlayer?.id) {
            handleKickedOut(); return;
          }
          state.players = await loadGamePlayers(gameId);
          render();
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "moves", filter: `game_id=eq.${gameId}` },
        async () => { state.moves = await loadGameMoves(gameId); render(); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && state.fallbackTimer) {
          clearInterval(state.fallbackTimer); state.fallbackTimer = null;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          startFallbackPolling();
        }
      });
    setTimeout(() => { if (!state.fallbackTimer) startFallbackPolling(); }, 2000);
  }

  function handleKickedOut() {
    setMessage(el.message, "Du wurdest aus der Lobby entfernt.", "warning");
    if (state.realtimeChannel) { supabaseClient.removeChannel(state.realtimeChannel); state.realtimeChannel = null; }
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    if (state.fallbackTimer) clearInterval(state.fallbackTimer);
    state.game = null; state.localPlayer = null;
    state.hostSecret = null; state.playerSecret = null;
    state.isHost = false; state.players = []; state.moves = [];
    el.lobbyTicket.hidden = true;
    render();
  }

  function startFallbackPolling() {
    if (state.fallbackTimer) return;
    state.fallbackTimer = setInterval(refreshLobby, 1500);
  }

  async function refreshLobby() {
    if (!state.game?.id) return;
    try {
      const [game, players, moves] = await Promise.all([
        loadGameById(state.game.id),
        loadGamePlayers(state.game.id),
        loadGameMoves(state.game.id)
      ]);
      if (state.localPlayer && !players.some(p => p.id === state.localPlayer.id)) {
        handleKickedOut(); return;
      }
      state.game = game; state.players = players; state.moves = moves;
      render();
    } catch (error) { console.error("Refresh-Fehler:", error); }
  }

  async function checkLocalTimerExpiration() {
    if (!state.game?.timer_enabled || state.game?.status !== "playing") return;
    const currentPlayer = getCurrentOnlinePlayer();
    if (!currentPlayer || currentPlayer.is_eliminated) return;
    if (state.localPlayer?.id !== currentPlayer.id) return;
    const remaining = getRemainingSeconds();
    if (remaining === null || remaining > 0) return;
    const activePlayers = state.players.filter((p) => !p.is_eliminated);
    if (activePlayers.length <= 1) return;
    try {
      await rpcSelfEliminate(state.game.id, state.localPlayer.id, state.playerSecret);
      setMessage(el.message, `Deine Zeit ist abgelaufen!`, "warning");
    } catch (err) { console.error(err); }
  }

  async function handleMove(event) {
    event.preventDefault();
    if (!state.game || !state.localPlayer) { setMessage(el.message, "Du bist in keiner Lobby.", "warning"); return; }
    if (state.game.status !== "playing") { setMessage(el.message, "Das Spiel hat noch nicht gestartet.", "warning"); return; }
    const currentPlayer = getCurrentOnlinePlayer();
    if (!currentPlayer || currentPlayer.id !== state.localPlayer.id) {
      setMessage(el.message, "Du bist gerade nicht dran.", "warning"); return;
    }
    if (currentPlayer.is_eliminated) {
      setMessage(el.message, "Du bist ausgeschieden und kannst nur noch zuschauen.", "warning"); return;
    }
    const animalName = cleanAnimalName(el.animalInput.value);
    if (!animalName) { setMessage(el.message, "Bitte gib ein Tier ein.", "warning"); return; }
    if (animalName.length > 60) { setMessage(el.message, "Tiername zu lang.", "warning"); return; }
    if (!/^[a-zäöüßA-ZÄÖÜ\s-]+$/.test(animalName)) {
      setMessage(el.message, "Bitte nur Buchstaben, Leerzeichen oder Bindestrich verwenden.", "warning"); return;
    }
    try {
      await rpcMakeMove(state.game.id, state.localPlayer.id, state.playerSecret, animalName);
      el.animalInput.value = "";
      await refreshLobby();
      setMessage(el.message, `${state.guestName} spielt: ${toTitleCase(animalName)}`, "success");
    } catch (error) { setMessage(el.message, error.message, "error"); }
  }

  async function newRound() {
    if (!state.game?.id) { setMessage(el.message, "Du bist in keiner Lobby.", "warning"); return; }
    if (!state.isHost || !state.hostSecret) { setMessage(el.message, "Nur der Host kann neue Runden starten.", "warning"); return; }
    if (state.players.length < 2) { setMessage(el.message, "Du brauchst mindestens 2 Spieler.", "warning"); return; }
    try {
      const animal = randomItem(state.animals) || { name: "Turmfalke" };
      await rpcStartGame(state.game.id, state.hostSecret, animal.name);
      state.lastSeenTurnKey = null;
      state.localTurnStartedAt = null;
      await refreshLobby();
      setMessage(el.message, `Neue Runde gestartet. Starttier: ${animal.name}`, "success");
    } catch (error) { setMessage(el.message, error.message, "error"); }
  }

  function startCountdownTimer() {
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    state.countdownTimer = setInterval(() => {
      renderTimerOnly();
      checkLocalTimerExpiration();
    }, 250);
  }

  function getCurrentOnlinePlayer() {
    return state.players.find((p) => p.turn_order === state.game?.current_turn_order) || null;
  }

  function getRemainingSeconds() {
    if (!state.game?.timer_enabled || !state.game?.turn_started_at || state.game?.status !== "playing") return null;
    const turnKey = `${state.game.id}-${state.game.current_turn_order}-${state.game.turn_started_at}`;
    if (state.lastSeenTurnKey !== turnKey) {
      state.lastSeenTurnKey = turnKey;
      state.localTurnStartedAt = Date.now();
    }
    const elapsed = Math.floor((Date.now() - state.localTurnStartedAt) / 1000);
    return Math.max(0, Number(state.game.turn_seconds || 60) - elapsed);
  }

  function getTimerDisplayText() {
    if (!state.game) return "—";
    if (!state.game.timer_enabled) return "Aus";
    const status = state.game.status;
    if (status === "waiting") return "Wartend";
    if (status === "finished") return "Beendet";
    if (status === "playing") {
      const remaining = getRemainingSeconds();
      if (remaining === null) return "Wartend";
      return formatTimer(remaining);
    }
    return "—";
  }

  let lastTimerText = "";
  function renderTimerOnly() {
    if (!state.game) return;
    const newText = getTimerDisplayText();
    if (newText !== lastTimerText) {
      el.timerDisplay.textContent = newText;
      lastTimerText = newText;
    }
  }

  function render() {
    const currentPlayer = getCurrentOnlinePlayer();
    const activePlayers = state.players.filter((p) => !p.is_eliminated);

    el.lastAnimal.textContent = state.game?.last_animal || "---";
    el.requiredLetter.textContent = state.game?.current_required_letter
      ? state.game.current_required_letter.toUpperCase() : "---";

    renderTimerOnly();

    if (!state.game) el.turnBadge.textContent = "Keine aktive Lobby";
    else if (state.game.status === "waiting")
      el.turnBadge.textContent = `Lobby wartet · ${state.players.length} Spieler${state.isHost ? " · Du bist Host" : ""}`;
    else if (state.game.status === "finished") el.turnBadge.textContent = "Spiel beendet";
    else if (currentPlayer)
      el.turnBadge.textContent = `${currentPlayer.guest_name} ist dran${currentPlayer.is_eliminated ? " · ausgeschieden" : ""}`;
    else el.turnBadge.textContent = "Warte...";

    if (startGameButton) {
      if (state.isHost && state.game?.status === "waiting" && state.players.length >= 2) {
        startGameButton.hidden = false; startGameButton.textContent = "Spiel starten";
      } else if (state.isHost && state.game?.status === "finished") {
        startGameButton.hidden = false; startGameButton.textContent = "Erneut spielen";
      } else { startGameButton.hidden = true; }
    }

    el.playersList.innerHTML = state.players.length
      ? state.players.map((p) => {
          const isMe = p.id === state.localPlayer?.id;
          const canKick = state.isHost && !isMe && state.game?.status === "waiting";
          return `
            <article class="player-row ${p.is_eliminated ? "eliminated" : ""}">
              <div>
                <strong>${escapeHtml(p.guest_name)}</strong>
                <div class="meta">Spieler ${p.turn_order}${isMe ? " · Du" : ""}${p.turn_order === 1 ? " · Host" : ""}</div>
              </div>
              <div style="display: flex; gap: 8px; align-items: center;">
                ${ p.is_eliminated ? `<span class="pill danger">Raus</span>`
                  : state.game?.status === "waiting" ? `<span class="pill">Bereit</span>`
                  : p.turn_order === state.game?.current_turn_order ? `<span class="pill success">Dran</span>`
                  : `<span class="pill">Aktiv</span>` }
                ${canKick ? `<button class="kick-button button ghost" data-player-id="${p.id}" data-player-name="${escapeHtml(p.guest_name)}" style="padding: 4px 10px; font-size: 13px;">Kick</button>` : ""}
              </div>
            </article>`;
        }).join("")
      : `<p class="hint">Noch keine Spieler.</p>`;

    el.movesList.innerHTML = state.moves.length
      ? state.moves.map((m) => `<li><strong>${escapeHtml(m.animal_name)}</strong><span class="hint">von ${escapeHtml(m.guest_name || "Gast")}</span></li>`).join("")
      : `<li><strong>${escapeHtml(state.game?.last_animal || "Turmfalke")}</strong><span class="hint">Starttier</span></li>`;

    if (state.game?.status === "playing" && activePlayers.length === 1 && state.players.length > 1) {
      setMessage(el.message, `${activePlayers[0].guest_name} gewinnt! Drücke "Neue Runde" um nochmal zu spielen.`, "success");
    }
  }
}

function initLocalPage() {
  const state = {
    animals: [], players: [], moves: [],
    lastAnimal: "Turmfalke", requiredLetter: "e",
    turnIndex: 0, started: false
  };

  const el = mapElements({
    playerForm: "#localPlayerForm", playerName: "#localPlayerName",
    startButton: "#localStartButton", playersList: "#localPlayersList",
    message: "#localMessage", lastAnimal: "#localLastAnimal",
    requiredLetter: "#localRequiredLetter", moveCount: "#localMoveCount",
    turnBadge: "#localTurnBadge", moveForm: "#localMoveForm",
    animalInput: "#localAnimalInput", movesList: "#localMovesList"
  });

  el.playerForm.addEventListener("submit", addPlayer);
  el.startButton.addEventListener("click", startRound);
  el.moveForm.addEventListener("submit", handleMove);
  start();

  async function start() {
    try {
      state.animals = await loadApprovedAnimals();
      setMessage(el.message, `${state.animals.length} Tiere geladen. Füge Spieler hinzu.`, "success");
    } catch (error) { setMessage(el.message, error.message, "error"); }
    render();
  }

  function addPlayer(event) {
    event.preventDefault();
    const name = cleanPlayerName(el.playerName.value);
    if (!name) { setMessage(el.message, "Bitte gib einen Spielernamen ein.", "warning"); return; }
    state.players.push({ id: crypto.randomUUID(), name });
    el.playerName.value = "";
    render();
  }

  function startRound() {
    if (state.players.length < 2) { setMessage(el.message, "Du brauchst mindestens 2 Spieler.", "warning"); return; }
    const animal = randomItem(state.animals) || { name: "Turmfalke" };
    state.lastAnimal = animal.name;
    state.requiredLetter = getLastLetter(animal.name);
    state.moves = []; state.turnIndex = 0; state.started = true;
    setMessage(el.message, `Runde gestartet. Starttier: ${animal.name}`, "success");
    render();
  }

  function handleMove(event) {
    event.preventDefault();
    if (!state.started) { setMessage(el.message, "Starte zuerst eine Runde.", "warning"); return; }
    const animalName = cleanAnimalName(el.animalInput.value);
    const validation = validateLocalAnimal(animalName);
    if (!validation.ok) { setMessage(el.message, validation.message, validation.type); return; }
    const player = state.players[state.turnIndex];
    state.moves.push({ playerName: player.name, animal: toTitleCase(animalName) });
    state.lastAnimal = toTitleCase(animalName);
    state.requiredLetter = getLastLetter(animalName);
    state.turnIndex = (state.turnIndex + 1) % state.players.length;
    el.animalInput.value = "";
    setMessage(el.message, `${player.name} spielt ${toTitleCase(animalName)}.`, "success");
    render();
  }

  function validateLocalAnimal(animalName) {
    const normalized = normalizeAnimalName(animalName);
    if (!animalName) return { ok: false, type: "warning", message: "Bitte gib ein Tier ein." };
    if (getFirstLetter(normalized) !== state.requiredLetter)
      return { ok: false, type: "error", message: `Das Tier muss mit ${state.requiredLetter.toUpperCase()} anfangen.` };
    if (!findAnimal(state.animals, animalName))
      return { ok: false, type: "error", message: `"${animalName}" ist nicht in deiner Tierliste.` };
    if (state.moves.some((m) => normalizeAnimalName(m.animal) === normalized))
      return { ok: false, type: "error", message: `"${animalName}" wurde schon gespielt.` };
    return { ok: true };
  }

  function render() {
    el.playersList.innerHTML = state.players.length
      ? state.players.map((p, i) => `
          <article class="player-row">
            <div><strong>${escapeHtml(p.name)}</strong><div class="meta">Spieler ${i + 1}</div></div>
            ${state.started && i === state.turnIndex ? `<span class="pill success">Dran</span>` : `<span class="pill">Dabei</span>`}
          </article>`).join("")
      : `<p class="hint">Noch keine Spieler.</p>`;

    el.lastAnimal.textContent = state.lastAnimal || "---";
    el.requiredLetter.textContent = state.requiredLetter ? state.requiredLetter.toUpperCase() : "---";
    el.moveCount.textContent = String(state.moves.length);
    el.turnBadge.textContent = state.started ? `${state.players[state.turnIndex].name} ist dran` : "Noch keine Runde";

    el.movesList.innerHTML = state.moves.length
      ? state.moves.map((m) => `<li><strong>${escapeHtml(m.animal)}</strong><span class="hint">von ${escapeHtml(m.playerName)}</span></li>`).join("")
      : `<li><strong>${escapeHtml(state.lastAnimal)}</strong><span class="hint">Starttier</span></li>`;
  }
}

function loadLocalAnimals() {
  try { const animals = JSON.parse(localStorage.getItem(LOCAL_ANIMALS_KEY)); return Array.isArray(animals) ? animals : []; }
  catch { return []; }
}

function saveLocalAnimals(animals) { localStorage.setItem(LOCAL_ANIMALS_KEY, JSON.stringify(animals)); }

function createLocalAnimal(name) {
  const cleanName = cleanAnimalName(name);
  const normalizedName = normalizeAnimalName(cleanName);
  return {
    id: `local-${normalizedName}`, name: toTitleCase(cleanName),
    normalized_name: normalizedName,
    first_letter: getFirstLetter(normalizedName), last_letter: getLastLetter(normalizedName),
    status: "approved", local: true
  };
}

function addLocalAnimal(name) {
  const animal = createLocalAnimal(name);
  if (!animal.normalized_name || !animal.first_letter || !animal.last_letter) {
    throw new Error("Dieses Tier kann nicht lokal gespeichert werden.");
  }
  const localAnimals = loadLocalAnimals();
  if (!localAnimals.some((item) => item.normalized_name === animal.normalized_name)) {
    localAnimals.push(animal); saveLocalAnimals(localAnimals);
  }
  return animal;
}

function mergeAnimals(databaseAnimals, localAnimals) {
  const animalsByName = new Map();
  [...databaseAnimals, ...localAnimals].forEach((animal) => {
    if (!animal) return;
    const normalized = animal.normalized_name || normalizeAnimalName(animal.name);
    if (!normalized) return;
    animalsByName.set(normalized, {
      ...animal, normalized_name: normalized,
      first_letter: animal.first_letter || getFirstLetter(animal.name),
      last_letter: animal.last_letter || getLastLetter(animal.name)
    });
  });
  return [...animalsByName.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function ensureSupabase() {
  if (!supabaseClient) throw new Error("Supabase konnte nicht geladen werden.");
  if (!ANIMALCHAIN_CONFIG.supabaseKey || ANIMALCHAIN_CONFIG.supabaseKey.includes("DEIN_PUBLIC")) {
    throw new Error("Bitte trage deinen Supabase Public/Publishable Key in js/app.js ein.");
  }
}

function mapElements(selectors) {
  return Object.fromEntries(Object.entries(selectors).map(([key, selector]) => [key, qs(selector)]));
}

function qs(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Element fehlt: ${selector}`);
  return element;
}

function optionalQs(selector) { return document.querySelector(selector); }

function findAnimal(animals, animalName) {
  const normalized = normalizeAnimalName(animalName);
  return animals.some((animal) => {
    if (!animal) return false;
    const animalNormalized = animal.normalized_name || normalizeAnimalName(animal.name);
    return animalNormalized === normalized;
  });
}

function availableAnimals(animals, firstLetter, usedNames = []) {
  const used = new Set(usedNames.map(normalizeAnimalName));
  const letter = String(firstLetter || "").toLowerCase();
  return animals.filter((animal) => {
    const animalFirst = animal.first_letter || getFirstLetter(animal.name);
    const animalNormalized = animal.normalized_name || normalizeAnimalName(animal.name);
    return animalFirst === letter && !used.has(animalNormalized);
  });
}

function cleanPlayerName(value) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, 24); }
function cleanAnimalName(value) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, 60); }

function normalizeAnimalName(value) {
  return String(value || "")
    .trim().toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s-]/g, "").replace(/\s+/g, " ");
}

function getFirstLetter(value) { return normalizeAnimalName(value).replace(/[^a-z]/g, "").charAt(0) || ""; }

function getLastLetter(value) {
  const letters = normalizeAnimalName(value).replace(/[^a-z]/g, "");
  return letters.charAt(letters.length - 1) || "";
}

function normalizeLobbyCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function formatTimer(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function toTitleCase(value) {
  return String(value || "").trim().toLowerCase().split(" ")
    .map((p) => p ? p.charAt(0).toUpperCase() + p.slice(1) : "").join(" ");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  }[c]));
}

function randomItem(items) { return items[Math.floor(Math.random() * items.length)]; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}
