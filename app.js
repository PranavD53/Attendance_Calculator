const stateKey = "attendwise-state-v2";
const configKey = "attendwise-firebase-config";
const firebaseVersion = "12.7.0";

const schoolYears = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"];
const ugSemesters = ["Semester 1", "Semester 2", "Semester 3", "Semester 4", "Semester 5", "Semester 6", "Semester 7", "Semester 8"];
const pgSemesters = ["Semester 1", "Semester 2", "Semester 3", "Semester 4"];

const defaults = {
  studentType: "school",
  year: "Class 12",
  unitMode: "classes",
  classesPerDay: 6,
  target: 75,
  totalHeld: 120,
  attended: 93,
  remaining: 40,
  subjects: [
    { name: "Maths", held: 32, attended: 25 },
    { name: "Physics", held: 28, attended: 20 },
    { name: "English", held: 24, attended: 22 }
  ],
  updatedAt: new Date().toISOString()
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const elements = {
  form: $("#attendance-form"),
  courseLevel: $("#course-level"),
  year: $("#year"),
  yearLabel: $("#year-label"),
  unitMode: $("#unit-mode"),
  classesPerDay: $("#classes-per-day"),
  heldDays: $("#held-days"),
  attendedDays: $("#attended-days"),
  remainingDays: $("#remaining-days"),
  applyDays: $("#apply-days"),
  attendNext: $("#attend-next"),
  missNext: $("#miss-next"),
  target: $("#target"),
  totalHeld: $("#total-held"),
  attended: $("#attended"),
  remaining: $("#remaining"),
  saveState: $("#save-state"),
  meter: $("#meter"),
  meterValue: $("#meter-value"),
  statusLabel: $("#status-label"),
  mainResult: $("#main-result"),
  mainCopy: $("#main-copy"),
  needCount: $("#need-count"),
  needCaption: $("#need-caption"),
  missCount: $("#miss-count"),
  missCaption: $("#miss-caption"),
  bestCount: $("#best-count"),
  forecastNote: $("#forecast-note"),
  forecastTrack: $("#forecast-track"),
  subjectList: $("#subject-list"),
  notes: $("#notes"),
  syncPill: $("#sync-pill"),
  syncMessage: $("#sync-message"),
  firebaseConfig: $("#firebase-config"),
  accountStatus: $("#account-status"),
  signInButton: $("#google-sign-in"),
  refreshButton: $("#sync-now"),
  signOutButton: $("#sign-out")
};

let state = loadState();
let firebaseApp = null;
let firebaseAuth = null;
let firebaseStore = null;
let firestoreDb = null;
let firebaseUser = null;
let syncTimer = null;
let installPrompt = null;

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(stateKey)) || JSON.parse(localStorage.getItem("attendwise-state-v1"));
    return normalizeState({ ...defaults, ...stored });
  } catch {
    return normalizeState({ ...defaults });
  }
}

function normalizeState(nextState) {
  const subjects = Array.isArray(nextState.subjects) && nextState.subjects.length
    ? nextState.subjects
    : defaults.subjects;
  const studentType = nextState.studentType === "college" ? "ug" : nextState.studentType;

  return {
    ...defaults,
    ...nextState,
    studentType: ["school", "ug", "pg"].includes(studentType) ? studentType : defaults.studentType,
    target: clampNumber(nextState.target, 1, 100),
    totalHeld: Math.round(clampNumber(nextState.totalHeld, 0, 9999)),
    attended: Math.round(clampNumber(nextState.attended, 0, nextState.totalHeld || 0)),
    remaining: Math.round(clampNumber(nextState.remaining, 0, 9999)),
    classesPerDay: Math.round(clampNumber(nextState.classesPerDay, 1, 20)),
    subjects: subjects.map((subject) => ({
      name: String(subject.name || "Subject"),
      held: Math.round(clampNumber(subject.held, 0, 9999)),
      attended: Math.round(clampNumber(subject.attended, 0, subject.held || 0))
    }))
  };
}

function saveState(sync = true) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(stateKey, JSON.stringify(state));
  elements.saveState.textContent = "Updated";

  if (sync && firebaseUser) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncToCloud(false), 900);
  }
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function percentage(attended, total) {
  if (total <= 0) return 0;
  return (attended / total) * 100;
}

