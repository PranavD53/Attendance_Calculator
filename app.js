const stateKey = "attendwise-state-v1";

const schoolYears = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"];
const collegeYears = ["1st year", "2nd year", "3rd year", "4th year", "5th year"];

const defaults = {
  studentType: "school",
  year: "Class 12",
  unitMode: "classes",
  target: 75,
  totalHeld: 120,
  attended: 93,
  remaining: 40,
  subjects: [
    { name: "Maths", held: 32, attended: 25 },
    { name: "Physics", held: 28, attended: 20 },
    { name: "English", held: 24, attended: 22 }
  ]
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const elements = {
  form: $("#attendance-form"),
  year: $("#year"),
  yearLabel: $("#year-label"),
  unitMode: $("#unit-mode"),
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
  notes: $("#notes")
};

let state = loadState();

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(stateKey));
    return { ...defaults, ...stored, subjects: stored?.subjects?.length ? stored.subjects : defaults.subjects };
  } catch {
    return { ...defaults };
  }
}

function saveState() {
  localStorage.setItem(stateKey, JSON.stringify(state));
  elements.saveState.textContent = "Autosaved";
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
  const ratio = target / 100;
  if (target >= 100) return attended >= total ? 0 : Infinity;
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
  const years = state.studentType === "school" ? schoolYears : collegeYears;
  elements.year.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join("");

  if (!years.includes(state.year)) {
    state.year = years[0];
  }

  elements.year.value = state.year;
  elements.yearLabel.textContent = state.studentType === "school" ? "Class / grade" : "College year";
}

function syncInputs() {
  $$("input[name='studentType']").forEach((input) => {
    input.checked = input.value === state.studentType;
  });
  syncYearOptions();
  elements.unitMode.value = state.unitMode;
  elements.target.value = state.target;
  elements.totalHeld.value = state.totalHeld;
  elements.attended.value = state.attended;
  elements.remaining.value = state.remaining;
}

function readInputs() {
  state.studentType = $("input[name='studentType']:checked").value;
  state.year = elements.year.value;
  state.unitMode = elements.unitMode.value;
  state.target = clampNumber(elements.target.value, 1, 100);
  state.totalHeld = Math.round(clampNumber(elements.totalHeld.value, 0, 9999));
  state.attended = Math.round(clampNumber(elements.attended.value, 0, state.totalHeld));
  state.remaining = Math.round(clampNumber(elements.remaining.value, 0, 9999));

  elements.target.value = state.target;
  elements.totalHeld.value = state.totalHeld;
  elements.attended.value = state.attended;
  elements.remaining.value = state.remaining;
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
  const notes = [];

  notes.push({
    type: current >= state.target ? "" : "warning",
    text: `Current ${state.unitMode === "days" ? "day-wise" : "class-wise"} attendance is ${formatPercent(current)} for ${state.year}.`
  });

  if (state.studentType === "college") {
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
  renderSubjects();
  saveState();
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
  state.totalHeld += 1;
  state.attended += 1;
  state.remaining = Math.max(0, state.remaining - 1);
  syncInputs();
  update();
});

$("#miss-next").addEventListener("click", () => {
  state.totalHeld += 1;
  state.remaining = Math.max(0, state.remaining - 1);
  syncInputs();
  update();
});

$("#reset-demo").addEventListener("click", () => {
  state = { ...defaults, subjects: defaults.subjects.map((subject) => ({ ...subject })) };
  syncInputs();
  update();
});

$("#add-subject").addEventListener("click", () => {
  state.subjects.push({ name: "New subject", held: 0, attended: 0 });
  renderSubjects();
  saveState();
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
      const attendedInput = row.querySelector("[data-subject-field='attended']");
      attendedInput.value = state.subjects[index].attended;
    }
    const score = row.querySelector(".subject-score");
    score.textContent = formatPercent(percentage(state.subjects[index].attended, state.subjects[index].held));
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

syncInputs();
renderResults();
renderSubjects();
