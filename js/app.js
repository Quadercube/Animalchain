// js/app.js

const ANIMALCHAIN_CONFIG = {
  supabaseUrl: "https://xbncxguszajafewaullp.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhibmN4Z3VzemFqYWZld2F1bGxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTMyMjIsImV4cCI6MjA5MzA2OTIyMn0.SmsP4udyYq9SSbVj-70_CyqlkPjyS2lzUM5jhFtRSPQ"
};

const LOCAL_ANIMALS_KEY = "animalchain_local_animals_v3_strict";

const supabaseClient = window.supabase
  ? window.supabase.createClient(ANIMALCHAIN_CONFIG.supabaseUrl, ANIMALCHAIN_CONFIG.supabaseKey)
  : null;

const page = document.body.dataset.page;

console.log("Animalchain app.js STRICT v5 geladen");

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

    if (error) {
      throw new Error(`Tierdatenbank konnte nicht geladen werden: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    allAnimals = allAnimals.concat(data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log("Insgesamt aus Supabase geladen:", allAnimals.length, "Tiere");

  return mergeAnimals(allAnimals, loadLocalAnimals());
}

async function createGame({ code, guestName, timerEnabled, turnSeconds }) {
  ensureSupabase();

  const { data: game, error: gameError } = await supabaseClient
    .from("games")
    .insert({
      code,
      status: "waiting",
      max_players: 4,
      last_animal: "Turmfalke",
      current_required_letter: "e",
      current_turn_order: 1,
      timer_enabled: timerEnabled,
      turn_seconds: turnSeconds,
      turn_started_at: null
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
      guest_name: cleanPlayerName(guestName),
      turn_order: 1,
      is_eliminated: false
    })
    .select()
    .single();

  if (playerError) {
    throw new Error(`Spieler konnte nicht erstellt werden: ${playerError.message}`);
  }

  return { game, player };
}

async function findGameByCode(code) {
  ensureSupabase();

  const { data, error } = await supabaseClient
    .from("games")
    .select("*")
    .eq("code", normalizeLobbyCode(code))
    .single();

  if (error) {
    throw new Error("Lobby wurde nicht gefunden.");
  }

  return data;
}

async function loadGameById(gameId) {
  ensureSupabase();

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
  ensureSupabase();

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

async function loadGameMoves(gameId) {
  ensureSupabase();

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

async function joinGame(game, guestName) {
  const players = await loadGamePlayers(game.id);

  if (players.length >= game.max_players) {
    throw new Error("Diese Lobby ist voll.");
  }

  const { data: player, error } = await supabaseClient
    .from("game_players")
    .insert({
      game_id: game.id,
      user_id: null,
      guest_name: cleanPlayerName(guestName),
      turn_order: players.length + 1,
      is_eliminated: false
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Beitritt fehlgeschlagen: ${error.message}`);
  }

  // KEIN Auto-Start - Status bleibt "waiting" bis Host startet
  return player;
}

async function saveMove({
  gameId,
  gamePlayerId,
  guestName,
  animalName,
  requiredLetter,
  moveNumber
}) {
  ensureSupabase();

  const cleanAnimal = cleanAnimalName(animalName);
  const normalizedAnimal = normalizeAnimalName(cleanAnimal);
  const nextRequiredLetter = getLastLetter(normalizedAnimal);

  const { data, error } = await supabaseClient
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

  return data;
}

async function updateGameAfterMove(gameId, animalName, nextRequiredLetter, nextTurnOrder) {
  ensureSupabase();

  const { error } = await supabaseClient
    .from("games")
    .update({
      last_animal: toTitleCase(animalName),
      current_required_letter: String(nextRequiredLetter || "").toLowerCase(),
      current_turn_order: nextTurnOrder,
      turn_started_at: new Date().toISOString(),
      status: "playing"
    })
    .eq("id", gameId);

  if (error) {
    throw new Error(`Lobby konnte nicht aktualisiert werden: ${error.message}`);
  }
}

async function eliminatePlayer(playerId) {
  ensureSupabase();

  const { error } = await supabaseClient
    .from("game_players")
    .update({
      is_eliminated: true,
      eliminated_at: new Date().toISOString()
    })
    .eq("id", playerId);

  if (error) {
    throw new Error(`Spieler konnte nicht eliminiert werden: ${error.message}`);
  }
}