function unitsNeededToReachTarget(attended, total, target) {
  if (target >= 100) return attended >= total ? 0 : Infinity;
  const ratio = target / 100;
  const need = (ratio * total - attended) / (1 - ratio);
  return Math.max(0, Math.ceil(need));
}

function skippableUnits(attended, total, remaining, target) {
  let misses = 0;

  while (misses < remaining) {
    const nextTotal = total + misses + 1;
    if (percentage(attended, nextTotal) < target) break;
    misses += 1;
  }

  return misses;
}

function formatPercent(value) {
  return `${value.toFixed(value >= 99.95 ? 0 : 1)}%`;
}

function unitLabel(count = 2) {
  if (state.unitMode === "days") return count === 1 ? "day" : "days";
  return count === 1 ? "class" : "classes";
}

function syncYearOptions() {
  const years = state.studentType === "school"
    ? schoolYears
    : state.studentType === "pg"
      ? pgSemesters
      : ugSemesters;

  elements.year.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join("");

  if (!years.includes(state.year)) {
    state.year = years[0];
  }

  elements.year.value = state.year;
  elements.yearLabel.textContent = state.studentType === "school" ? "Class / grade" : "Semester";
}

function syncInputs() {
  elements.courseLevel.value = state.studentType;
  syncYearOptions();
  elements.unitMode.value = state.unitMode;
  elements.classesPerDay.value = state.classesPerDay;
  elements.target.value = state.target;
  elements.totalHeld.value = state.totalHeld;
  elements.attended.value = state.attended;
  elements.remaining.value = state.remaining;
  syncActionAvailability();
}

function readInputs() {
  state.studentType = elements.courseLevel.value;
  state.year = elements.year.value;
  state.unitMode = elements.unitMode.value;
  state.classesPerDay = Math.round(clampNumber(elements.classesPerDay.value, 1, 20));
  state.target = clampNumber(elements.target.value, 1, 100);
  state.totalHeld = Math.round(clampNumber(elements.totalHeld.value, 0, 9999));
  state.attended = Math.round(clampNumber(elements.attended.value, 0, state.totalHeld));
  state.remaining = Math.round(clampNumber(elements.remaining.value, 0, 9999));

  elements.classesPerDay.value = state.classesPerDay;
  elements.target.value = state.target;
  elements.totalHeld.value = state.totalHeld;
  elements.attended.value = state.attended;
  elements.remaining.value = state.remaining;
}

function syncActionAvailability() {
  const yearEnded = state.remaining <= 0;
  elements.attendNext.disabled = yearEnded;
  elements.missNext.disabled = yearEnded;
  elements.attendNext.title = yearEnded ? "No remaining classes or days" : "";
  elements.missNext.title = yearEnded ? "No remaining classes or days" : "";
}

function renderResults() {
  const current = percentage(state.attended, state.totalHeld);
  const target = state.target;
  const remaining = state.remaining;
  const possibleBest = percentage(state.attended + remaining, state.totalHeld + remaining);
  const need = unitsNeededToReachTarget(state.attended, state.totalHeld, target);
  const canReach = Number.isFinite(need) && (need <= remaining || current >= target);
  const misses = skippableUnits(state.attended, state.totalHeld, remaining, target);
  const angle = Math.max(0, Math.min(360, current * 3.6));

  elements.meter.style.setProperty("--angle", `${angle}deg`);
  elements.meterValue.textContent = formatPercent(current);
  elements.bestCount.textContent = formatPercent(possibleBest);
  elements.needCount.textContent = canReach ? String(need) : "No";
  elements.needCaption.textContent = canReach
    ? need === 0 ? "Already on track" : `Attend ${need} straight ${unitLabel(need)}`
    : "Not possible with remaining schedule";
  elements.missCount.textContent = String(misses);
  elements.missCaption.textContent = misses === 1 ? "Safe miss left" : "Safe misses left";
  elements.forecastNote.textContent = `One square per ${unitLabel(1)}`;

  if (current >= target + 5) {
    elements.statusLabel.textContent = "Comfortably safe";
    elements.mainResult.textContent = "You have breathing room.";
    elements.mainCopy.textContent = `You can miss ${misses} ${unitLabel(misses)} and still stay at or above ${target}%.`;
  } else if (current >= target) {
    elements.statusLabel.textContent = "Safe, but close";
    elements.mainResult.textContent = "You are above target.";
    elements.mainCopy.textContent = misses > 0
      ? `You can miss ${misses} ${unitLabel(misses)}, but the margin is thin.`
      : `Attend the next ${unitLabel(1)} to protect your percentage.`;
  } else if (canReach) {
    elements.statusLabel.textContent = "Recovery mode";
    elements.mainResult.textContent = "You can still recover.";
    elements.mainCopy.textContent = `Attend the next ${need} ${unitLabel(need)} to reach ${target}%.`;
  } else {
    elements.statusLabel.textContent = "High risk";
    elements.mainResult.textContent = "This target is out of reach.";
    elements.mainCopy.textContent = `Even perfect attendance ahead reaches ${formatPercent(possibleBest)}. Talk to your institution early.`;
  }

  renderForecast(target);
  renderNotes(current, possibleBest, need, misses, canReach);
  syncActionAvailability();
}

