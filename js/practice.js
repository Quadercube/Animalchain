// js/practice.js

const practiceState = {
  animals: [],
  lastAnimal: "Turmfalke",
  requiredLetter: "e",
  moves: []
};

const practiceElements = {
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

initPractice();

async function initPractice() {
  practiceElements.animalForm.addEventListener("submit", handlePlayerMove);
  practiceElements.hintButton.addEventListener("click", showHint);
  practiceElements.newRoundButton.addEventListener("click", () => startNewRound(true));
  practiceElements.suggestForm.addEventListener("submit", handleSuggestAnimal);

  try {
    const database = getDatabase();

    practiceState.animals = await database.loadApprovedAnimals();

    if (practiceState.animals.length === 0) {
      setMessage("Keine Tiere in Supabase gefunden. Prüfe deine animals-Tabelle.", "warning");
      renderPractice();
      return;
    }

    startNewRound(false);
    setMessage("Tierdatenbank geladen. Du bist dran.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  }

  renderPractice();
}

function getDatabase() {
  if (!window.AnimalchainDB) {
    throw new Error("AnimalchainDB wurde nicht geladen. Prüfe practice.html: database.js muss vor practice.js stehen.");
  }

  return window.AnimalchainDB;
}

function startNewRound(showMessage) {
  const startAnimal = pickRandomAnimal() || { name: "Turmfalke" };
  const database = getDatabase();

  practiceState.lastAnimal = startAnimal.name;
  practiceState.requiredLetter = database.getLastLetter(startAnimal.name);
  practiceState.moves = [];

  renderPractice();

  if (showMessage) {
    setMessage(`Neue Runde. Starttier: ${practiceState.lastAnimal}`, "success");
  }
}

async function handlePlayerMove(event) {
  event.preventDefault();

  const database = getDatabase();
  const animalName = database.cleanAnimalName(practiceElements.animalInput.value);
  const validation = validateAnimal(animalName);

  if (!validation.ok) {
    setMessage(validation.message, validation.type);
    return;
  }

  addMove("Du", animalName);
  practiceElements.animalInput.value = "";
  renderPractice();

  await new Promise((resolve) => setTimeout(resolve, 450));
  computerMove();
}

function computerMove() {
  const options = getAvailableAnimalsForLetter(practiceState.requiredLetter);

  if (options.length === 0) {
    setMessage(`Der Computer findet kein Tier mit ${practiceState.requiredLetter.toUpperCase()}. Du gewinnst!`, "success");
    return;
  }

  const animal = options[Math.floor(Math.random() * options.length)];

  addMove("Computer", animal.name);
  renderPractice();
  setMessage(`Computer spielt: ${animal.name}. Jetzt brauchst du ${practiceState.requiredLetter.toUpperCase()}.`, "success");
}

function validateAnimal(animalName) {
  const database = getDatabase();

  if (!animalName) {
    return {
      ok: false,
      type: "warning",
      message: "Bitte gib ein Tier ein."
    };
  }

  const normalizedName = database.normalizeAnimalName(animalName);

  if (database.getFirstLetter(normalizedName) !== practiceState.requiredLetter) {
    return {
      ok: false,
      type: "error",
      message: `Dein Tier muss mit ${practiceState.requiredLetter.toUpperCase()} anfangen.`
    };
  }

  if (!findAnimal(animalName)) {
    return {
      ok: false,
      type: "error",
      message: `"${animalName}" ist nicht in der Supabase-Tierdatenbank. Du kannst es unten vorschlagen.`
    };
  }

  const wasAlreadyUsed = practiceState.moves.some((move) => {
    return database.normalizeAnimalName(move.animal) === normalizedName;
  });

  if (wasAlreadyUsed) {
    return {
      ok: false,
      type: "error",
      message: `"${animalName}" wurde schon gespielt.`
    };
  }

  return { ok: true };
}

function addMove(playerName, animalName) {
  const database = getDatabase();
  const normalizedName = database.normalizeAnimalName(animalName);

  practiceState.moves.push({
    playerName,
    animal: database.toTitleCase(animalName)
  });

  practiceState.lastAnimal = database.toTitleCase(animalName);
  practiceState.requiredLetter = database.getLastLetter(normalizedName);
}

function showHint() {
  const options = getAvailableAnimalsForLetter(practiceState.requiredLetter);

  if (options.length === 0) {
    setMessage(`Kein Tipp für ${practiceState.requiredLetter.toUpperCase()} gefunden.`, "warning");
    return;
  }

  const hint = options[Math.floor(Math.random() * options.length)];
  setMessage(`Tipp: ${hint.name}`, "success");
}

async function handleSuggestAnimal(event) {
  event.preventDefault();

  const database = getDatabase();
  const animalName = database.cleanAnimalName(practiceElements.suggestInput.value);

  if (!animalName) {
    setMessage("Bitte gib ein Tier ein.", "warning");
    return;
  }

  try {
    await database.suggestAnimal(animalName);
    practiceElements.suggestInput.value = "";
    setMessage(`"${database.toTitleCase(animalName)}" wurde in Supabase vorgeschlagen.`, "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

function findAnimal(animalName) {
  const database = getDatabase();
  const normalizedName = database.normalizeAnimalName(animalName);

  return practiceState.animals.find((animal) => {
    return animal.normalized_name === normalizedName;
  });
}

function getAvailableAnimalsForLetter(letter) {
  const database = getDatabase();
  const usedAnimals = new Set(
    practiceState.moves.map((move) => database.normalizeAnimalName(move.animal))
  );

  return practiceState.animals.filter((animal) => {
    return animal.first_letter === letter && !usedAnimals.has(animal.normalized_name);
  });
}

function pickRandomAnimal() {
  if (practiceState.animals.length === 0) {
    return null;
  }

  return practiceState.animals[Math.floor(Math.random() * practiceState.animals.length)];
}

function renderPractice() {
  const database = getDatabase();

  practiceElements.lastAnimal.textContent = practiceState.lastAnimal;
  practiceElements.requiredLetter.textContent = practiceState.requiredLetter.toUpperCase();
  practiceElements.moveCount.textContent = String(practiceState.moves.length);
  practiceElements.animalCount.textContent = `${practiceState.animals.length} Tiere aus Supabase geladen`;

  practiceElements.movesList.innerHTML = practiceState.moves.length
    ? practiceState.moves.map((move) => `
        <li>
          <strong>${database.escapeHtml(move.animal)}</strong>
          <span class="hint">von ${database.escapeHtml(move.playerName)}</span>
        </li>
      `).join("")
    : `
        <li>
          <strong>${database.escapeHtml(practiceState.lastAnimal)}</strong>
          <span class="hint">Starttier</span>
        </li>
      `;
}

function setMessage(text, type = "") {
  practiceElements.gameMessage.textContent = text;
  practiceElements.gameMessage.className = `message ${type}`.trim();
}