async function updateGameTurn(gameId, nextTurnOrder, status = "playing") {
  ensureSupabase();

  const { error } = await supabaseClient
    .from("games")
    .update({
      current_turn_order: nextTurnOrder,
      turn_started_at: new Date().toISOString(),
      status
    })
    .eq("id", gameId);

  if (error) {
    throw new Error(`Spielstand konnte nicht aktualisiert werden: ${error.message}`);
  }
}

function initPracticePage() {
  const state = {
    animals: [],
    lastAnimal: "Turmfalke",
    requiredLetter: "e",
    moves: []
  };

  const el = mapElements({
    lastAnimal: "#practiceLastAnimal",
    requiredLetter: "#practiceRequiredLetter",
    moveCount: "#practiceMoveCount",
    animalForm: "#practiceAnimalForm",
    animalInput: "#practiceAnimalInput",
    message: "#practiceMessage",
    hintButton: "#practiceHintButton",
    newRoundButton: "#practiceNewRoundButton",
    movesList: "#practiceMovesList"
  });

  el.animalForm.addEventListener("submit", handleMove);
  el.hintButton.addEventListener("click", showHint);
  el.newRoundButton.addEventListener("click", () => startNewRound(true));

  start();

  async function start() {
    try {
      state.animals = await loadApprovedAnimals();

      if (!state.animals.length) {
        setMessage(el.message, "Keine Tiere in Supabase gefunden.", "warning");
        render();
        return;
      }

      startNewRound(false);
      setMessage(el.message, `${state.animals.length} Tiere geladen. Du bist dran.`, "success");
    } catch (error) {
      setMessage(el.message, error.message, "error");
    }

    render();
  }

  function startNewRound(showMessage) {
    const animal = randomItem(state.animals) || { name: "Turmfalke" };

    state.lastAnimal = animal.name;
    state.requiredLetter = getLastLetter(animal.name);
    state.moves = [];

    render();

    if (showMessage) {
      setMessage(el.message, `Neue Runde. Starttier: ${state.lastAnimal}`, "success");
    }
  }

  async function handleMove(event) {
    event.preventDefault();

    const animalName = cleanAnimalName(el.animalInput.value);
    const validation = validatePracticeAnimal(animalName);

    if (!validation.ok) {
      setMessage(el.message, validation.message, validation.type);
      return;
    }

    addMove("Du", animalName);
    el.animalInput.value = "";
    render();

    await sleep(450);
    computerMove();
  }

  function computerMove() {
    const options = availableAnimals(
      state.animals,
      state.requiredLetter,
      state.moves.map((move) => move.animal)
    );

    if (!options.length) {
      setMessage(
        el.message,
        `Der Computer findet kein Tier mit ${state.requiredLetter.toUpperCase()}. Du gewinnst!`,
        "success"
      );
      return;
    }

    const animal = randomItem(options);

    addMove("Computer", animal.name);
    render();
    setMessage(el.message, `Computer spielt: ${animal.name}. Jetzt brauchst du ${state.requiredLetter.toUpperCase()}.`, "success");
  }

  function validatePracticeAnimal(animalName) {
    const normalized = normalizeAnimalName(animalName);

    if (!animalName) {
      return {
        ok: false,
        type: "warning",
        message: "Bitte gib ein Tier ein."
      };
    }

    if (getFirstLetter(normalized) !== state.requiredLetter) {
      return {
        ok: false,
        type: "error",
        message: `Dein Tier muss mit ${state.requiredLetter.toUpperCase()} anfangen.`
      };
    }

    if (!findAnimal(state.animals, animalName)) {
      return {
        ok: false,
        type: "error",
        message: `"${animalName}" ist nicht in deiner Tierliste.`
      };
    }

    if (state.moves.some((move) => normalizeAnimalName(move.animal) === normalized)) {
      return {
        ok: false,
        type: "error",
        message: `"${animalName}" wurde schon gespielt.`
      };
    }

    return { ok: true };
  }

  function addMove(playerName, animalName) {
    state.moves.push({
      playerName,
      animal: toTitleCase(animalName)
    });

    state.lastAnimal = toTitleCase(animalName);
    state.requiredLetter = getLastLetter(animalName);
  }

  function showHint() {
    const options = availableAnimals(
      state.animals,
      state.requiredLetter,
      state.moves.map((move) => move.animal)
    );

    if (!options.length) {
      setMessage(el.message, `Kein Tipp für ${state.requiredLetter.toUpperCase()} gefunden.`, "warning");
      return;
    }

    setMessage(el.message, `Tipp: ${randomItem(options).name}`, "success");
  }

  function render() {
    el.lastAnimal.textContent = state.lastAnimal || "---";
    el.requiredLetter.textContent = state.requiredLetter ? state.requiredLetter.toUpperCase() : "---";
    el.moveCount.textContent = String(state.moves.length);

    el.movesList.innerHTML = state.moves.length
      ? state.moves.map((move) => `
          <li>
            <strong>${escapeHtml(move.animal)}</strong>
            <span class="hint">von ${escapeHtml(move.playerName)}</span>
          </li>
        `).join("")
      : `
          <li>
            <strong>${escapeHtml(state.lastAnimal)}</strong>
            <span class="hint">Starttier</span>
          </li>
        `;
  }
}