function renderForecast(target) {
  const count = Math.min(40, Math.max(10, state.remaining || 20));
  const cells = [];

  for (let index = 1; index <= count; index += 1) {
    const projected = percentage(state.attended + index, state.totalHeld + index);
    const className = projected >= target ? "forecast-cell" : projected >= target - 5 ? "forecast-cell risk" : "forecast-cell danger";
    cells.push(`<span class="${className}" title="After attending ${index}: ${formatPercent(projected)}"></span>`);
  }

  elements.forecastTrack.innerHTML = cells.join("");
}

function renderNotes(current, possibleBest, need, misses, canReach) {
  const institution = state.studentType === "school" ? "school" : "college";
  const academicStage = state.studentType === "school"
    ? state.year
    : state.studentType === "pg"
      ? `Masters / M.Tech ${state.year}`
      : `UG ${state.year}`;
  const notes = [];

  notes.push({
    type: current >= state.target ? "" : "warning",
    text: `Current ${state.unitMode === "days" ? "day-wise" : "class-wise"} attendance is ${formatPercent(current)} for ${academicStage}.`
  });

  notes.push({
    type: "gold",
    text: firebaseUser
      ? "You are signed in, so you can continue this plan from your other devices."
      : "Sign in to continue the same attendance plan from your other devices."
  });

  if (state.studentType !== "school") {
    notes.push({
      type: "gold",
      text: "Many colleges check each subject separately, so use the subject planner before skipping any individual course."
    });
  } else {
    notes.push({
      type: "gold",
      text: "Schools often count full working days, but practicals or special classes may be tracked separately."
    });
  }

  if (!canReach) {
    notes.push({
      type: "warning",
      text: `Your best possible finish is ${formatPercent(possibleBest)}. Ask your ${institution} about medical, duty, or condonation rules.`
    });
  } else if (need > 0) {
    notes.push({
      type: "warning",
      text: `Attend ${need} consecutive ${unitLabel(need)} before taking another leave.`
    });
  } else {
    notes.push({
      type: "",
      text: misses > 0
        ? `You have ${misses} optional ${unitLabel(misses)} available while staying above target.`
        : "You are exactly near the line, so skipping now can pull you below the target."
    });
  }

  elements.notes.innerHTML = notes.map((note) => `<li class="${note.type}">${note.text}</li>`).join("");
}