function initOnlinePage() {
  const state = {
    animals: [],
    guestName: "Gast",
    game: null,
    localPlayer: null,
    players: [],
    moves: [],
    refreshTimer: null,
    countdownTimer: null
  };

  const el = mapElements({
    nameForm: "#onlineNameForm",
    guestName: "#onlineGuestName",
    timerEnabled: "#onlineTimerEnabled",
    turnSeconds: "#onlineTurnSeconds",
    createLobbyButton: "#onlineCreateLobbyButton",
    lobbyTicket: "#onlineLobbyTicket",
    lobbyCode: "#onlineLobbyCode",
    copyCodeButton: "#onlineCopyCodeButton",
    joinForm: "#onlineJoinForm",
    joinCode: "#onlineJoinCode",
    message: "#onlineMessage",
    lastAnimal: "#onlineLastAnimal",
    requiredLetter: "#onlineRequiredLetter",
    timerDisplay: "#onlineTimerDisplay",
    turnBadge: "#onlineTurnBadge",
    moveForm: "#onlineMoveForm",
    animalInput: "#onlineAnimalInput",
    refreshButton: "#onlineRefreshButton",
    newRoundButton: "#onlineNewRoundButton",
    playersList: "#onlinePlayersList",
    movesList: "#onlineMovesList"
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

  if (startGameButton) {
    startGameButton.addEventListener("click", handleStartGame);
  }

  if (localAnimalForm && localAnimalInput && localAnimalMessage) {
    localAnimalForm.addEventListener("submit", handleAddLocalAnimal);
  }

  start();

  async function start() {
    try {
      state.animals = await loadApprovedAnimals();
      setMessage(el.message, `${state.animals.length} Tiere geladen. Erstelle eine Lobby oder tritt einer bei.`, "success");
    } catch (error) {
      setMessage(el.message, error.message, "error");
    }

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

      if (!animalName) {
        localAnimalMessage.textContent = "Bitte gib ein Tier ein.";
        return;
      }

      if (normalized.length < 3) {
        localAnimalMessage.textContent = "Der Tiername ist zu kurz.";
        return;
      }

      if (!/^[a-zäöüßA-ZÄÖÜ\s-]+$/.test(animalName)) {
        localAnimalMessage.textContent = "Bitte nur Buchstaben, Leerzeichen oder Bindestrich verwenden.";
        return;
      }

      const localAnimal = addLocalAnimal(animalName);
      state.animals = mergeAnimals(state.animals, [localAnimal]);

      localAnimalInput.value = "";
      localAnimalMessage.textContent = `"${toTitleCase(animalName)}" wurde lokal hinzugefügt.`;
      setMessage(el.message, `"${toTitleCase(animalName)}" ist jetzt lokal spielbar.`, "success");
    } catch (error) {
      localAnimalMessage.textContent = error.message;
    }
  }

  async function handleCreateLobby() {
    try {
      const code = generateLobbyCode();

      const { game, player } = await createGame({
        code,
        guestName: state.guestName,
        timerEnabled: el.timerEnabled.checked,
        turnSeconds: Number(el.turnSeconds.value || 60)
      });

      state.game = game;
      state.localPlayer = player;

      el.lobbyTicket.hidden = false;
      el.lobbyCode.textContent = code;

      startAutoRefresh();
      await refreshLobby();

      setMessage(el.message, `Lobby ${code} erstellt. Warte auf Spieler und drücke "Spiel starten".`, "success");
    } catch (error) {
      setMessage(el.message, error.message, "error");
    }
  }

  async function handleJoinLobby(event) {
    event.preventDefault();

    try {
      const game = await findGameByCode(el.joinCode.value);
      const player = await joinGame(game, state.guestName);

      state.game = game;
      state.localPlayer = player;

      el.lobbyTicket.hidden = false;
      el.lobbyCode.textContent = game.code;

      startAutoRefresh();
      await refreshLobby();

      setMessage(el.message, `Du bist Lobby ${game.code} beigetreten. Warte bis der Host startet.`, "success");
    } catch (error) {
      setMessage(el.message, error.message, "error");
    }
  }

  async function handleStartGame() {
    if (!state.game?.id) {
      setMessage(el.message, "Du bist in keiner Lobby.", "warning");
      return;
    }

    if (state.players.length < 2) {
      setMessage(el.message, "Du brauchst mindestens 2 Spieler zum Starten.", "warning");
      return;
    }

    await startNewGameRound("Spiel gestartet!");
  }

  // Zentrale Funktion für neue Runde - löscht alte Moves komplett
  async function startNewGameRound(successPrefix) {
    try {
      // 1. Reaktiviere alle ausgeschiedenen Spieler
      const { error: playersError } = await supabaseClient
        .from("game_players")
        .update({ is_eliminated: false, eliminated_at: null })
        .eq("game_id", state.game.id);

      if (playersError) {
        console.error("Fehler beim Reaktivieren:", playersError);
      }

      // 2. WICHTIG: Lösche ALLE alten Moves - mit Verifikation
      const { error: deleteError } = await supabaseClient
        .from("moves")
        .delete()
        .eq("game_id", state.game.id);

      if (deleteError) {
        console.error("Fehler beim Löschen alter Moves:", deleteError);
        throw new Error("Alte Tiere konnten nicht gelöscht werden: " + deleteError.message);
      }

      // 3. Lokalen State sofort leeren - keine Verzögerung
      state.moves = [];

      // 4. Wähle zufälliges Starttier
      const animal = randomItem(state.animals) || { name: "Turmfalke" };

      // 5. Update game state
      const { error: gameError } = await supabaseClient
        .from("games")
        .update({
          status: "playing",
          last_animal: animal.name,
          current_required_letter: getLastLetter(animal.name),
          current_turn_order: 1,
          turn_started_at: new Date().toISOString()
        })
        .eq("id", state.game.id);

      if (gameError) {
        throw new Error(gameError.message);
      }

      // 6. Reload alles frisch
      await refreshLobby();
      setMessage(el.message, `${successPrefix} Starttier: ${animal.name}`, "success");
    } catch (error) {
      setMessage(el.message, error.message, "error");
    }
  }

  async function copyLobbyCode() {
    if (!state.game?.code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(state.game.code);
      setMessage(el.message, "Lobby-Code kopiert.", "success");
    } catch {
      setMessage(el.message, "Kopieren ging nicht. Markiere den Code manuell.", "warning");
    }
  }

  async function refreshLobby() {
    if (!state.game?.id) {
      return;
    }

    try {
      state.game = await loadGameById(state.game.id);
      state.players = await loadGamePlayers(state.game.id);
      state.moves = await loadGameMoves(state.game.id);

      // Timer nur prüfen wenn das Spiel auch läuft
      if (state.game.timer_enabled && state.game.status === "playing") {
        await checkTimerExpiration();
      }

      render();
    } catch (error) {
      setMessage(el.message, error.message, "error");
    }
  }

  async function checkTimerExpiration() {
    const currentPlayer = getCurrentOnlinePlayer();
    const activePlayers = state.players.filter((player) => !player.is_eliminated);

    if (!currentPlayer || activePlayers.length <= 1 || !state.game.turn_started_at || getRemainingSeconds() > 0) {
      return;
    }

    await eliminatePlayer(currentPlayer.id);

    const updatedPlayers = state.players.map((player) => {
      return player.id === currentPlayer.id
        ? { ...player, is_eliminated: true }
        : player;
    });

    const nextTurnOrder = getNextActiveTurnOrder(updatedPlayers, currentPlayer.turn_order);
    const remainingPlayers = updatedPlayers.filter((player) => !player.is_eliminated);

    await updateGameTurn(
      state.game.id,
      nextTurnOrder || currentPlayer.turn_order,
      remainingPlayers.length <= 1 ? "finished" : "playing"
    );

    state.players = updatedPlayers;
    setMessage(el.message, `${currentPlayer.guest_name} ist wegen Zeitablauf ausgeschieden.`, "warning");
  }

  async function handleMove(event) {
    event.preventDefault();

    if (!state.game || !state.localPlayer) {
      setMessage(el.message, "Du bist in keiner Lobby.", "warning");
      return;
    }

    if (state.game.status !== "playing") {
      setMessage(el.message, "Das Spiel hat noch nicht gestartet.", "warning");
      return;
    }

    const currentPlayer = getCurrentOnlinePlayer();

    if (!currentPlayer || currentPlayer.id !== state.localPlayer.id) {
      setMessage(el.message, "Du bist gerade nicht dran.", "warning");
      return;
    }

    if (currentPlayer.is_eliminated) {
      setMessage(el.message, "Du bist ausgeschieden und kannst nur noch zuschauen.", "warning");
      return;
    }

    const animalName = cleanAnimalName(el.animalInput.value);
    const validation = validateOnlineAnimal(animalName);

    if (!validation.ok) {
      setMessage(el.message, validation.message, validation.type);
      return;
    }

    try {
      const nextRequiredLetter = getLastLetter(animalName);

      await saveMove({
        gameId: state.game.id,
        gamePlayerId: state.localPlayer.id,
        guestName: state.guestName,
        animalName,
        requiredLetter: state.game.current_required_letter,
        moveNumber: state.moves.length + 1
      });

      const nextTurnOrder = getNextActiveTurnOrder(state.players, currentPlayer.turn_order);

      await updateGameAfterMove(
        state.game.id,
        animalName,
        nextRequiredLetter,
        nextTurnOrder || currentPlayer.turn_order
      );

      el.animalInput.value = "";

      await refreshLobby();
      setMessage(el.message, `${state.guestName} spielt: ${toTitleCase(animalName)}`, "success");
    } catch (error) {
      setMessage(el.message, error.message, "error");
    }
  }

  function validateOnlineAnimal(animalName) {
    const normalized = normalizeAnimalName(animalName);
    const needed = String(state.game?.current_required_letter || "e").toLowerCase();

    if (!animalName) {
      return {
        ok: false,
        type: "warning",
        message: "Bitte gib ein Tier ein."
      };
    }

    if (getFirstLetter(normalized) !== needed) {
      return {
        ok: false,
        type: "error",
        message: `Das Tier muss mit ${needed.toUpperCase()} anfangen.`
      };
    }

    if (!findAnimal(state.animals, animalName)) {
      return {
        ok: false,
        type: "error",
        message: `"${animalName}" ist nicht in deiner Tierliste.`
      };
    }

    if (state.moves.some((move) => move.normalized_animal_name === normalized)) {
      return {
        ok: false,
        type: "error",
        message: `"${animalName}" wurde schon gespielt.`
      };
    }

    return { ok: true };
  }

  async function newRound() {
    if (!state.game?.id) {
      setMessage(el.message, "Du bist in keiner Lobby.", "warning");
      return;
    }

    if (state.players.length < 2) {
      setMessage(el.message, "Du brauchst mindestens 2 Spieler.", "warning");
      return;
    }

    await startNewGameRound("Neue Runde gestartet.");
  }

  function startAutoRefresh() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
    }

    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
    }

    state.refreshTimer = setInterval(refreshLobby, 2500);
    state.countdownTimer = setInterval(renderTimerOnly, 500);
  }

  function getCurrentOnlinePlayer() {
    return state.players.find((player) => player.turn_order === state.game?.current_turn_order) || null;
  }

  function getRemainingSeconds() {
    if (!state.game?.timer_enabled || !state.game?.turn_started_at || state.game?.status !== "playing") {
      return null;
    }

    const elapsed = Math.floor((Date.now() - new Date(state.game.turn_started_at).getTime()) / 1000);

    return Math.max(0, Number(state.game.turn_seconds || 60) - elapsed);
  }

  // STABILE Timer-Anzeige - kein Flackern zwischen "Aus" und "Wartend"
  function getTimerDisplayText() {
    if (!state.game) return "—";
    if (!state.game.timer_enabled) return "Aus";

    if (state.game.status === "waiting") return "Wartend";
    if (state.game.status === "finished") return "Beendet";
    if (state.game.status === "playing") {
      const remaining = getRemainingSeconds();
      if (remaining === null) return "—";
      return formatTimer(remaining);
    }
    return "—";
  }

  function renderTimerOnly() {
    if (state.game) {
      const newText = getTimerDisplayText();
      // Nur ändern wenn sich was geändert hat - reduziert Flackern
      if (el.timerDisplay.textContent !== newText) {
        el.timerDisplay.textContent = newText;
      }
    }
  }

  function render() {
    const currentPlayer = getCurrentOnlinePlayer();
    const activePlayers = state.players.filter((player) => !player.is_eliminated);

    el.lastAnimal.textContent = state.game?.last_animal || "---";
    el.requiredLetter.textContent = state.game?.current_required_letter
      ? state.game.current_required_letter.toUpperCase()
      : "---";

    // Stabile Timer-Anzeige
    const newTimerText = getTimerDisplayText();
    if (el.timerDisplay.textContent !== newTimerText) {
      el.timerDisplay.textContent = newTimerText;
    }

    // Status-Anzeige im turnBadge
    if (!state.game) {
      el.turnBadge.textContent = "Keine aktive Lobby";
    } else if (state.game.status === "waiting") {
      el.turnBadge.textContent = `Lobby wartet · ${state.players.length} Spieler · Host kann starten`;
    } else if (state.game.status === "finished") {
      el.turnBadge.textContent = "Spiel beendet";
    } else if (currentPlayer) {
      el.turnBadge.textContent = `${currentPlayer.guest_name} ist dran${currentPlayer.is_eliminated ? " · ausgeschieden" : ""}`;
    } else {
      el.turnBadge.textContent = "Warte...";
    }

    // Zeige/Verstecke Start-Button basierend auf Status
    if (startGameButton) {
      if (state.game?.status === "waiting" && state.players.length >= 2) {
        startGameButton.hidden = false;
        startGameButton.textContent = "Spiel starten";
      } else if (state.game?.status === "finished") {
        startGameButton.hidden = false;
        startGameButton.textContent = "Erneut spielen";
      } else {
        startGameButton.hidden = true;
      }
    }

    el.playersList.innerHTML = state.players.length
      ? state.players.map((player) => `
          <article class="player-row ${player.is_eliminated ? "eliminated" : ""}">
            <div>
              <strong>${escapeHtml(player.guest_name)}</strong>
              <div class="meta">
                Spieler ${player.turn_order}${player.id === state.localPlayer?.id ? " · Du" : ""}
              </div>
            </div>
            ${
              player.is_eliminated
                ? `<span class="pill danger">Raus</span>`
                : state.game?.status === "waiting"
                  ? `<span class="pill">Bereit</span>`
                  : player.turn_order === state.game?.current_turn_order
                    ? `<span class="pill success">Dran</span>`
                    : `<span class="pill">Aktiv</span>`
            }
          </article>
        `).join("")
      : `<p class="hint">Noch keine Spieler.</p>`;

    el.movesList.innerHTML = state.moves.length
      ? state.moves.map((move) => `
          <li>
            <strong>${escapeHtml(move.animal_name)}</strong>
            <span class="hint">von ${escapeHtml(move.guest_name || "Gast")}</span>
          </li>
        `).join("")
      : `
          <li>
            <strong>${escapeHtml(state.game?.last_animal || "Turmfalke")}</strong>
            <span class="hint">Starttier</span>
          </li>
        `;

    if (state.game?.status === "playing" && activePlayers.length === 1 && state.players.length > 1) {
      setMessage(el.message, `${activePlayers[0].guest_name} gewinnt! Drücke "Neue Runde" um nochmal zu spielen.`, "success");

      // Spiel als finished markieren
      supabaseClient
        .from("games")
        .update({ status: "finished" })
        .eq("id", state.game.id);
    }
  }
}

function initLocalPage() {
  const state = {
    animals: [],
    players: [],
    moves: [],
    lastAnimal: "Turmfalke",
    requiredLetter: "e",
    turnIndex: 0,
    started: false
  };

  const el = mapElements({
    playerForm: "#localPlayerForm",
    playerName: "#localPlayerName",
    startButton: "#localStartButton",
    playersList: "#localPlayersList",
    message: "#localMessage",
    lastAnimal: "#localLastAnimal",
    requiredLetter: "#localRequiredLetter",
    moveCount: "#localMoveCount",
    turnBadge: "#localTurnBadge",
    moveForm: "#localMoveForm",
    animalInput: "#localAnimalInput",
    movesList: "#localMovesList"
  });

  el.playerForm.addEventListener("submit", addPlayer);
  el.startButton.addEventListener("click", startRound);
  el.moveForm.addEventListener("submit", handleMove);

  start();

  async function start() {
    try {
      state.animals = await loadApprovedAnimals();
      setMessage(el.message, `${state.animals.length} Tiere geladen. Füge Spieler hinzu.`, "success");
    } catch (error) {
      setMessage(el.message, error.message, "error");
    }

    render();
  }

  function addPlayer(event) {
    event.preventDefault();

    const name = cleanPlayerName(el.playerName.value);

    if (!name) {
      setMessage(el.message, "Bitte gib einen Spielernamen ein.", "warning");
      return;
    }

    state.players.push({
      id: crypto.randomUUID(),
      name
    });

    el.playerName.value = "";
    render();
  }

  function startRound() {
    if (state.players.length < 2) {
      setMessage(el.message, "Du brauchst mindestens 2 Spieler.", "warning");
      return;
    }

    const animal = randomItem(state.animals) || { name: "Turmfalke" };

    state.lastAnimal = animal.name;
    state.requiredLetter = getLastLetter(animal.name);
    state.moves = [];
    state.turnIndex = 0;
    state.started = true;

    setMessage(el.message, `Runde gestartet. Starttier: ${animal.name}`, "success");
    render();
  }

  function handleMove(event) {
    event.preventDefault();

    if (!state.started) {
      setMessage(el.message, "Starte zuerst eine Runde.", "warning");
      return;
    }

    const animalName = cleanAnimalName(el.animalInput.value);
    const validation = validateLocalAnimal(animalName);

    if (!validation.ok) {
      setMessage(el.message, validation.message, validation.type);
      return;
    }

    const player = state.players[state.turnIndex];

    state.moves.push({
      playerName: player.name,
      animal: toTitleCase(animalName)
    });

    state.lastAnimal = toTitleCase(animalName);
    state.requiredLetter = getLastLetter(animalName);
    state.turnIndex = (state.turnIndex + 1) % state.players.length;

    el.animalInput.value = "";

    setMessage(el.message, `${player.name} spielt ${toTitleCase(animalName)}.`, "success");
    render();
  }

  function validateLocalAnimal(animalName) {
    const normalized = normalizeAnimalName(animalName);

    if (!animalName) {
      return {
        ok: false,
        type: "warning",
        message: "Bitte gib ein Tier ein."
      };
    }

    if (getFirstLetter(normalized) !== state.requiredLetter) {
      return {
        ok: false,
        type: "error",
        message: `Das Tier muss mit ${state.requiredLetter.toUpperCase()} anfangen.`
      };
    }

    if (!findAnimal(state.animals, animalName)) {
      return {
        ok: false,
        type: "error",
        message: `"${animalName}" ist nicht in deiner Tierliste.`
      };
    }

    if (state.moves.some((move) => normalizeAnimalName(move.animal) === normalized)) {
      return {
        ok: false,
        type: "error",
        message: `"${animalName}" wurde schon gespielt.`
      };
    }

    return { ok: true };
  }

  function render() {
    el.playersList.innerHTML = state.players.length
      ? state.players.map((player, index) => `
          <article class="player-row">
            <div>
              <strong>${escapeHtml(player.name)}</strong>
              <div class="meta">Spieler ${index + 1}</div>
            </div>
            ${
              state.started && index === state.turnIndex
                ? `<span class="pill success">Dran</span>`
                : `<span class="pill">Dabei</span>`
            }
          </article>
        `).join("")
      : `<p class="hint">Noch keine Spieler.</p>`;

    el.lastAnimal.textContent = state.lastAnimal || "---";
    el.requiredLetter.textContent = state.requiredLetter ? state.requiredLetter.toUpperCase() : "---";
    el.moveCount.textContent = String(state.moves.length);
    el.turnBadge.textContent = state.started ? `${state.players[state.turnIndex].name} ist dran` : "Noch keine Runde";

    el.movesList.innerHTML = state.moves.length
      ? state.moves.map((move) => `
          <li>
            <strong>${escapeHtml(move.animal)}</strong>
            <span class="hint">von ${escapeHtml(move.playerName)}</span>
          </li>
        `).join("")
      : `
          <li>
            <strong>${escapeHtml(state.lastAnimal)}</strong>
            <span class="hint">Starttier</span>
          </li>
        `;
  }
}