function renderSubjects() {
  elements.subjectList.innerHTML = state.subjects.map((subject, index) => {
    const score = percentage(subject.attended, subject.held);
    return `
      <div class="subject-row" data-index="${index}">
        <label class="field">
          <span>Subject</span>
          <input data-subject-field="name" value="${escapeHtml(subject.name)}" aria-label="Subject name">
        </label>
        <label class="field">
          <span>Held</span>
          <input data-subject-field="held" type="number" min="0" step="1" value="${subject.held}" aria-label="Classes held">
        </label>
        <label class="field">
          <span>Attended</span>
          <input data-subject-field="attended" type="number" min="0" step="1" value="${subject.attended}" aria-label="Classes attended">
        </label>
        <div class="subject-score">${formatPercent(score)}</div>
        <button class="remove-subject" type="button" aria-label="Remove subject">x</button>
      </div>
    `;
  }).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function update() {
  readInputs();
  syncYearOptions();
  renderResults();
  saveState();
}

function getFirebaseConfig() {
  const localConfig = localStorage.getItem(configKey);
  if (localConfig) {
    try {
      return JSON.parse(localConfig);
    } catch {
      return null;
    }
  }

  return window.FIREBASE_CONFIG || null;
}

function renderFirebaseConfig() {
  const config = getFirebaseConfig();
  if (elements.firebaseConfig) {
    elements.firebaseConfig.value = config ? JSON.stringify(config, null, 2) : "";
  }
}

function setSyncMessage(message, online = false) {
  if (elements.syncMessage) {
    elements.syncMessage.textContent = message;
  }
  if (elements.accountStatus) {
    elements.accountStatus.textContent = online ? "" : message;
  }
  elements.syncPill.textContent = online ? "Signed in" : "Guest mode";
  elements.syncPill.classList.toggle("online", online);
  elements.signInButton.hidden = online;
  elements.refreshButton.hidden = !online;
  elements.signOutButton.hidden = !online;
}

async function initFirebase() {
  if (firebaseApp && firebaseAuth && firestoreDb) return true;

  const config = getFirebaseConfig();
  if (!config?.apiKey || !config?.projectId || !config?.authDomain) {
    setSyncMessage("Account setup is not connected yet.");
    return false;
  }

  try {
    const [{ initializeApp }, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-firestore.js`)
    ]);

    firebaseApp = initializeApp(config);
    firebaseAuth = authModule;
    firebaseStore = firestoreModule;
    firestoreDb = firestoreModule.getFirestore(firebaseApp);

    await authModule.getRedirectResult(authModule.getAuth(firebaseApp)).catch(() => null);

    authModule.onAuthStateChanged(authModule.getAuth(firebaseApp), async (user) => {
      firebaseUser = user;
      if (user) {
        setSyncMessage(`Signed in as ${user.email || user.displayName || "student"}.`, true);
        await pullThenPush();
      } else {
        setSyncMessage("Signed out. You can still use the planner.");
        renderResults();
      }
    });

    return true;
  } catch (error) {
    setSyncMessage(`Account setup could not start: ${error.message}`);
    return false;
  }
}

async function signInWithGoogle() {
  const ready = await initFirebase();
  if (!ready) return;

  try {
    const auth = firebaseAuth.getAuth(firebaseApp);
    const provider = new firebaseAuth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await firebaseAuth.signInWithPopup(auth, provider);
  } catch (error) {
    const auth = firebaseAuth.getAuth(firebaseApp);
    const provider = new firebaseAuth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    if (error.code === "auth/unauthorized-domain" || location.hostname === "127.0.0.1") {
      setSyncMessage("Open this app with localhost, or add this address in your sign-in settings.");
      return;
    }

    if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") {
      await firebaseAuth.signInWithRedirect(auth, provider);
      return;
    }

    setSyncMessage(`Sign-in failed: ${error.message}`);
  }
}

async function signOut() {
  if (!firebaseApp || !firebaseAuth) {
    setSyncMessage("You are already in guest mode.");
    return;
  }
  await firebaseAuth.signOut(firebaseAuth.getAuth(firebaseApp));
}

function userDocRef() {
  return firebaseStore.doc(firestoreDb, "users", firebaseUser.uid);
}

async function pullThenPush() {
  if (!firebaseUser) return;

  const snapshot = await firebaseStore.getDoc(userDocRef());
  if (snapshot.exists()) {
    const cloud = snapshot.data();
    const cloudState = cloud.attendanceState ? normalizeState(cloud.attendanceState) : null;
    const cloudTime = Date.parse(cloudState?.updatedAt || 0);
    const localTime = Date.parse(state.updatedAt || 0);

    if (cloudState && cloudTime > localTime) {
      state = cloudState;
      syncInputs();
      renderSubjects();
      renderResults();
      saveState(false);
    }
  }

  await syncToCloud(false);
}

async function syncToCloud(showSuccess = true) {
  if (!firebaseUser || !firebaseApp || !firestoreDb) {
    setSyncMessage("Sign in to refresh your plan across devices.");
    return;
  }

  try {
    await firebaseStore.setDoc(userDocRef(), {
      uid: firebaseUser.uid,
      email: firebaseUser.email || null,
      displayName: firebaseUser.displayName || null,
      attendanceState: state,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    if (showSuccess) {
      setSyncMessage("Your plan is up to date.", true);
    }
  } catch (error) {
    setSyncMessage(`Refresh failed: ${error.message}`, true);
  }
}

elements.form.addEventListener("input", update);
elements.form.addEventListener("change", update);

$$("[data-target]").forEach((button) => {
  button.addEventListener("click", () => {
    elements.target.value = button.dataset.target;
    update();
  });
});

$("#attend-next").addEventListener("click", () => {
  if (state.remaining <= 0) return;
  state.totalHeld += 1;
  state.attended += 1;
  state.remaining = Math.max(0, state.remaining - 1);
  syncInputs();
  update();
});

$("#miss-next").addEventListener("click", () => {
  if (state.remaining <= 0) return;
  state.totalHeld += 1;
  state.remaining = Math.max(0, state.remaining - 1);
  syncInputs();
  update();
});

$("#reset-demo").addEventListener("click", () => {
  state = normalizeState({ ...defaults, subjects: defaults.subjects.map((subject) => ({ ...subject })) });
  syncInputs();
  renderSubjects();
  update();
});

elements.applyDays.addEventListener("click", () => {
  const classesPerDay = Math.round(clampNumber(elements.classesPerDay.value, 1, 20));
  const heldDays = Math.round(clampNumber(elements.heldDays.value, 0, 9999));
  const attendedDays = Math.round(clampNumber(elements.attendedDays.value, 0, heldDays));
  const remainingDays = Math.round(clampNumber(elements.remainingDays.value, 0, 9999));

  state.classesPerDay = classesPerDay;
  state.unitMode = "classes";
  state.totalHeld = heldDays * classesPerDay;
  state.attended = attendedDays * classesPerDay;
  state.remaining = remainingDays * classesPerDay;

  elements.attendedDays.value = attendedDays;
  syncInputs();
  update();
});

$("#add-subject").addEventListener("click", () => {
  state.subjects.push({ name: "New subject", held: 0, attended: 0 });
  renderSubjects();
  saveState();
});

$("#google-sign-in").addEventListener("click", signInWithGoogle);
$("#sync-now").addEventListener("click", () => syncToCloud(true));
$("#sign-out").addEventListener("click", signOut);

if ($("#save-config")) {
  $("#save-config").addEventListener("click", () => {
    try {
      const config = JSON.parse(elements.firebaseConfig.value);
      localStorage.setItem(configKey, JSON.stringify(config));
      firebaseApp = null;
      firebaseAuth = null;
      firebaseStore = null;
      firestoreDb = null;
      setSyncMessage("Setup saved. You can sign in now.");
    } catch {
      setSyncMessage("Those details are not valid yet.");
    }
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  $("#install-app").hidden = false;
});

$("#install-app").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("#install-app").hidden = true;
});

elements.subjectList.addEventListener("input", (event) => {
  const row = event.target.closest(".subject-row");
  if (!row) return;

  const index = Number(row.dataset.index);
  const field = event.target.dataset.subjectField;
  if (!field) return;

  if (field === "name") {
    state.subjects[index].name = event.target.value;
  } else {
    const max = field === "attended" ? state.subjects[index].held : 9999;
    state.subjects[index][field] = Math.round(clampNumber(event.target.value, 0, max));
    if (field === "held") {
      state.subjects[index].attended = Math.min(state.subjects[index].attended, state.subjects[index].held);
      row.querySelector("[data-subject-field='attended']").value = state.subjects[index].attended;
    }
    row.querySelector(".subject-score").textContent = formatPercent(percentage(state.subjects[index].attended, state.subjects[index].held));
  }

  saveState();
});

elements.subjectList.addEventListener("click", (event) => {
  if (!event.target.classList.contains("remove-subject")) return;
  const row = event.target.closest(".subject-row");
  state.subjects.splice(Number(row.dataset.index), 1);
  if (!state.subjects.length) {
    state.subjects.push({ name: "New subject", held: 0, attended: 0 });
  }
  renderSubjects();
  saveState();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

renderFirebaseConfig();
syncInputs();
renderSubjects();
renderResults();
setSyncMessage("");
saveState(false);