function loadLocalAnimals() {
  try {
    const animals = JSON.parse(localStorage.getItem(LOCAL_ANIMALS_KEY));
    return Array.isArray(animals) ? animals : [];
  } catch {
    return [];
  }
}

function saveLocalAnimals(animals) {
  localStorage.setItem(LOCAL_ANIMALS_KEY, JSON.stringify(animals));
}

function createLocalAnimal(name) {
  const cleanName = cleanAnimalName(name);
  const normalizedName = normalizeAnimalName(cleanName);

  return {
    id: `local-${normalizedName}`,
    name: toTitleCase(cleanName),
    normalized_name: normalizedName,
    first_letter: getFirstLetter(normalizedName),
    last_letter: getLastLetter(normalizedName),
    status: "approved",
    local: true
  };
}

function addLocalAnimal(name) {
  const animal = createLocalAnimal(name);

  if (!animal.normalized_name || !animal.first_letter || !animal.last_letter) {
    throw new Error("Dieses Tier kann nicht lokal gespeichert werden.");
  }

  const localAnimals = loadLocalAnimals();
  const exists = localAnimals.some((item) => item.normalized_name === animal.normalized_name);

  if (!exists) {
    localAnimals.push(animal);
    saveLocalAnimals(localAnimals);
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
      ...animal,
      normalized_name: normalized,
      first_letter: animal.first_letter || getFirstLetter(animal.name),
      last_letter: animal.last_letter || getLastLetter(animal.name)
    });
  });

  return [...animalsByName.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function ensureSupabase() {
  if (!supabaseClient) {
    throw new Error("Supabase konnte nicht geladen werden.");
  }

  if (!ANIMALCHAIN_CONFIG.supabaseKey || ANIMALCHAIN_CONFIG.supabaseKey.includes("DEIN_PUBLIC")) {
    throw new Error("Bitte trage deinen Supabase Public/Publishable Key in js/app.js ein.");
  }
}

function mapElements(selectors) {
  return Object.fromEntries(
    Object.entries(selectors).map(([key, selector]) => [key, qs(selector)])
  );
}

function qs(selector) {
  const element = document.querySelector(selector);

  if (!element) {
    throw new Error(`Element fehlt: ${selector}`);
  }

  return element;
}

function optionalQs(selector) {
  return document.querySelector(selector);
}

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

function getNextActiveTurnOrder(players, currentTurnOrder) {
  const activePlayers = players
    .filter((player) => !player.is_eliminated)
    .sort((a, b) => a.turn_order - b.turn_order);

  if (!activePlayers.length) {
    return null;
  }

  return (activePlayers.find((player) => player.turn_order > currentTurnOrder) || activePlayers[0]).turn_order;
}

function firstActiveTurnOrder(players) {
  const activePlayers = players
    .filter((player) => !player.is_eliminated)
    .sort((a, b) => a.turn_order - b.turn_order);

  return activePlayers[0]?.turn_order || null;
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
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
  const words = ["WOLF", "FALK", "PANDA", "LUCHS", "ZEBRA", "BIBER", "ADLER", "TIGER"];

  return `${randomItem(words)}${Math.floor(100 + Math.random() * 900)}`.slice(0, 8);
}

function formatTimer(seconds) {
  if (seconds === null || seconds === undefined) {
    return "—";
  }

  const safeSeconds = Math.max(0, Number(seconds) || 0);

  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
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

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}
