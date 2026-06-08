// ── Greek Verbs Curriculum Track ─────────────────────────────────────────────
// greek-verbs.js — Basic (22 lessons) and Advanced (28 lessons) verb tracks

// ── State Variables ────────────────────────────────────────────────────────────
let completedVerbBasicLessons =
  JSON.parse(localStorage.getItem("completedVerbBasicLessons")) || {};
let completedVerbAdvancedLessons =
  JSON.parse(localStorage.getItem("completedVerbAdvancedLessons")) || {};
let answeredVerbKCs = JSON.parse(localStorage.getItem("answeredVerbKCs")) || {};
let openedVerbBlocksSyncTimer = null;
let currentVerbBasicLesson = null;
let currentVerbAdvLesson = null;

function _mergeVerbOpenedBlockMaps(localMap = {}, remoteMap = {}) {
  const merged = { ...(localMap || {}) };
  Object.entries(remoteMap || {}).forEach(([lessonId, blocks]) => {
    const localBlocks = Array.isArray(merged[lessonId]) ? merged[lessonId] : [];
    const remoteBlocks = Array.isArray(blocks) ? blocks : [];
    merged[lessonId] = [...new Set([...localBlocks, ...remoteBlocks])]
      .filter(item => Number.isInteger(item) || typeof item === "string")
      .sort((a, b) => String(a).localeCompare(String(b)));
  });
  return merged;
}

function _verbBlockKey(block, index) {
  const heading = block.querySelector(".lesson-block-header")?.textContent || "";
  const normalized = heading
    .replace(/\s+/g, " ")
    .replace(/~\s*[\d.]+\s*min/gi, "")
    .trim()
    .toLowerCase();
  return `h:${index}:${normalized}`;
}

function _scheduleVerbOpenedBlocksSync() {
  clearTimeout(openedVerbBlocksSyncTimer);
  openedVerbBlocksSyncTimer = setTimeout(() => {
    if (window.Auth?.getCurrentUser?.() && typeof syncUserData === "function") {
      syncUserData().catch(err => console.warn("Opened verb block sync failed:", err));
    }
  }, 900);
}

// ── Lesson ID Arrays ───────────────────────────────────────────────────────────
const VERB_BASIC_LESSONS = [
  "vb_01","vb_02","vb_03","vb_04","vb_05","vb_06","vb_07",
  "vb_23","vb_24","vb_25","vb_26",
  "vb_08","vb_09","vb_10","vb_11","vb_12",
  "vb_27",
  "vb_13","vb_14","vb_15","vb_16","vb_17","vb_18","vb_19","vb_20",
  "vb_28",
  "vb_21","vb_22"
];

const VERB_ADV_LESSONS = [
  "va_01","va_02","va_29","va_30",
  "va_03","va_04","va_05","va_06","va_07","va_08","va_09","va_31","va_32",
  "va_10","va_11","va_12","va_13","va_14","va_15","va_16",
  "va_17","va_18","va_19","va_20","va_21","va_22","va_23","va_24",
  "va_25","va_26","va_27","va_28"
];

// ── Lesson Titles ──────────────────────────────────────────────────────────────
const VERB_BASIC_LESSON_TITLES = {
  vb_01:"What Verbs Are in English", vb_02:"Subjects and Actions",
  vb_03:"Time and Action",           vb_04:"Commands and Statements",
  vb_05:"Intro to Greek Verbs",      vb_06:"Person and Number",
  vb_07:"Present Active Indicative",
  vb_23:"What Is a Paradigm?",       vb_24:"How Greek Verbs Are Built",
  vb_25:"Connecting Vowels",         vb_26:"Reading Verb Patterns",
  vb_08:"Understanding Endings",
  vb_09:"Active Voice",              vb_10:"Middle and Passive Basics",
  vb_11:"Indicative Mood",           vb_12:"Imperfect Tense",
  vb_27:"Augment — Marking Past Time",
  vb_13:"Future Tense",              vb_14:"Aorist Basics",
  vb_15:"Second Aorists",            vb_16:"Perfect Tense",
  vb_17:"Imperatives",               vb_18:"Infinitives",
  vb_19:"Participles",               vb_20:"Principal Parts",
  vb_28:"Contract Verbs",
  vb_21:"Reading Full Parses",       vb_22:"Reading Real NT Verbs"
};

const VERB_ADV_LESSON_TITLES = {
  va_01:"Verbs and Communication",          va_02:"Embedded Subjects",
  va_29:"Morphological Construction",       va_30:"Connecting Vowels and Contracts",
  va_03:"Present Tense and Imperfective",   va_04:"Imperfect in Narrative",
  va_05:"Future Tense Nuance",              va_06:"Aorist Overview",
  va_07:"Constative and Ingressive Ideas",  va_08:"Culminative Ideas",
  va_09:"Second Aorists",
  va_31:"Tense Formatives and Stem Changes",va_32:"Augment and Reduplication",
  va_10:"Aspect and Time",
  va_11:"Active Voice in Depth",            va_12:"Middle Voice Nuance",
  va_13:"Passive Voice Nuance",             va_14:"Deponent Discussion",
  va_15:"Imperatives and Force",            va_16:"Subjunctive Introduction",
  va_17:"Infinitives in Syntax",            va_18:"Participles as Verbal Adjectives",
  va_19:"Attributive Participles",          va_20:"Circumstantial Participles",
  va_21:"Genitive Absolute",                va_22:"Conditional Statements",
  va_23:"Principal Parts Strategy",         va_24:"Complex Parsing",
  va_25:"Translation Philosophy",           va_26:"Exegetical Pitfalls",
  va_27:"Extended NT Reading",              va_28:"Final Integration"
};

// ── Navigation ─────────────────────────────────────────────────────────────────
function showBasicVerbsTrack() {
  if (typeof hideBottomNav === "function") hideBottomNav();
  if (typeof showScreen === "function") showScreen("basicVerbsLearnMenu");
  updateVerbBasicMenuProgress();
}

function showAdvVerbsTrack() {
  if (typeof hideBottomNav === "function") hideBottomNav();
  if (typeof showScreen === "function") showScreen("advVerbsLearnMenu");
  updateVerbAdvMenuProgress();
}

function showBasicVerbLesson(lessonId) {
  const dashboard = document.getElementById("verbBasicDashboard");
  if (dashboard) dashboard.style.display = "none";

  document.querySelectorAll(".basic-verb-lesson").forEach(s => s.classList.remove("active"));

  const section = document.getElementById(lessonId + "VbLesson");
  if (!section) { console.warn("Missing basic verb lesson:", lessonId); return; }

  section.classList.add("active");
  currentVerbBasicLesson = lessonId;

  _updateVerbBasicTopBar(lessonId);
  if (typeof _updateAppHeaderForScreen === "function") _updateAppHeaderForScreen("basicVerbsLearnMenu");
  _restoreOpenedVerbBlocks(section, lessonId, "basic");
  _updateVerbCompleteButton(lessonId, "basic");
  requestAnimationFrame(() => section.scrollTo?.(0, 0));
}

function showAdvVerbLesson(lessonId) {
  const dashboard = document.getElementById("verbAdvDashboard");
  if (dashboard) dashboard.style.display = "none";

  document.querySelectorAll(".adv-verb-lesson").forEach(s => s.classList.remove("active"));

  const section = document.getElementById(lessonId + "VaLesson");
  if (!section) { alert("This lesson is coming soon!"); return; }

  section.classList.add("active");
  currentVerbAdvLesson = lessonId;

  _updateVerbAdvTopBar(lessonId);
  if (typeof _updateAppHeaderForScreen === "function") _updateAppHeaderForScreen("advVerbsLearnMenu");
  _shuffleVerbKCOptions(section);
  _restoreOpenedVerbBlocks(section, lessonId, "adv");
  _restoreAnsweredVerbKCs(lessonId, section);
  _checkVerbAdvQuizAvailability(lessonId);

  const savedScores = JSON.parse(localStorage.getItem("verbAdvQuizScores") || "{}");
  if (savedScores[lessonId]) {
    const s = savedScores[lessonId];
    _updateVerbAdvLessonScore(lessonId, s.correct, s.total, s.passed);
  }
  requestAnimationFrame(() => section.scrollTo?.(0, 0));
}

function _shuffleVerbKCOptions(section) {
  section.querySelectorAll(".knowledge-check:not(.answered) .kc-options").forEach(opts => {
    const buttons = Array.from(opts.querySelectorAll(".kc-opt"));
    for (let i = buttons.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      opts.appendChild(buttons[j]);
      [buttons[i], buttons[j]] = [buttons[j], buttons[i]];
    }
  });
}

function handleVerbLearnBack() {
  if (currentVerbBasicLesson) {
    showVerbBasicDashboard();
  } else if (currentVerbAdvLesson) {
    showVerbAdvDashboard();
  } else {
    if (typeof showHome === "function") showHome();
  }
}

function showVerbBasicDashboard() {
  const dashboard = document.getElementById("verbBasicDashboard");
  document.querySelectorAll(".basic-verb-lesson").forEach(s => s.classList.remove("active"));
  if (dashboard) dashboard.style.display = "block";
  currentVerbBasicLesson = null;

  const title = document.getElementById("verbBasicNavTitle");
  const action = document.getElementById("verbBasicTopAction");
  if (title) title.innerHTML = 'Greek Verbs<small class="nav-subtitle">Track 3 — Verbs Basic</small>';
  if (action) {
    action.innerHTML = `<span class="material-symbols-outlined">info</span>`;
    action.title = "About this track";
    action.onclick = _showVerbsBasicInfoModal;
  }
  if (typeof _updateAppHeaderForScreen === "function") _updateAppHeaderForScreen("basicVerbsLearnMenu");
  updateVerbBasicMenuProgress();
}

function showVerbAdvDashboard() {
  const dashboard = document.getElementById("verbAdvDashboard");
  document.querySelectorAll(".adv-verb-lesson").forEach(s => s.classList.remove("active"));
  if (dashboard) dashboard.style.display = "block";
  currentVerbAdvLesson = null;

  const title = document.getElementById("verbAdvNavTitle");
  const action = document.getElementById("verbAdvTopAction");
  if (title) title.innerHTML = 'Greek Verbs<small class="nav-subtitle">Track 4 — Verbs Advanced</small>';
  if (action) {
    action.innerHTML = `<span class="material-symbols-outlined">info</span>`;
    action.title = "About this track";
    action.onclick = _showVerbsAdvInfoModal;
  }
  if (typeof _updateAppHeaderForScreen === "function") _updateAppHeaderForScreen("advVerbsLearnMenu");
  updateVerbAdvMenuProgress();
}

function _updateVerbBasicTopBar(lessonId) {
  const title = document.getElementById("verbBasicNavTitle");
  const action = document.getElementById("verbBasicTopAction");
  if (!title) return;
  const num = VERB_BASIC_LESSONS.indexOf(lessonId) + 1;
  title.innerHTML = `
    <span class="top-lesson-kicker" style="color:var(--accent-color)">Verbs Basic · Lesson ${num}</span>
    <span class="top-lesson-title">${VERB_BASIC_LESSON_TITLES[lessonId] || "Lesson"}</span>
  `;
  if (action) {
    action.innerHTML = `<span class="material-symbols-outlined">info</span>`;
    action.title = "Track Info";
    action.onclick = _showVerbsBasicInfoModal;
  }
}

function _updateVerbAdvTopBar(lessonId) {
  const title = document.getElementById("verbAdvNavTitle");
  const action = document.getElementById("verbAdvTopAction");
  if (!title) return;
  const num = VERB_ADV_LESSONS.indexOf(lessonId) + 1;
  title.innerHTML = `
    <span class="top-lesson-kicker" style="color:#c9a227">Verbs Advanced · Lesson ${num}</span>
    <span class="top-lesson-title">${VERB_ADV_LESSON_TITLES[lessonId] || "Lesson"}</span>
  `;
  if (action) {
    action.innerHTML = `<span class="material-symbols-outlined">info</span>`;
    action.title = "Track Info";
    action.onclick = _showVerbsAdvInfoModal;
  }
}

// ── Progress Displays ──────────────────────────────────────────────────────────
function updateVerbBasicMenuProgress() {
  const done = VERB_BASIC_LESSONS.filter(id => completedVerbBasicLessons[id] === true).length;
  const el = document.getElementById("verbBasicProgressText");
  if (el) el.textContent = `${done} of ${VERB_BASIC_LESSONS.length} complete`;
  if (typeof syncLessonProgressBadge === "function") {
    syncLessonProgressBadge(el, done, VERB_BASIC_LESSONS.length);
  }

  VERB_BASIC_LESSONS.forEach(id => {
    const statusEl = document.querySelector(`[data-verb-lesson-status="${id}"]`);
    if (statusEl) {
      const complete = completedVerbBasicLessons[id] === true;
      statusEl.innerHTML = complete
        ? `<span class="lesson-check">✓</span> Completed`
        : `<span class="lesson-not-complete">○</span> Not completed`;
      statusEl.classList.toggle("completed", complete);
    }
  });
}

function updateVerbAdvMenuProgress() {
  const done = VERB_ADV_LESSONS.filter(id => completedVerbAdvancedLessons[id] === true).length;
  const el = document.getElementById("verbAdvProgressText");
  if (el) el.textContent = `${done} of ${VERB_ADV_LESSONS.length} complete`;
  if (typeof syncLessonProgressBadge === "function") {
    syncLessonProgressBadge(el, done, VERB_ADV_LESSONS.length, true);
  }

  VERB_ADV_LESSONS.forEach(id => {
    const statusEl = document.querySelector(`[data-verb-lesson-status="${id}"]`);
    if (statusEl) {
      const complete = completedVerbAdvancedLessons[id] === true;
      statusEl.innerHTML = complete
        ? `<span class="lesson-check">✓</span> Completed`
        : `<span class="lesson-not-complete">○</span> Not completed`;
      statusEl.classList.toggle("completed", complete);
    }
  });
}

// ── Lesson Block Tracking ──────────────────────────────────────────────────────
function toggleVerbLessonBlock(block, track) {
  const lesson = block.closest(".basic-verb-lesson, .adv-verb-lesson");
  if (!lesson) { block.classList.toggle("open"); return; }

  const wasAlreadyOpen = block.classList.contains("open");

  lesson.querySelectorAll(".lesson-block").forEach(other => {
    if (other !== block && other.classList.contains("open")) {
      other.classList.remove("open");
      _markVerbBlockOpened(lesson, other, track);
    }
  });

  block.classList.toggle("open");

  if (block.classList.contains("open")) {
    block.classList.add("visited");
    block.scrollIntoView({ behavior: "smooth", block: "start" });
    _markVerbBlockOpened(lesson, block, track);
    const lessonId = _getVerbLessonId(lesson, track);
    _updateVerbCompleteButton(lessonId, track);
    if (track === "adv") _checkVerbAdvQuizAvailability(lessonId);
  }

  if (wasAlreadyOpen) {
    _markVerbBlockOpened(lesson, block, track);
    const lessonId = _getVerbLessonId(lesson, track);
    _updateVerbCompleteButton(lessonId, track);
  }
}

function _getVerbLessonId(lesson, track) {
  return lesson.id
    .replace("VbLesson", "")
    .replace("VaLesson", "");
}

function _markVerbBlockOpened(lesson, block, track) {
  const key = track === "basic" ? "openedVerbBasicBlocks" : "openedVerbAdvBlocks";
  const stored = JSON.parse(localStorage.getItem(key) || "{}");
  const lessonId = _getVerbLessonId(lesson, track);
  if (!stored[lessonId]) stored[lessonId] = [];

  const blocks = Array.from(lesson.querySelectorAll(".lesson-block"));
  const idx = blocks.indexOf(block);
  if (idx >= 0) {
    const beforeCount = stored[lessonId].length;
    stored[lessonId] = [...new Set([
      ...stored[lessonId],
      idx,
      _verbBlockKey(block, idx)
    ])];
    localStorage.setItem(key, JSON.stringify(stored));
    if (stored[lessonId].length !== beforeCount) _scheduleVerbOpenedBlocksSync();
  }
}

function _restoreOpenedVerbBlocks(section, lessonId, track) {
  const key = track === "basic" ? "openedVerbBasicBlocks" : "openedVerbAdvBlocks";
  const stored = _mergeVerbOpenedBlockMaps({}, JSON.parse(localStorage.getItem(key) || "{}"));
  localStorage.setItem(key, JSON.stringify(stored));
  const opened = stored[lessonId] || [];
  const blocks = Array.from(section.querySelectorAll(".lesson-block"));
  blocks.forEach((block, idx) => {
    if (opened.includes(idx) || opened.includes(_verbBlockKey(block, idx))) {
      block.classList.add("visited");
    }
  });
}

function _hasOpenedAllVerbBlocks(lessonId, track) {
  const sectionId = track === "basic" ? lessonId + "VbLesson" : lessonId + "VaLesson";
  const section = document.getElementById(sectionId);
  if (!section) return false;
  const key = track === "basic" ? "openedVerbBasicBlocks" : "openedVerbAdvBlocks";
  const stored = JSON.parse(localStorage.getItem(key) || "{}");
  const opened = stored[lessonId] || [];
  const blocks = Array.from(section.querySelectorAll(".lesson-block"));
  const total = blocks.length;
  const openedCount = blocks.filter((block, idx) =>
    opened.includes(idx) || opened.includes(_verbBlockKey(block, idx))
  ).length;
  return total > 0 && openedCount >= total;
}

function _updateVerbCompleteButton(lessonId, track) {
  const btn = document.querySelector(`[data-complete-verb-lesson="${lessonId}"]`);
  const msg = document.querySelector(`[data-complete-verb-message="${lessonId}"]`);
  if (!btn) return;

  const alreadyDone = track === "basic"
    ? completedVerbBasicLessons[lessonId] === true
    : completedVerbAdvancedLessons[lessonId] === true;

  if (alreadyDone) {
    btn.disabled = true;
    btn.textContent = "Completed";
    btn.classList.add("completed");
    if (msg) msg.textContent = "Lesson completed!";
    return;
  }

  const ready = _hasOpenedAllVerbBlocks(lessonId, track);
  btn.disabled = !ready;
  if (msg) {
    msg.textContent = ready
      ? "All sections reviewed. You can complete this lesson."
      : "Open every lesson section before completing this lesson.";
  }
}

// ── Lesson Completion ─────────────────────────────────────────────────────────
function completeVerbBasicLesson(lessonId) {
  if (completedVerbBasicLessons[lessonId] === true) return;
  if (!_hasOpenedAllVerbBlocks(lessonId, "basic")) return;

  completedVerbBasicLessons[lessonId] = true;
  localStorage.setItem("completedVerbBasicLessons", JSON.stringify(completedVerbBasicLessons));

  const btn = document.querySelector(`[data-complete-verb-lesson="${lessonId}"]`);
  const msg = document.querySelector(`[data-complete-verb-message="${lessonId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = "Completed"; btn.classList.add("completed"); }
  if (msg) msg.textContent = "Lesson completed!";

  updateVerbBasicMenuProgress();

  if (typeof addXP === "function") addXP(100, "Verb lesson completed!", true);
  if (typeof unlockAchievement === "function") {
    unlockAchievement("firstVerbLesson");
    const done = VERB_BASIC_LESSONS.filter(id => completedVerbBasicLessons[id]).length;
    if (done >= 5)  unlockAchievement("verbExplorer");
    if (done >= VERB_BASIC_LESSONS.length) unlockAchievement("verbBasicComplete");
  }

  if (typeof syncUserData === "function") syncUserData();
  _showVerbLessonCompleteModal("basic");
}

function completeVerbAdvancedLesson(lessonId) {
  if (completedVerbAdvancedLessons[lessonId] === true) return;

  completedVerbAdvancedLessons[lessonId] = true;
  localStorage.setItem("completedVerbAdvancedLessons", JSON.stringify(completedVerbAdvancedLessons));

  updateVerbAdvMenuProgress();

  if (typeof addXP === "function") {
    const scores = JSON.parse(localStorage.getItem("verbAdvQuizScores") || "{}");
    const s = scores[lessonId];
    const isPerfect = s && s.correct === s.total;
    addXP(150, "Advanced verb lesson completed!", true);
    if (isPerfect) addXP(50, "Perfect quiz bonus!", false);
  }

  if (typeof unlockAchievement === "function") {
    const done = VERB_ADV_LESSONS.filter(id => completedVerbAdvancedLessons[id]).length;
    unlockAchievement("firstVerbLesson");
    if (done >= 1)  unlockAchievement("verbExplorer");
    if (["va_01","va_02","va_03"].every(id => completedVerbAdvancedLessons[id]))
      unlockAchievement("presentTenseMaster");
    if (["va_06","va_07","va_08","va_09"].every(id => completedVerbAdvancedLessons[id]))
      unlockAchievement("aoristExplorer");
    if (["va_11","va_12","va_13","va_14"].every(id => completedVerbAdvancedLessons[id]))
      unlockAchievement("voiceDetective");
    if (["va_18","va_19","va_20","va_21"].every(id => completedVerbAdvancedLessons[id]))
      unlockAchievement("participleApprentice");
    if (done >= 10) unlockAchievement("greekReader1");
    if (done >= 20) unlockAchievement("greekReader2");
    if (done >= VERB_ADV_LESSONS.length) {
      unlockAchievement("greekReader3");
      unlockAchievement("verbScholar");
      unlockAchievement("verbAdvComplete");
    }
  }

  if (typeof syncUserData === "function") syncUserData();
  _showVerbLessonCompleteModal("adv");
}

function _showVerbLessonCompleteModal(track) {
  const modal = document.getElementById("verbLessonCompleteModal");
  if (!modal) return;
  const nextBtn = document.getElementById("verbNextLessonBtn");
  modal.classList.add("active");
  if (nextBtn) {
    nextBtn.onclick = () => {
      modal.classList.remove("active");
      if (track === "basic") showVerbBasicDashboard();
      else showVerbAdvDashboard();
    };
  }
}

// ── Advanced Verb KC System ────────────────────────────────────────────────────
function answerVerbKC(checkId, el) {
  const container = document.getElementById(checkId);
  if (!container || container.classList.contains("answered")) return;

  const kcData = VERB_ADV_KC_DATA[checkId];
  if (!kcData) return;

  const optIdx = parseInt(el.dataset.opt, 10);
  const optData = kcData[optIdx];
  const isCorrect = optData.correct === true;

  container.classList.add("answered");
  container.querySelectorAll(".kc-opt").forEach((btn, i) => {
    btn.disabled = true;
    if (kcData[i].correct) btn.classList.add("kc-correct");
  });
  if (!isCorrect) el.classList.add("kc-wrong");

  const feedback = document.getElementById(checkId + "_fb");
  if (feedback) {
    feedback.textContent = optData.feedback;
    feedback.className = "kc-feedback " + (isCorrect ? "kc-fb-correct" : "kc-fb-wrong");
  }

  const section = container.closest(".adv-verb-lesson");
  const lessonId = section?.id?.replace("VaLesson", "");
  if (lessonId) {
    if (!answeredVerbKCs[lessonId]) answeredVerbKCs[lessonId] = {};
    answeredVerbKCs[lessonId][checkId] = true;
    localStorage.setItem("answeredVerbKCs", JSON.stringify(answeredVerbKCs));
    _checkVerbAdvQuizAvailability(lessonId);
  }
}

function _restoreAnsweredVerbKCs(lessonId, section) {
  const answered = answeredVerbKCs[lessonId] || {};
  section.querySelectorAll(".knowledge-check").forEach(kc => {
    if (answered[kc.id]) {
      kc.classList.add("answered");
      kc.querySelectorAll(".kc-opt").forEach(btn => { btn.disabled = true; });
      const fb = document.getElementById(kc.id + "_fb");
      if (fb && fb.className === "kc-feedback") {
        fb.textContent = "You already answered this question.";
        fb.className = "kc-feedback kc-fb-correct";
      }
    }
  });
}

function _checkVerbAdvQuizAvailability(lessonId) {
  const section = document.getElementById(lessonId + "VaLesson");
  if (!section) return;

  const allBlocksOpened = _hasOpenedAllVerbBlocks(lessonId, "adv");

  const kcIds = Array.from(section.querySelectorAll(".knowledge-check")).map(kc => kc.id);
  const lessonAnswered = answeredVerbKCs[lessonId] || {};
  const allKCsAnswered = kcIds.length === 0 || kcIds.every(id => lessonAnswered[id] === true);

  const canStart = allBlocksOpened && allKCsAnswered;

  const startBtn = document.getElementById("startVerbQuiz_" + lessonId);
  const hint = document.getElementById("verbQuizHint_" + lessonId);
  if (startBtn) startBtn.disabled = !canStart;
  if (hint) hint.style.display = canStart ? "none" : "block";
}

// ── Verb Quiz System ───────────────────────────────────────────────────────────
let _currentVerbQuizLesson = null;
let _currentVerbQuizAnswers = [];
let _currentVerbQuizQIdx = 0;

function openVerbAdvQuiz(lessonId) {
  const data = VERB_ADV_QUIZ_DATA[lessonId];
  if (!data) return;

  _currentVerbQuizLesson = lessonId;
  _currentVerbQuizAnswers = new Array(data.questions.length).fill(null);
  _currentVerbQuizQIdx = 0;

  const modal = document.getElementById("verbQuizModal");
  if (!modal) return;

  document.getElementById("verbQuizModalResult")?.classList.add("hidden");
  document.getElementById("verbQuizModalBody")?.classList.remove("hidden");

  _renderVerbQuizQ(0);
  modal.classList.add("open");
}

function closeVerbQuizModal(event) {
  if (!event || event.target.id === "verbQuizModal") {
    document.getElementById("verbQuizModal")?.classList.remove("open");
  }
}

function _renderVerbQuizQ(idx) {
  const data = VERB_ADV_QUIZ_DATA[_currentVerbQuizLesson];
  const q = data.questions[idx];
  const total = data.questions.length;
  const prevAnswer = _currentVerbQuizAnswers[idx];
  const isLast = idx === total - 1;
  const allDone = _currentVerbQuizAnswers.every(a => a !== null);

  const fill = document.getElementById("verbQuizModalFill");
  const counter = document.getElementById("verbQuizModalCounter");
  const backBtn = document.getElementById("verbQuizBackBtn");

  if (fill) fill.style.width = `${(idx / total) * 100}%`;
  if (counter) counter.textContent = `${idx + 1} / ${total}`;
  if (backBtn) backBtn.style.visibility = idx === 0 ? "hidden" : "visible";

  const body = document.getElementById("verbQuizModalBody");
  if (!body) return;

  body.innerHTML = `
    <p class="quiz-modal-q-text">${q.text}</p>
    <div class="quiz-modal-opts">
      ${q.options.map((opt, i) => `
        <button class="quiz-modal-opt ${prevAnswer === i ? "qm-selected" : ""}"
          onclick="_selectVerbQuizAns(${i})"
          ${prevAnswer !== null && prevAnswer !== i ? "disabled" : ""}>
          ${opt}
        </button>`).join("")}
    </div>
    ${isLast && allDone ? `<button class="main-btn quiz-see-results-btn" onclick="_finishVerbQuiz()">See Results</button>` : ""}
  `;

  body.classList.remove("quiz-modal-body-animate");
  void body.offsetHeight;
  body.classList.add("quiz-modal-body-animate");
}

function _selectVerbQuizAns(optIdx) {
  const data = VERB_ADV_QUIZ_DATA[_currentVerbQuizLesson];
  const total = data.questions.length;
  _currentVerbQuizAnswers[_currentVerbQuizQIdx] = optIdx;
  document.querySelectorAll("#verbQuizModalBody .quiz-modal-opt").forEach(btn => { btn.disabled = true; });

  const isLast = _currentVerbQuizQIdx === total - 1;
  if (isLast) {
    document.querySelectorAll("#verbQuizModalBody .quiz-modal-opt").forEach((btn, i) => {
      if (i === optIdx) btn.classList.add("qm-selected");
    });
    setTimeout(() => _renderVerbQuizQ(_currentVerbQuizQIdx), 250);
  } else {
    setTimeout(() => { _currentVerbQuizQIdx++; _renderVerbQuizQ(_currentVerbQuizQIdx); }, 180);
  }
}

function verbQuizGoBack() {
  if (_currentVerbQuizQIdx > 0) {
    _currentVerbQuizQIdx--;
    _currentVerbQuizAnswers[_currentVerbQuizQIdx] = null;
    _renderVerbQuizQ(_currentVerbQuizQIdx);
  }
}

function _finishVerbQuiz() {
  const lessonId = _currentVerbQuizLesson;
  const data = VERB_ADV_QUIZ_DATA[lessonId];
  const total = data.questions.length;
  let correct = 0;
  _currentVerbQuizAnswers.forEach((ans, i) => { if (ans === data.questions[i].correct) correct++; });
  const passed = correct >= data.passMark;

  document.getElementById("verbQuizModalBody")?.classList.add("hidden");
  const fill = document.getElementById("verbQuizModalFill");
  if (fill) fill.style.width = "100%";

  const result = document.getElementById("verbQuizModalResult");
  if (!result) return;
  result.classList.remove("hidden");

  const seeAnswersBtn = correct < total
    ? `<br><button class="text-btn" style="margin-top:6px" onclick="_showVerbQuizAnswers()">See Answers</button>`
    : "";

  result.innerHTML = passed
    ? `<div class="quiz-result-icon">🎉</div>
       <h3>${correct} / ${total} Correct</h3>
       <p>You passed! You can now complete this lesson.</p>
       <button class="main-btn" onclick="completeVerbAdvancedLesson('${lessonId}'); closeVerbQuizModal();">Complete Lesson</button>
       <br><button class="text-btn" style="margin-top:10px" onclick="_retryVerbQuiz()">Retake Quiz</button>
       ${seeAnswersBtn}`
    : `<div class="quiz-result-icon">📖</div>
       <h3>${correct} / ${total} Correct</h3>
       <p>You need ${data.passMark}/${total} to pass. Review the lesson and try again.</p>
       <button class="main-btn" onclick="_retryVerbQuiz()">Try Again</button>
       ${seeAnswersBtn}`;

  const scores = JSON.parse(localStorage.getItem("verbAdvQuizScores") || "{}");
  scores[lessonId] = { correct, total, passed };
  localStorage.setItem("verbAdvQuizScores", JSON.stringify(scores));
  _updateVerbAdvLessonScore(lessonId, correct, total, passed);
}

function _retryVerbQuiz() {
  const data = VERB_ADV_QUIZ_DATA[_currentVerbQuizLesson];
  _currentVerbQuizAnswers = new Array(data.questions.length).fill(null);
  _currentVerbQuizQIdx = 0;
  document.getElementById("verbQuizModalResult")?.classList.add("hidden");
  document.getElementById("verbQuizModalBody")?.classList.remove("hidden");
  _renderVerbQuizQ(0);
}

function _showVerbQuizAnswers() {
  const data = VERB_ADV_QUIZ_DATA[_currentVerbQuizLesson];
  const result = document.getElementById("verbQuizModalResult");
  if (!result || !data) return;

  const rows = data.questions.map((q, i) => {
    const userAns = _currentVerbQuizAnswers[i];
    const correctAns = q.correct;
    const isCorrect = userAns === correctAns;
    const userLabel = userAns !== null ? q.options[userAns] : "—";
    const correctLabel = q.options[correctAns];
    return `
      <div class="quiz-answer-row">
        <p class="quiz-answer-q">${i + 1}. ${q.text}</p>
        ${!isCorrect ? `<p class="quiz-answer-wrong">✗ Your answer: ${userLabel}</p>` : ""}
        <p class="quiz-answer-correct">✓ ${isCorrect ? "Correct: " : ""}${correctLabel}</p>
      </div>`;
  }).join("");

  result.innerHTML = `
    <div class="quiz-answer-review">
      <h3 style="margin:0 0 14px">Answer Review</h3>
      ${rows}
    </div>
    <button class="text-btn" style="margin-top:12px" onclick="_finishVerbQuiz()">Back to Results</button>
  `;
}

function _updateVerbAdvLessonScore(lessonId, correct, total, passed) {
  const el = document.getElementById("verbLessonScore_" + lessonId);
  if (!el) return;
  el.textContent = `${correct}/${total} ${passed ? "· Passed ✓" : "· Try Again"}`;
  el.className = "lesson-score-badge " + (passed ? "score-passed" : "score-failed");
  el.style.display = "inline-flex";
}

// ── Info Modals ────────────────────────────────────────────────────────────────
function _showVerbsBasicInfoModal() {
  const modal = document.getElementById("verbsBasicInfoModal");
  if (modal) modal.classList.add("open");
}

function closeVerbsBasicInfoModal(event) {
  if (!event || event.target.id === "verbsBasicInfoModal") {
    document.getElementById("verbsBasicInfoModal")?.classList.remove("open");
  }
}

function _showVerbsAdvInfoModal() {
  const modal = document.getElementById("verbsAdvInfoModal");
  if (modal) modal.classList.add("open");
}

function closeVerbsAdvInfoModal(event) {
  if (!event || event.target.id === "verbsAdvInfoModal") {
    document.getElementById("verbsAdvInfoModal")?.classList.remove("open");
  }
}

// ── Data sync helpers ──────────────────────────────────────────────────────────
function getVerbSyncData() {
  return {
    completedVerbBasicLessons: completedVerbBasicLessons || {},
    completedVerbAdvancedLessons: completedVerbAdvancedLessons || {},
    answeredVerbKCs: answeredVerbKCs || {},
    openedVerbBasicBlocks: (() => { try { return JSON.parse(localStorage.getItem("openedVerbBasicBlocks") || "{}"); } catch { return {}; } })(),
    openedVerbAdvBlocks: (() => { try { return JSON.parse(localStorage.getItem("openedVerbAdvBlocks") || "{}"); } catch { return {}; } })(),
    verbAdvQuizScores: (() => { try { return JSON.parse(localStorage.getItem("verbAdvQuizScores") || "{}"); } catch { return {}; } })()
  };
}

function loadVerbDataFromSync(data) {
  if (data.completedVerbBasicLessons) {
    completedVerbBasicLessons = data.completedVerbBasicLessons;
    localStorage.setItem("completedVerbBasicLessons", JSON.stringify(completedVerbBasicLessons));
  }
  if (data.completedVerbAdvancedLessons) {
    completedVerbAdvancedLessons = data.completedVerbAdvancedLessons;
    localStorage.setItem("completedVerbAdvancedLessons", JSON.stringify(completedVerbAdvancedLessons));
  }
  if (data.answeredVerbKCs) {
    answeredVerbKCs = data.answeredVerbKCs;
    localStorage.setItem("answeredVerbKCs", JSON.stringify(answeredVerbKCs));
  }
  if (data.openedVerbBasicBlocks) {
    const local = JSON.parse(localStorage.getItem("openedVerbBasicBlocks") || "{}");
    localStorage.setItem(
      "openedVerbBasicBlocks",
      JSON.stringify(_mergeVerbOpenedBlockMaps(local, data.openedVerbBasicBlocks))
    );
  }
  if (data.openedVerbAdvBlocks) {
    const local = JSON.parse(localStorage.getItem("openedVerbAdvBlocks") || "{}");
    localStorage.setItem(
      "openedVerbAdvBlocks",
      JSON.stringify(_mergeVerbOpenedBlockMaps(local, data.openedVerbAdvBlocks))
    );
  }
  if (data.verbAdvQuizScores)
    localStorage.setItem("verbAdvQuizScores", JSON.stringify(data.verbAdvQuizScores));
}

function resetVerbLessonData() {
  const confirmed = confirm(
    "Reset all Greek Verbs lesson data?\n\nThis clears verb lesson completion, quiz scores, and opened sections. Cannot be undone."
  );
  if (!confirmed) return;

  completedVerbBasicLessons = {};
  completedVerbAdvancedLessons = {};
  answeredVerbKCs = {};

  localStorage.removeItem("completedVerbBasicLessons");
  localStorage.removeItem("completedVerbAdvancedLessons");
  localStorage.removeItem("answeredVerbKCs");
  localStorage.removeItem("openedVerbBasicBlocks");
  localStorage.removeItem("openedVerbAdvBlocks");
  localStorage.removeItem("verbAdvQuizScores");

  updateVerbBasicMenuProgress();
  updateVerbAdvMenuProgress();

  if (typeof syncUserData === "function") syncUserData();
  alert("Greek Verbs lesson data has been reset.");
}

// ── KC Data ────────────────────────────────────────────────────────────────────
const VERB_ADV_KC_DATA = {
  kc_va_01_1: [
    { feedback: "That is certainly one thing verbs communicate, but Greek verbs carry much more — perspective, progression, emphasis, and more." },
    { correct: true, feedback: "Exactly right. Greek verbs communicate action, perspective, progression, emphasis, condition, and expectation all within a single form." },
    { feedback: "Tense and person are part of what verbs communicate, but Greek verbs carry voice, mood, and aspect as well." },
    { feedback: "Nouns and adjectives communicate grammatical relationships within clauses; verbs carry the full range of communicative functions listed." }
  ],
  kc_va_01_2: [
    { feedback: "Speed-reading is not the primary purpose of parsing. Parsing explains how a verb communicates, not how quickly one reads." },
    { correct: true, feedback: "Correct! Parsing is a tool for understanding what a verb is communicating — its time, perspective, and grammatical relationship. It serves comprehension, not an end in itself." },
    { feedback: "Parsing does build familiarity, but vocabulary is a separate discipline. Parsing identifies the grammatical information a verb carries." },
    { feedback: "Translation is helped by parsing, but the primary purpose is to explain the verb's communicative function in context." }
  ],
  kc_va_02_1: [
    { feedback: "English does require a subject before the verb, but Greek works differently — the verb ending itself carries the subject." },
    { correct: true, feedback: "Correct! In Greek, the verb ending communicates person and number, embedding the subject within the verb itself. γράφω = 'I write' — the -ω ending says 'I.'" },
    { feedback: "Definite articles mark nouns, not verb subjects. The subject is embedded in the verb ending." },
    { feedback: "Greek does not rely on word position for subject identification. Endings carry grammatical function; word order carries emphasis." }
  ],
  kc_va_02_2: [
    { feedback: "Explicit pronouns do not change tense. Tense is communicated by the verb stem and ending." },
    { correct: true, feedback: "Exactly! When a Greek writer adds an explicit pronoun alongside a verb that already communicates the subject, the pronoun typically adds emphasis, contrast, or clarification — a deliberate rhetorical choice." },
    { feedback: "Passive voice is communicated by the verb form itself, not by adding a pronoun." },
    { feedback: "Questions in Greek are typically indicated by question words or the particle ἆρα, not by pronoun addition." }
  ],
  kc_va_03_1: [
    { feedback: "Past completed action is more typical of the aorist. The present tense portrays action differently — as ongoing or in progress." },
    { correct: true, feedback: "Correct! The present tense typically portrays action as ongoing, unfolding, or in progress — what linguists call imperfective aspect." },
    { feedback: "Future expectation is communicated by the future tense. The present tense portrays action as occurring now, in an ongoing way." },
    { feedback: "Completed action with ongoing result describes the perfect tense more accurately. The present tense communicates ongoing or in-progress action." }
  ],
  kc_va_03_2: [
    { feedback: "That would make Greek similar to English — collapsing tense to just time. Greek communicates both aspect and time reference." },
    { correct: true, feedback: "Correct! Reducing the present tense to 'present time' ignores its imperfective aspect — the way it portrays action as ongoing or unfolding. Both time and aspect are operative." },
    { feedback: "Confusion with the imperfect is a real risk, but the primary mistake to avoid is reducing the present to simple time reference." },
    { feedback: "English and Greek present tenses are genuinely different. The key mistake is reducing the Greek present to only present time reference." }
  ],
  kc_va_04_1: [
    { feedback: "Letters and commands use a variety of tenses. The imperfect is especially characteristic of narrative sections." },
    { correct: true, feedback: "Correct! The imperfect tense frequently appears in narrative sections because it portrays past ongoing or unfolding action — helping readers see scenes as they develop." },
    { feedback: "Purpose clauses typically use the subjunctive. The imperfect is a past indicative tense found most prominently in narrative." },
    { feedback: "The imperfect is not restricted to direct speech. It appears throughout narrative sections in the Gospels and Acts." }
  ],
  kc_va_04_2: [
    { feedback: "That reverses the relationship. The imperfect is a past tense and the aorist is also a past tense — they communicate the same event from different perspectives." },
    { correct: true, feedback: "Exactly right! The imperfect portrays action as ongoing or unfolding; the aorist presents it as a complete whole. Both are past tenses, but their aspects differ." },
    { feedback: "Both the imperfect and aorist can be active voice. The distinction is aspectual, not about voice." },
    { feedback: "Neither tense is inherently emphatic or de-emphasized — aspect (not emphasis) is the key difference between imperfect and aorist." }
  ],
  kc_va_05_1: [
    { feedback: "Simple future facts are one use, but the Greek future can communicate much more — including promises, warnings, and confident expectations." },
    { correct: true, feedback: "Correct! Greek future tense verbs can communicate expectation, prediction, promise, or warning depending on context. The same form serves different communicative functions." },
    { feedback: "The future is not restricted to divine pronouncements. It is used by all speakers to communicate forward-looking ideas of various kinds." },
    { feedback: "Questions about the future are typically formed with specific question words. Future tense verbs themselves communicate expectation, prediction, promise, or warning." }
  ],
  kc_va_05_2: [
    { feedback: "Person and number are important for identifying the subject, but they do not determine the communicative force (promise, warning, etc.)." },
    { correct: true, feedback: "Correct! Context — who is speaking, to whom, and in what situation — determines whether a future verb communicates promise, warning, prediction, or simple expectation." },
    { feedback: "Augment is used in past tense forms, not future forms. The augment does not affect future force." },
    { feedback: "Word position carries emphasis in Greek, but the specific force (promise vs. warning) is determined by context, not position." }
  ],
  kc_va_06_1: [
    { feedback: "Past ongoing action is the imperfect tense. The aorist has a different aspect — presenting action as a complete or undefined whole." },
    { correct: true, feedback: "Correct! The aorist typically presents action as a complete or undefined whole — without commenting on duration or repetition. This is what distinguishes it from the imperfect." },
    { feedback: "Completed action with ongoing result is the perfect tense. The aorist presents a whole event without necessarily emphasizing the continuing result." },
    { feedback: "Future expectation is the future tense. The aorist is a past tense presenting action as a complete whole." }
  ],
  kc_va_06_2: [
    { feedback: "The aorist is actually quite common in the NT — this is not the concern. The issue is interpretive overreach." },
    { correct: true, feedback: "Correct! Calling the aorist 'once-for-all' oversimplifies. The aorist does not by itself communicate that an action cannot be repeated. Over-reading it leads to inflated theological claims." },
    { feedback: "The aorist is not meaningless — it communicates a real perspective. The concern is about reading too much into it." },
    { feedback: "Calling the aorist 'the tense of completion' is another oversimplification. The aorist presents a whole event — not necessarily one that is complete in the sense of having ongoing results." }
  ],
  kc_va_07_1: [
    { feedback: "That describes an ingressive use — focusing on the beginning of an action." },
    { correct: true, feedback: "Correct! A constative use views the entire event as a whole unit, without focusing on any particular moment within it." },
    { feedback: "That describes a culminative use — emphasizing the end result. Constative presents the whole event without particular focus." },
    { feedback: "That describes ongoing action, more typical of the imperfect or present, not a constative aorist." }
  ],
  kc_va_07_2: [
    { feedback: "The end result or climax is more typical of the culminative category. Ingressive focuses on entry into an action." },
    { correct: true, feedback: "Exactly! The ingressive (inceptive) use of the aorist focuses on the beginning or entry into an action or state." },
    { feedback: "Describing action as ongoing throughout is more typical of the imperfect or present tense." },
    { feedback: "Ingressive focuses on beginning, not completion. These categories describe patterns, not rigid rules." }
  ],
  kc_va_08_1: [
    { feedback: "The beginning of an action is the ingressive category. The culminative use emphasizes the end result." },
    { correct: true, feedback: "Correct! The culminative (effective) use of the aorist emphasizes the completion or end result — that the action reached its culmination." },
    { feedback: "The midpoint of action is not a standard aorist category. Constative, ingressive, and culminative are the three most common." },
    { feedback: "Repeated action is more typical of iterative language. The culminative focuses on the final result." }
  ],
  kc_va_08_2: [
    { feedback: "The categories are based on real patterns. But they are interpretive tools, not mechanical rules." },
    { correct: true, feedback: "Correct! These categories — constative, ingressive, culminative — are analytical tools that describe patterns. Context always determines which label, if any, best fits." },
    { feedback: "Rejecting the categories entirely would leave students without interpretive tools. The key is to use them carefully and contextually." },
    { feedback: "Context is primary — the categories articulate what context shows, not override it." }
  ],
  kc_va_09_1: [
    { feedback: "Second aorists function the same as first aorists — the difference is in form, not meaning." },
    { correct: true, feedback: "Correct! Second aorists look different (different stem) but function the same as first aorists. The challenge is recognition, not interpretation." },
    { feedback: "Second aorists are not restricted to passive voice. They appear in all voices." },
    { feedback: "Second aorists appear across various moods. The key characteristic is the stem change, not a restriction to the subjunctive." }
  ],
  kc_va_09_2: [
    { feedback: "While knowing which verbs are deponent is useful, the key skill for second aorists specifically is stem recognition." },
    { correct: true, feedback: "Correct! The key practical skill for second aorists is recognizing the changed stems. Once students know forms like εἶπον (from λέγω) and ἦλθον (from ἔρχομαι), they can work with these common forms confidently." },
    { feedback: "Second aorists should not be avoided — they are very common in NT Greek. εἶπον (said) and ἦλθον (came) appear hundreds of times." },
    { feedback: "Second aorists are not translated differently from first aorists. They communicate the same aorist aspect." }
  ],
  kc_va_10_1: [
    { feedback: "Greek and English tense work differently. Greek involves both time reference and aspect — a distinction English collapses." },
    { correct: true, feedback: "Correct! Greek tense systems involve both aspect (how the action is portrayed) and temporal reference (when it occurs). Both are present and both matter for careful reading." },
    { feedback: "Claiming Greek has no time reference would be an overcorrection. Time and aspect both operate in the Greek tense system." },
    { feedback: "Greek is not the same as Hebrew in this regard. Greek tense involves both time and aspect working together." }
  ],
  kc_va_10_2: [
    { feedback: "Claiming time is completely irrelevant would be an overcorrection. Temporal reference is real in Greek tense systems." },
    { correct: true, feedback: "Correct! Extreme dogmatism in either direction — 'Greek is only about aspect' or 'Greek is only about time' — misrepresents how the system works. Both operate together." },
    { feedback: "Reducing Greek tense to only time reference ignores the well-established role of aspect in communicating how action is viewed." },
    { feedback: "Replacing time with pure aspect is an overcorrection. Both time and aspect need to be accounted for in a balanced analysis." }
  ],
  kc_va_11_1: [
    { feedback: "Receiving action describes the passive voice. In active voice, the subject performs the action." },
    { correct: true, feedback: "Exactly! In active voice, the subject performs or initiates the action. This is the default voice that establishes the subject as the grammatical agent." },
    { feedback: "Subject involvement in a result describes certain middle voice uses. Active voice simply indicates the subject is the agent." },
    { feedback: "Passive voice is when the subject receives action. Active is when the subject performs it." }
  ],
  kc_va_11_2: [
    { feedback: "Urgency is not what active voice communicates — urgency is a contextual quality, not a grammatical one." },
    { correct: true, feedback: "Correct! Active voice communicates subject agency — the subject is the one acting or initiating. This is the core grammatical information the active voice carries." },
    { feedback: "Word order carries emphasis, not grammatical function. Active voice is about the agent role, not position." },
    { feedback: "Whether an action is repeated or one-time belongs to verbal aspect, not voice." }
  ],
  kc_va_12_1: [
    { feedback: "That describes the passive voice. The middle voice is distinct and more nuanced." },
    { correct: true, feedback: "Exactly! 'The subject acts on itself' captures some middle uses but misses many others. The middle often communicates subject involvement, interest, or participation without requiring reflexive action." },
    { feedback: "The middle voice does not primarily communicate past action — tense communicates that." },
    { feedback: "The passive voice is when the subject receives action from an external agent. The middle is distinct from the passive." }
  ],
  kc_va_12_2: [
    { feedback: "That is the passive voice — the subject receives action. The middle communicates something different." },
    { correct: true, feedback: "Correct! The middle voice typically communicates subject involvement, interest, or participation — not simply reflexive action. This is why oversimplification leads to poor translations." },
    { feedback: "The middle voice is not about conditionality — that belongs to the subjunctive mood." },
    { feedback: "Number is communicated by the verb ending, not by voice." }
  ],
  kc_va_13_1: [
    { feedback: "Performing the action describes the active voice. Passive is the opposite." },
    { correct: true, feedback: "Correct! In passive voice, the grammatical subject receives the action rather than performing it. This shifts focus from agent to recipient." },
    { feedback: "When the subject both performs and receives, that describes certain reflexive or middle constructions." },
    { feedback: "Passive voice is not about future action. It is about the direction of action relative to the subject." }
  ],
  kc_va_13_2: [
    { feedback: "The divine passive does not name God explicitly — it implies God as the agent. The point is that the naming is avoided." },
    { correct: true, feedback: "Exactly! The divine passive (theological passive) is a Jewish rhetorical convention where God is implied as the agent without being named. 'You will be forgiven' implies 'God will forgive you.'" },
    { feedback: "Divine passives are a culturally conventional way of implying a known agent — not hiding information." },
    { feedback: "Not every passive in the NT implies God as agent. The divine passive is a specific pattern identified by context and convention." }
  ],
  kc_va_14_1: [
    { correct: true, feedback: "Correct! Deponent verbs have no active forms in the lexicon but are translated actively. ἔρχομαι (I come/go) is a well-known example." },
    { feedback: "Deponent verbs can be translated — they are not incomplete. They simply lack active forms while carrying active meaning." },
    { feedback: "Deponent verbs appear in middle or passive forms (not active). The direction is opposite." },
    { feedback: "Accent patterns are separate from the deponent category. Deponent refers to voice morphology, not accent." }
  ],
  kc_va_14_2: [
    { feedback: "The scholarly conversation is active and concerns meaning, not memorization strategy." },
    { correct: true, feedback: "Correct! The debate centers on whether 'deponent' middle/passive forms are semantically empty (just active meaning) or communicate something real about subject involvement. This is an ongoing scholarly conversation." },
    { feedback: "The scholarly debate is about semantics, not which books contain deponent verbs." },
    { feedback: "Middle voice forms are not the same as passive, and deponents in middle form are translated actively — not as passive." }
  ],
  kc_va_15_1: [
    { feedback: "Person and number identify the subject and plurality, but not the force or tone of the command." },
    { correct: true, feedback: "Correct! Context — the relationship between speakers, the tone of the surrounding discourse, and cultural factors — determines the urgency and tone of a Greek imperative." },
    { feedback: "The grammatical form identifies the command category, but force and urgency come from context." },
    { feedback: "Present vs. aorist imperatives communicate different aspects (ongoing vs. single), but urgency is contextual." }
  ],
  kc_va_15_2: [
    { feedback: "A single immediate command is more typical of the aorist imperative. The present imperative tends toward ongoing or habitual action." },
    { correct: true, feedback: "Correct! The present imperative often communicates ongoing or habitual action — 'keep doing' or 'do this regularly' — while the aorist tends toward a single definite action. Both are tendencies, not absolute rules." },
    { feedback: "A future expected action is communicated by the future tense, not the imperative mood." },
    { feedback: "The present imperative is not about past actions. It communicates ongoing or habitual present/continuous action." }
  ],
  kc_va_16_1: [
    { feedback: "Commands are communicated by the imperative mood. The subjunctive is for possibility and contingency." },
    { correct: true, feedback: "Correct! The subjunctive typically communicates possibility, contingency, or expectation — not simple assertion of fact. It frequently appears in conditional clauses, purpose clauses, and deliberative questions." },
    { feedback: "Past completed action is communicated by the aorist indicative. The subjunctive is not primarily a past tense." },
    { feedback: "Direct statements of reality use the indicative mood. The subjunctive communicates the realm of possibility or contingency." }
  ],
  kc_va_16_2: [
    { feedback: "καί is a simple connective conjunction. It does not specifically introduce subjunctive clauses." },
    { feedback: "ἀλλά introduces contrasting clauses. It is not the primary subjunctive conjunction." },
    { correct: true, feedback: "Correct! ἵνα + subjunctive is one of the most common subjunctive constructions in the NT, typically communicating purpose ('in order that') or result ('so that')." },
    { feedback: "γάρ introduces causal or explanatory clauses, usually with the indicative. It is not the primary subjunctive conjunction." }
  ],
  kc_va_17_1: [
    { feedback: "A verbal adjective describes the participle. The infinitive is more like a verbal noun." },
    { correct: true, feedback: "Correct! The Greek infinitive is a verbal noun — it has verbal characteristics (takes objects, communicates aspect) and also functions like a noun (subject, object, complement)." },
    { feedback: "A verbal conjunction would be something that connects clauses verbally. The infinitive functions nominally." },
    { feedback: "A verbal article is not a standard grammatical category. The infinitive is a verbal noun." }
  ],
  kc_va_17_2: [
    { feedback: "The articular infinitive does not primarily communicate past time. The article enables different case functions." },
    { correct: true, feedback: "Correct! When an infinitive takes an article, it can function in different case roles — nominative (subject), accusative (object), or with prepositions in various other roles. The article clarifies its syntactic function." },
    { feedback: "The articular infinitive is not the same as a participle. The participle is a verbal adjective; the articular infinitive is a verbal noun with an article." },
    { feedback: "The articular infinitive is not a subjunctive equivalent. It is a distinct construction using the infinitive form." }
  ],
  kc_va_18_1: [
    { correct: true, feedback: "Correct! Participles blend verbal force (tense, voice, can take objects) with adjectival function (modify nouns, agree in gender, case, number). This blend makes them versatile and essential in NT Greek." },
    { feedback: "That describes a pure adjective. Participles have verbal force too — they carry aspect and can take direct objects." },
    { feedback: "That describes a finite verb. Participles also have adjectival function — they modify nouns and agree with them." },
    { feedback: "That describes a conjunction. Participles are verb forms that function adjectively." }
  ],
  kc_va_18_2: [
    { feedback: "Rare is not accurate. Participles appear constantly throughout the NT — they are one of the most frequent forms students encounter." },
    { correct: true, feedback: "Correct! Participles are extremely common in NT Greek — they appear in nearly every passage. Confident handling of participles is essential for advanced reading." },
    { feedback: "Participles are found throughout NT genres — narrative, epistles, and apocalyptic — not just in John." },
    { feedback: "Participles appear throughout the NT corpus, not only in Paul's letters." }
  ],
  kc_va_19_1: [
    { feedback: "A main verb would be a finite verb, not a participle." },
    { correct: true, feedback: "Correct! An attributive participle functions like an adjective — it modifies a specific noun and agrees with it in gender, case, and number." },
    { feedback: "Adverbs modify verbs or adjectives. Attributive participles modify nouns." },
    { feedback: "Conjunctions connect clauses. Attributive participles modify nouns within noun phrases." }
  ],
  kc_va_19_2: [
    { feedback: "That would indicate a predicate position, not the classic attributive construction." },
    { correct: true, feedback: "Correct! The article-participle-noun or article-noun-article-participle construction is the classic attributive position. When a participle is in this 'sandwich' with the article, it is functioning attributively." },
    { feedback: "Participles do not need καί to function attributively. The article positions them grammatically." },
    { feedback: "That describes a genitive relationship, not an attributive participle construction." }
  ],
  kc_va_20_1: [
    { feedback: "Modifying a specific noun describes attributive participles, not circumstantial ones." },
    { correct: true, feedback: "Correct! A circumstantial participle describes the circumstances surrounding the main clause action — it is loosely attached to the main verb situation rather than modifying a specific noun." },
    { feedback: "Communicating the result of the main verb describes a result clause. Circumstantial participles describe circumstances more broadly." },
    { feedback: "Describing the subject's internal experience is an interpretive category, not the grammatical definition of a circumstantial participle." }
  ],
  kc_va_20_2: [
    { feedback: "Temporal is one possible relationship, but circumstantial participles can communicate many others — causal, concessive, conditional, means, or manner." },
    { correct: true, feedback: "Correct! Circumstantial participles can communicate temporal (when/while), causal (because), concessive (although), conditional (if), means, or manner relationships. Context — and sometimes the tense of the participle — guides interpretation." },
    { feedback: "Causal is one possible relationship, but many others are also possible for circumstantial participles." },
    { feedback: "Conditional is one possible relationship, but circumstantial participles can communicate many other relationships as well." }
  ],
  kc_va_21_1: [
    { feedback: "A genitive absolute is not simply any two genitive nouns — it requires a participle and its subject in the genitive, grammatically independent from the main clause." },
    { correct: true, feedback: "Correct! A genitive absolute is a participial clause where the participle and its subject are both in the genitive case and are grammatically independent from the rest of the sentence." },
    { feedback: "A participle modifying a genitive noun within the main clause is an attributive or circumstantial participle, not a genitive absolute. The independence is key." },
    { feedback: "That describes a possessive genitive, not a genitive absolute." }
  ],
  kc_va_21_2: [
    { feedback: "The construction communicates temporal, causal, or concessive circumstances — not abstract truth." },
    { correct: true, feedback: "Exactly! 'Absolute' means the participial clause is grammatically independent — it stands on its own, not connected to the main clause grammar." },
    { feedback: "The construction does not always appear at the end of a sentence. Its grammatical independence, not position, makes it 'absolute.'" },
    { feedback: "The construction does not require four-way agreement. The participle and subject agree with each other in case (genitive) and number." }
  ],
  kc_va_22_1: [
    { feedback: "Subject and predicate describe a basic clause structure. Conditional statements have specific names for their parts: protasis and apodosis." },
    { correct: true, feedback: "Correct! The protasis (the 'if' clause) states the condition; the apodosis (the 'then' clause) states the conclusion or result. Every conditional has both." },
    { feedback: "Participle and main verb describe a participial construction, not a conditional. Conditionals have protasis and apodosis." },
    { feedback: "Genitive and nominative are case designations. Conditional parts are called protasis and apodosis." }
  ],
  kc_va_22_2: [
    { feedback: "ἐάν + subjunctive is the third class conditional. The first class uses εἰ + indicative." },
    { feedback: "εἰ + secondary indicative is the second class conditional (contrary-to-fact). The first class uses εἰ + indicative in the present or primary tenses." },
    { correct: true, feedback: "Correct! The first class condition uses εἰ + indicative in the protasis, presenting the condition as assumed for the sake of argument — not necessarily declaring it true." },
    { feedback: "ἵνα + subjunctive is a purpose clause construction, not a conditional statement formula." }
  ],
  kc_va_23_1: [
    { feedback: "Three is too few. Greek has six principal parts covering the full range of tense and voice systems." },
    { feedback: "Four is too few. Greek has six principal parts: present active, future active, aorist active, perfect active, perfect middle/passive, and aorist passive." },
    { correct: true, feedback: "Correct! Greek verbs have six principal parts, each representing a different base form used for different tense and voice systems. Knowing them unlocks most inflected forms." },
    { feedback: "Eight is too many. The standard count is six principal parts for Greek verbs." }
  ],
  kc_va_23_2: [
    { feedback: "Memorizing every form would be practically impossible. Principal parts provide base forms from which forms can be derived." },
    { correct: true, feedback: "Correct! Knowing the six base forms (principal parts) allows students to derive most inflected forms of a verb, dramatically reducing what must be memorized while expanding recognition." },
    { feedback: "Translation is a result of recognition, not the direct purpose of principal parts. They help students identify forms first." },
    { feedback: "Principal parts are verb base forms, not sentence patterns. They unlock verb form recognition across tenses and voices." }
  ],
  kc_va_24_1: [
    { correct: true, feedback: "Correct! Full parsing identifies all five: tense, voice, mood, person, and number. Each element contributes to the complete grammatical meaning of the verb." },
    { feedback: "Tense alone is insufficient. Voice, mood, person, and number are equally necessary for a complete parse." },
    { feedback: "Three elements is only partial. Person and number are still needed to complete the identification." },
    { feedback: "Standard Greek verb parsing is five elements: tense, voice, mood, person, number. Six would add something extra." }
  ],
  kc_va_24_2: [
    { feedback: "Parsing is the starting point, not the final step. Good reading moves from parsing to syntax to context." },
    { correct: true, feedback: "Correct! Parsing identifies the grammatical form; then students must ask what that form communicates in this particular context, sentence structure, and larger discourse. Parsing opens the door — it does not close the analysis." },
    { feedback: "Some forms are genuinely ambiguous — parsing does not eliminate ambiguity, it identifies possibilities. Context resolves them." },
    { feedback: "Parsing provides the grammatical foundation. It is not irrelevant — but it must be interpreted in light of context." }
  ],
  kc_va_25_1: [
    { feedback: "Communicating meaning clearly in the receptor language describes dynamic equivalence, not literal translation." },
    { correct: true, feedback: "Correct! A literal (formal equivalence) translation follows Greek grammatical structure as closely as possible, prioritizing structural accuracy over natural English flow." },
    { feedback: "Interpreting and commenting describes a paraphrase or interpretive translation. Literal translation represents, not interprets." },
    { feedback: "Selecting key words describes condensing or summarizing. Literal translation represents all the Greek words." }
  ],
  kc_va_25_2: [
    { feedback: "That describes literal translation only. Different approaches each have genuine value depending on the reader's purpose." },
    { correct: true, feedback: "Correct! Each translation philosophy has its strengths. No single approach is universally best — the right translation depends on what the reader needs for their purpose." },
    { feedback: "Smooth/dynamic translations are not careless. They make deliberate choices to communicate clearly to a different audience. The tradeoffs are different, not lesser." },
    { feedback: "All three approaches can be done responsibly. The question is which best serves the reader's specific purpose." }
  ],
  kc_va_26_1: [
    { feedback: "Ignoring verb tense entirely is also a problem, but over-reading tense is the most common pitfall students are warned about." },
    { correct: true, feedback: "Correct! Over-reading tense is one of the most common exegetical errors — claiming that a present tense proves 'continuous habitual action' or that an aorist proves 'once-for-all' imposes more than the grammar actually carries." },
    { feedback: "Using grammar to support theology is appropriate when done carefully. The pitfall is forcing grammar to bear more than it can." },
    { feedback: "Citing scholars is generally good practice. The pitfall is over-reading grammatical forms, not scholarly citation." }
  ],
  kc_va_26_2: [
    { feedback: "Claiming every grammatical form carries major theological weight is itself a form of the pitfall to avoid." },
    { correct: true, feedback: "Exactly! Forcing theology into grammar — making a grammatical form carry a theological conclusion it cannot support — is a common and serious pitfall. Grammar provides data; theology is built carefully from converging evidence." },
    { feedback: "Grammatical forms communicate real things. The pitfall is claiming they communicate more than they do." },
    { feedback: "Context does not eliminate grammar. The pitfall is using grammar to claim too much — not ignoring it." }
  ],
  kc_va_27_1: [
    { feedback: "Memorizing words is vocabulary work. Extended reading builds the skill of following connected discourse naturally." },
    { correct: true, feedback: "Correct! Extended reading builds the skill of following Greek narrative flow — tracking subjects, identifying verbs, noticing aspect shifts, and following discourse structure. These require practice with longer texts." },
    { feedback: "Speed is not the primary goal. Natural confidence in following connected discourse is the goal." },
    { feedback: "Translation is a byproduct of reading skill. The deeper goal is to follow Greek text naturally — not just decode word by word." }
  ],
  kc_va_27_2: [
    { feedback: "Analyzing every grammatical feature in detail would slow reading to a halt. Extended reading trains fluid following of discourse." },
    { correct: true, feedback: "Correct! When following extended text, students should focus on tracking main verbs and subjects. Notice tense shifts and discourse markers. Not every form needs immediate detailed analysis." },
    { feedback: "Looking up every word constantly interrupts reading flow. Context often provides enough information to continue." },
    { feedback: "Reading only for vocabulary misses the goal — which is to follow connected Greek argument and narrative, not just identify individual words." }
  ],
  kc_va_28_1: [
    { feedback: "Memorizing summaries is review, not integration. Integration means applying knowledge in live reading contexts." },
    { correct: true, feedback: "Correct! Integration means bringing tense, voice, mood, syntax, and nuance together into coherent reading — not just identifying grammatical labels. The goal is to see how all elements work together in communication." },
    { feedback: "Completing quizzes demonstrates individual points but not necessarily integrated reading ability." },
    { feedback: "Focusing only on vocabulary would leave the grammatical and syntactical frameworks behind. Integration brings all elements together." }
  ],
  kc_va_28_2: [
    { feedback: "Vocabulary and grammar are important foundations, but integration requires applying multiple skills together in live reading contexts." },
    { correct: true, feedback: "Exactly! Final integration means bringing together everything learned — tense, voice, mood, aspect, syntax, participles, infinitives, conditionals — and applying them in reading real NT texts holistically." },
    { feedback: "Passing quizzes demonstrates knowledge of isolated points. Integration is about applying all skills together in connected reading." },
    { feedback: "Learning more vocabulary is valuable, but integration means applying what you know more deeply — not just adding more items." }
  ],
  kc_va_29_1: [
    { feedback: "Personal endings communicate person and number, not the tense system." },
    { correct: true, feedback: "Exactly! The -ο- in λύομεν is the connecting vowel that smooths the junction between stem and ending." },
    { feedback: "The tense formative is a separate element inserted between stem and connecting vowel to mark the tense system." },
    { feedback: "In λύομεν, the -μεν is the personal ending." }
  ],
  kc_va_29_2: [
    { feedback: "The ending communicates person and number — not the core lexical meaning." },
    { feedback: "The connecting vowel is structural glue; it carries no lexical meaning." },
    { correct: true, feedback: "Correct! The stem carries the core lexical meaning. λυ- means 'loose/release'; γραφ- means 'write'." },
    { feedback: "The augment marks past time; it does not carry the verb's core lexical meaning." }
  ],
  kc_va_29_3: [
    { feedback: "The action comes from the stem, not the ending." },
    { correct: true, feedback: "Correct! The personal ending communicates both person (1st/2nd/3rd) and number (singular/plural) — and thereby embeds the subject within the verb." },
    { feedback: "Time is communicated by the augment and tense formative, not the personal ending alone." },
    { feedback: "Voice is carried by the ending system as a whole, but the primary role of the personal ending is person and number." }
  ],
  kc_va_29_4: [
    { feedback: "The augment appears at the front of past-indicative forms, not at the end." },
    { feedback: "The stem is the core carrier of meaning, positioned before the tense formative and ending." },
    { feedback: "The tense formative comes after the stem and before the connecting vowel and ending." },
    { correct: true, feedback: "Correct! In the morphological template, the personal ending always comes last — it closes the verb form and identifies person and number." }
  ],
  kc_va_30_1: [
    { feedback: "Mute-consonant stems undergo different changes. Contract verbs are specifically vowel-final stems." },
    { correct: true, feedback: "Exactly! The stem-final vowel (ε, α, or ο) meets the connecting vowel and contracts into a single merged vowel or diphthong." },
    { feedback: "Contract verbs use the same personal endings as regular verbs." },
    { feedback: "Contraction follows systematic rules: ε + ο → ου; ε + ε → ει, etc." }
  ],
  kc_va_30_2: [
    { feedback: "The velar is not dropped — it merges with σ to produce ξ." },
    { correct: true, feedback: "Correct! Velar consonants (κ, γ, χ) combine with σ to produce ξ (xi). For example, ἄγω → ἄξω in the future." },
    { feedback: "Adding σ to a velar produces a change — the velar + σ merge into ξ." },
    { feedback: "These patterns are systematic and predictable." }
  ],
  kc_va_30_3: [
    { correct: true, feedback: "Correct! When ε meets ε in contraction, the result is the diphthong ει. This is part of the systematic ε-contract pattern." },
    { feedback: "ε + ε does not become η. The η result comes from temporal augment on ε-initial stems." },
    { feedback: "ε + ε does not become αι. Check the ε-contract table: ε + ε → ει." },
    { feedback: "ε + ε does not disappear — both vowels participate in the contraction to produce ει." }
  ],
  kc_va_30_4: [
    { feedback: "φιλέω is an ε-contract verb. ἀγαπάω ends in -άω, making it the alpha-contract." },
    { feedback: "ο-contract verbs end in -όω (e.g., πληρόω). ἀγαπάω ends in -άω." },
    { correct: true, feedback: "Correct! ἀγαπάω ends in α, making it a classic alpha-contract verb. Its stem final α interacts with connecting vowels and endings to produce contracted forms." },
    { feedback: "ἀγαπάω is not a liquid verb (liquid stems end in λ, μ, ν, ρ). It is an alpha-contract." }
  ],
  kc_va_31_1: [
    { feedback: "Future active uses -σ- as its tense formative, not -θη-." },
    { feedback: "The perfect active uses -κ-. -θη- marks the aorist passive." },
    { correct: true, feedback: "Correct! The -θη- marker is the characteristic tense formative of the aorist passive system." },
    { feedback: "The imperfect uses no tense formative. -θη- specifically marks the aorist passive." }
  ],
  kc_va_31_2: [
    { feedback: "The reduplication prefix (λε-) signals the perfect system, but the tense formative itself is -κ-." },
    { correct: true, feedback: "Exactly! The -κ- in λέλυκα is the perfect active tense formative, positioned between the stem (λυ-) and the ending." },
    { feedback: "The -α- is part of the perfect active ending pattern, not the tense formative." },
    { feedback: "λυ- is the lexical stem, not a tense marker." }
  ],
  kc_va_31_3: [
    { feedback: "Liquid verbs do form futures — they just do so without the standard -σ- tense formative." },
    { correct: true, feedback: "Correct! When a stem ends in a liquid (λ, μ, ν, ρ), adding σ is phonologically difficult. The σ drops, and the stem vowel lengthens to compensate — producing forms like κρινῶ from κρίνω." },
    { feedback: "Liquid verbs do not default to aorist forms. They form distinct futures through compensatory lengthening." },
    { feedback: "Liquid verbs are active verbs. Their unusual futures are a phonological adaptation, not a voice shift." }
  ],
  kc_va_31_4: [
    { feedback: "Tense formatives appear between stem and ending — they are not the same as the augment." },
    { feedback: "Tense formatives do not replace the stem — they augment it with a tense signal." },
    { correct: true, feedback: "Correct! Tense formatives are morphological signals inserted between the stem and the personal ending to identify which tense-voice system the form belongs to." },
    { feedback: "Tense formatives are present in the indicative and some other forms, but they are not limited to irregular verbs." }
  ],
  kc_va_32_1: [
    { feedback: "The augment appears only in the indicative mood. Aorist subjunctive/infinitive/participle forms lack it." },
    { correct: true, feedback: "Correct! The augment appears only in the indicative mood — it is a signal of past indicative time, not simply past aspect." },
    { feedback: "Imperatives do not carry the augment." },
    { feedback: "Infinitives do not carry the augment." }
  ],
  kc_va_32_2: [
    { feedback: "Future forms use the -σ- tense formative, not reduplication." },
    { feedback: "Aorist forms use augment and -σα- tense formative. Reduplication belongs to the perfect system." },
    { feedback: "Imperfect forms use augment + present stem + secondary endings." },
    { correct: true, feedback: "Correct! Reduplication — duplicating the initial consonant + ε — is the characteristic morphological signal of the perfect tense system." }
  ],
  kc_va_32_3: [
    { feedback: "A temporal augment changes the vowel quality — it does not add a separate prefix syllable." },
    { correct: true, feedback: "Correct! A temporal augment lengthens the initial vowel. ε lengthens to η. So ἐλπίζω (ε-initial) → ἤλπιζον in the imperfect." },
    { feedback: "The initial vowel is lengthened, not removed. ε → η; ο → ω; α → η." },
    { feedback: "Temporal augments apply to vowel-initial stems and lengthen the vowel — not drop it." }
  ],
  kc_va_32_4: [
    { feedback: "Reduplication signals completed action with ongoing result — it is the marker of the perfect, not ongoing present action." },
    { feedback: "Reduplication is not merely decorative or emphatic — it carries grammatical meaning as the perfect's signature marker." },
    { feedback: "Reduplication belongs to the perfect system, not the imperfect or pluperfect exclusively." },
    { correct: true, feedback: "Correct! Reduplication in the perfect tense communicates that the action is completed and its result continues. It encodes the perfect's stative aspect." }
  ]
};

// ── Quiz Data ──────────────────────────────────────────────────────────────────
const VERB_ADV_QUIZ_DATA = {
  va_01: { title:"Verbs and Communication", passMark:4, questions:[
    { text:"Greek verbs communicate which of the following?", options:["Only action and time","Action, perspective, progression, emphasis, condition, and expectation","Only tense and person","Only the subject and object of a sentence"], correct:1 },
    { text:"What is the primary purpose of parsing a Greek verb?", options:["To help with speed-reading","To explain how the verb communicates its meaning","To memorize vocabulary","To translate without context"], correct:1 },
    { text:"Which of the following is NOT communicated by a Greek verb form?", options:["Person","Number","The noun's gender","Tense"], correct:2 },
    { text:"What elements does a standard Greek verb parse include?", options:["Tense, voice, mood, person, number","Tense, gender, case, number","Person, number, gender, article","Stem, ending, accent, breathing"], correct:0 },
    { text:"Why does parsing 'exist to explain communication'?", options:["Parsing replaces translation","Parsing is a tool for understanding a verb's function, not an end in itself","Parsing proves theological claims","Parsing is only for advanced students"], correct:1 }
  ]},
  va_02: { title:"Embedded Subjects", passMark:4, questions:[
    { text:"What does the verb ending γράφ-ω communicate on its own?", options:["Third person plural","First person singular","Second person singular","Third person singular"], correct:1 },
    { text:"When a Greek writer adds an explicit pronoun alongside a verb, this typically indicates:", options:["The verb is future tense","Emphasis, contrast, or clarification","The verb is passive voice","The sentence is a question"], correct:1 },
    { text:"Why does Greek not always require explicit subject pronouns?", options:["Greek subjects are always implied by context","Greek verb endings communicate person and number within the verb","Greek relies on word order for subject identification","Greek nouns carry subject information"], correct:1 },
    { text:"If a writer says ἐγὼ γράφω ('I—I myself—write'), what does ἐγώ add?", options:["It changes the verb to present tense","It adds emphasis to the subject","It makes the verb passive","It changes the sentence to a question"], correct:1 },
    { text:"The embedded subject in Greek verbs is best understood as:", options:["Always explicit and never implied","Communicated by the article before the verb","Person and number within the verb ending communicating the subject","Shown by the word following the verb"], correct:2 }
  ]},
  va_03: { title:"Present Tense and Imperfective Aspect", passMark:4, questions:[
    { text:"What aspect does the Greek present tense typically communicate?", options:["Completed action with ongoing result","Ongoing, unfolding, or in-progress action","Future expectation","A complete whole event"], correct:1 },
    { text:"What primary mistake should be avoided with the Greek present tense?", options:["Using it too broadly","Reducing it to only present time","Confusing it with the imperfect","Treating it as identical to English present tense"], correct:1 },
    { text:"What is 'imperfective aspect'?", options:["A verb describing an incomplete thought","Viewing action as ongoing or in progress, without focus on beginning or end","A tense that communicates the future","A past tense with ongoing result"], correct:1 },
    { text:"Greek tense communicates which two things together?", options:["Voice and mood","Time and aspect","Person and number","Gender and case"], correct:1 },
    { text:"Which tense typically presents action as a complete or undefined whole?", options:["Imperfect","Future","Aorist","Perfect"], correct:2 }
  ]},
  va_04: { title:"Imperfect in Narrative", passMark:4, questions:[
    { text:"Where does the imperfect tense most commonly appear in NT Greek?", options:["In purpose clauses","In narrative sections where scenes unfold","In abstract theological discussions","In OT quotations"], correct:1 },
    { text:"What aspect does the imperfect tense typically communicate?", options:["Future expectation","Past completed action","Past ongoing or unfolding action","Completed action with present result"], correct:2 },
    { text:"How does the imperfect differ from the aorist in narrative use?", options:["Imperfect is future; aorist is past","Imperfect portrays ongoing/unfolding action; aorist presents action as a complete whole","Imperfect is active; aorist is passive","Imperfect is emphatic; aorist is de-emphasized"], correct:1 },
    { text:"What effect can imperfect tense verbs create in narrative?", options:["They speed up the story by removing detail","They allow readers to visualize a scene as it unfolds","They signal the narrative is fictional","They indicate only one participant"], correct:1 },
    { text:"Which description does NOT belong to the imperfect tense?", options:["Ongoing past action","Continuous background action in narrative","Once-for-all completed event","Action in progress in the past"], correct:2 }
  ]},
  va_05: { title:"Future Tense Nuance", passMark:4, questions:[
    { text:"Greek future tense verbs can communicate which range of ideas?", options:["Only factual future events","Expectation, prediction, promise, or warning","Only divine pronouncements","Only questions about the future"], correct:1 },
    { text:"What determines the specific communicative force of a future verb?", options:["The person and number","Context — who is speaking, to whom, and in what situation","Whether the verb has a smooth or rough breathing","Whether the verb appears before or after its subject"], correct:1 },
    { text:"A future verb in divine speech might communicate what?", options:["A simple factual prediction with no special force","A promise, warning, or certain expectation","A past event recalled as future from an earlier point","A question about what will happen"], correct:1 },
    { text:"Greek future tense is primarily about:", options:["Aspect only","Time reference primarily, with aspect secondary in the future system","Neither time nor aspect","Pure time only, like English"], correct:1 },
    { text:"Why should students avoid reading future verbs mechanically?", options:["Future verbs are always mistranslated","Context shapes the force — promise, warning, prediction — which grammar alone cannot specify","Future verbs never communicate simple future events","The future tense was rarely used by NT authors"], correct:1 }
  ]},
  va_06: { title:"Aorist Overview", passMark:4, questions:[
    { text:"What does the aorist tense typically communicate?", options:["Past ongoing action","Action as a complete or undefined whole","Completed action with ongoing result","Future expectation"], correct:1 },
    { text:"Why is calling the aorist 'once-for-all action' an oversimplification?", options:["The aorist is only used in narrative","The aorist does not communicate that an action cannot be repeated","The aorist is only passive","The aorist is identical to the imperfect"], correct:1 },
    { text:"Which tense is often contrasted with the aorist in narrative passages?", options:["Future","Perfect","Imperfect","Present"], correct:2 },
    { text:"What does over-reading the aorist often lead to?", options:["Confusing active and passive voice","Claiming more than the grammar actually communicates","Ignoring the broader context","Translating Greek into Latin"], correct:1 },
    { text:"Which description BEST fits the aorist's perspective?", options:["Ongoing and unfolding action","Action as a complete or undefined whole event","Action with a focus on the current result","Action expected in the future"], correct:1 }
  ]},
  va_07: { title:"Constative and Ingressive Ideas", passMark:4, questions:[
    { text:"What does a constative use of the aorist communicate?", options:["The beginning of an action","The entire event viewed as a whole","The end result of an action","An ongoing background action"], correct:1 },
    { text:"What does an ingressive use of the aorist focus on?", options:["The middle of an action","The beginning or entry into an action","The final result","The whole event without focus"], correct:1 },
    { text:"These aorist categories are best understood as:", options:["Rigid grammatical rules","Analytical frameworks describing patterns, not absolute rules","Only applicable in John's Gospel","Obsolete and rejected categories"], correct:1 },
    { text:"An ingressive aorist of βασιλεύω (to reign) would be best translated as:", options:["He was reigning","He reigned (throughout)","He began to reign","He had reigned"], correct:2 },
    { text:"Which statement about interpreting aorist categories is most accurate?", options:["The form alone determines the category","Context is essential for determining which category, if any, best fits","Ingressive aorists are always marked by a prefix","All aorists in the Gospels are constative"], correct:1 }
  ]},
  va_08: { title:"Culminative Ideas", passMark:4, questions:[
    { text:"What does a culminative use of the aorist emphasize?", options:["The start of an action","The entire event without focus","The completion or end result","Repeated action"], correct:2 },
    { text:"What determines whether a culminative interpretation is appropriate?", options:["The verb's person and number","Context — the surrounding discourse and what makes sense","Whether the verb is active or passive","Whether the verb is regular or deponent"], correct:1 },
    { text:"A culminative aorist of τελέω (to complete) might be translated as:", options:["He was completing","He completed (reaching the result)","He will complete","He began to complete"], correct:1 },
    { text:"Which statement BEST reflects the aorist categories and exegesis?", options:["The categories prove specific theological claims","The categories are tools that articulate what context already shows","The categories replace contextual analysis","Only culminative matters exegetically"], correct:1 },
    { text:"A culminative aorist is most similar to which English construction?", options:["'Was going'","'Will have completed'","'Has completed' / 'brought to completion'","'Was beginning to complete'"], correct:2 }
  ]},
  va_09: { title:"Second Aorists", passMark:4, questions:[
    { text:"How do second aorists differ from first aorists functionally?", options:["They communicate a different kind of action","They look different but function the same","They are restricted to passive voice","They only appear in the subjunctive"], correct:1 },
    { text:"What makes second aorists challenging to recognize?", options:["They use special accent marks","They use a different stem than the lexical form","They are found only in unusual NT books","They require three separate paradigm sets"], correct:1 },
    { text:"Which is a common second aorist form in NT Greek?", options:["ἔγραψα (I wrote — from γράφω)","εἶπον (I said — from λέγω)","ἔλυσα (I loosed — from λύω)","ἤκουσα (I heard — from ἀκούω)"], correct:1 },
    { text:"What is the key practical skill for handling second aorists?", options:["Memorizing every form individually","Recognizing stem changes for common verbs","Avoiding them in translation","Using only lexicons to translate them"], correct:1 },
    { text:"Second aorists use which set of endings?", options:["Same as present active","Same as imperfect active","Second aorist active endings (similar to imperfect pattern)","Completely unique endings found nowhere else"], correct:2 }
  ]},
  va_10: { title:"Aspect and Time", passMark:4, questions:[
    { text:"Greek tense systems involve:", options:["Only time reference, like English","Both aspect and temporal reference","Only aspect with no time reference","Neither aspect nor time"], correct:1 },
    { text:"What is 'verbal aspect' in Greek?", options:["When an action occurs","How the speaker portrays or views the action (ongoing, whole, completed)","The number of participants","Whether a verb is transitive or intransitive"], correct:1 },
    { text:"Which approach to Greek tense is most accurate?", options:["Greek tense is only about time","Greek tense is only about aspect","Greek tense involves both aspect and time, and students should avoid dogmatism","Greek tense is identical to Hebrew tense"], correct:2 },
    { text:"In the indicative mood, which aspect does the present tense communicate?", options:["Perfective (complete, whole)","Imperfective (ongoing, unfolding)","Stative (completed with ongoing result)","Futuristic (expecting a future event)"], correct:1 },
    { text:"Why does overdogmatism about aspect cause problems?", options:["Because aspect is not a real category","Because it leads to reading more meaning into a tense than it actually carries","Because Greek verbs have no aspect","Because scholarly disagreement proves aspect is irrelevant"], correct:1 }
  ]},
  va_11: { title:"Active Voice in Depth", passMark:4, questions:[
    { text:"In active voice, the subject is:", options:["Receiving the action","Performing or initiating the action","Indirectly affected","Both performing and receiving"], correct:1 },
    { text:"What does active voice communicate about the subject?", options:["That the subject is always a person","That the subject is the grammatical agent","That the action is completed","That the verb is indicative mood"], correct:1 },
    { text:"How does active voice relate to verbal aspect?", options:["Active voice changes the aspect","Active voice is independent from aspect — both communicate simultaneously","Active voice is restricted to present and future","Active voice overrides aspect"], correct:1 },
    { text:"Which BEST illustrates active voice?", options:["The letter was written by the apostle","The apostle writes the letter","Writing is the apostle's action","The letter will be written"], correct:1 },
    { text:"Active voice is best described as the voice where:", options:["The subject acts without self-interest","Subject agency is communicated — the subject acts","The action is communicated but the agent is unknown","The action is both initiated and received by the subject"], correct:1 }
  ]},
  va_12: { title:"Middle Voice Nuance", passMark:4, questions:[
    { text:"What is the most common oversimplification about the middle voice?", options:["That it is always passive","That 'the subject acts on itself' (reflexive oversimplification)","That it is only used in the aorist","That it communicates future action"], correct:1 },
    { text:"What does the middle voice more accurately communicate?", options:["That the subject is purely passive","Subject involvement, interest, or participation in the action","That the action is conditional","That the subject is plural"], correct:1 },
    { text:"A deponent verb appears in middle/passive forms but is translated:", options:["As passive","As active","As future","As conditional"], correct:1 },
    { text:"Which approach to middle voice is most responsible?", options:["Always translate as reflexive","Ignore middle voice forms","Recognize subject involvement, resisting oversimplification","Treat middle and passive as identical"], correct:2 },
    { text:"Why is middle voice described as nuanced?", options:["It uses irregular endings that don't follow patterns","Its semantic contribution varies significantly across verbs and contexts","It is only found in Classical, not Koine, Greek","Scholars have not yet studied it sufficiently"], correct:1 }
  ]},
  va_13: { title:"Passive Voice Nuance", passMark:4, questions:[
    { text:"In passive voice, the grammatical subject:", options:["Performs the action","Receives the action","Is indeterminate","Performs and receives simultaneously"], correct:1 },
    { text:"What is the 'divine passive'?", options:["A passive where God is explicitly named as subject","A passive construction where God is implied as agent without being named","A passive verb used only in divine commands","A form only found in the Psalms"], correct:1 },
    { text:"How does passive voice shift focus compared to active?", options:["Focus shifts from verb to object","Focus shifts from agent to recipient of the action","Focus shifts from subject to predicate","Focus shifts from sentence to discourse context"], correct:1 },
    { text:"Which is a likely divine passive in the NT?", options:["Paul wrote to the church","The church was established","You will be forgiven (implying God forgives)","The disciples followed Jesus"], correct:2 },
    { text:"In what NT context does the divine passive appear most prominently?", options:["Only in Revelation","Only in the Pastoral Epistles","In teachings of Jesus throughout the Gospels","Only in Psalms quoted in the NT"], correct:2 }
  ]},
  va_14: { title:"Deponent Discussion", passMark:4, questions:[
    { text:"A deponent verb is best described as:", options:["A verb with no active forms, translated actively","A verb that can only be used passively","A verb communicating both active and passive simultaneously","A verb with irregular accent patterns"], correct:0 },
    { text:"Which is a well-known NT deponent verb?", options:["γράφω (I write)","ἔρχομαι (I come/go)","λύω (I loose)","πιστεύω (I believe)"], correct:1 },
    { text:"The scholarly debate around deponents centers on:", options:["Whether to memorize them differently","Whether middle/passive forms are semantically empty or communicate something real","Whether they appear only in certain books","Whether the term 'deponent' is too positive in meaning"], correct:1 },
    { text:"Students should avoid which approach to deponent verbs?", options:["Learning which verbs are traditionally deponent","Noting they appear in middle or passive forms","Claiming the middle/passive form means absolutely nothing","Using a lexicon to check if a verb is deponent"], correct:2 },
    { text:"How should students translate a deponent like ἔρχομαι?", options:["As passive: 'was come'","As future: 'will come'","As active: 'I come' or 'I go'","As reflexive: 'I come to myself'"], correct:2 }
  ]},
  va_15: { title:"Imperatives and Force", passMark:4, questions:[
    { text:"What determines the urgency and tone of a Greek imperative?", options:["Only person and number","The grammatical form alone","Context — relationship between speakers, the discourse, cultural factors","Whether it is present or aorist only"], correct:2 },
    { text:"The present imperative tends to communicate:", options:["A single immediate command","Ongoing or habitual action ('keep doing')","A future expected action","A completed action to be sustained"], correct:1 },
    { text:"The aorist imperative tends to communicate:", options:["A general principle to keep repeating","An ongoing state","A single, specific action to be taken","A past action that should have been done"], correct:2 },
    { text:"Present vs. aorist imperatives are BEST described as:", options:["Absolute rules without exceptions","Tendencies describing general patterns, shaped by context","The aorist is always more urgent","The present is always gentler"], correct:1 },
    { text:"Which factors shape the urgency of NT commands?", options:["The verb form alone","The verb form, speaker's authority, audience's situation, and broader discourse context","Only whether rough or smooth breathing is used","Only vocabulary choice"], correct:1 }
  ]},
  va_16: { title:"Subjunctive Introduction", passMark:4, questions:[
    { text:"The subjunctive mood typically communicates:", options:["Direct assertion of fact","Possibility, contingency, or expectation","Past completed action","An immediate command"], correct:1 },
    { text:"What is the most common conjunction used with the subjunctive in NT Greek?", options:["καί (and)","ἀλλά (but)","ἵνα (in order that)","γάρ (for/because)"], correct:2 },
    { text:"ἵνα + subjunctive typically communicates:", options:["A temporal relationship (when/while)","A causal relationship (because)","A purpose or result relationship (in order that / so that)","A conditional relationship (if)"], correct:2 },
    { text:"How does the subjunctive differ from the indicative?", options:["Different vocabulary from the indicative","Indicative asserts reality; subjunctive communicates possibility, contingency, or expectation","Subjunctive only in questions; indicative in statements","Subjunctive always communicates past; indicative communicates present"], correct:1 },
    { text:"Which is a subjunctive construction in NT Greek?", options:["Δικαιωθέντες ἐκ πίστεως (having been justified by faith)","ἵνα σωθῶσιν (in order that they might be saved)","ἐν ἀρχῇ ἦν ὁ λόγος (in the beginning was the Word)","ὁ θεὸς ἀγάπη ἐστίν (God is love)"], correct:1 }
  ]},
  va_17: { title:"Infinitives in Syntax", passMark:4, questions:[
    { text:"The Greek infinitive is best described as:", options:["A verbal adjective","A verbal noun","A verbal conjunction","A verbal article"], correct:1 },
    { text:"How can infinitives function in a Greek sentence?", options:["Only as objects of transitive verbs","Only as purpose clauses","As subjects, objects, or complements in various roles","Only in indirect speech"], correct:2 },
    { text:"What is the articular infinitive?", options:["An infinitive without a subject","An infinitive preceded by an article, allowing different case roles","An infinitive used only in questions","An infinitive preceded by ἵνα"], correct:1 },
    { text:"Which construction communicates purpose with the articular infinitive?", options:["εἰς + articular infinitive (accusative)","Both εἰς and πρός constructions can communicate purpose","ἐν + articular infinitive (dative)","Only ἵνα + subjunctive communicates purpose"], correct:1 },
    { text:"The infinitive can take which verbal characteristics?", options:["A direct object and adverbs, like a verb","Gender, case, and number agreement, like an adjective","Personal endings for person and number","Augment forms for past tense"], correct:0 }
  ]},
  va_18: { title:"Participles as Verbal Adjectives", passMark:4, questions:[
    { text:"Greek participles blend:", options:["Verbal force and adjectival function","Verbal force and nominal function","Adjectival and conjunctive function","Nominal and prepositional functions"], correct:0 },
    { text:"In what ways do participles behave like verbs?", options:["They communicate tense, voice, and can take direct objects","They agree with nouns in gender, case, and number","They function as sentence connectors","They communicate person and number like finite verbs"], correct:0 },
    { text:"In what ways do participles behave like adjectives?", options:["They can take direct objects","They communicate tense and voice","They agree with nouns in gender, case, and number","They serve as the main verb"], correct:2 },
    { text:"How common are participles in NT Greek?", options:["Rare — only a few hundred total","Uncommon — found mainly in John","Extremely common — found throughout nearly every passage","Found only in Pauline epistles"], correct:2 },
    { text:"What makes participles essential for advanced NT reading?", options:["They replace main verbs in complex sentences","Their blended verbal-adjectival function creates rich layers of meaning central to Greek discourse","They are the only forms that change with voice","They are simpler to translate than indicative verbs"], correct:1 }
  ]},
  va_19: { title:"Attributive Participles", passMark:4, questions:[
    { text:"An attributive participle functions like:", options:["A main verb","An adverb","An adjective modifying a noun","A conjunction connecting clauses"], correct:2 },
    { text:"Which is the classic attributive position for a participle?", options:["Participle placed at sentence end","Article — Participle — Noun or Article — Noun — Article — Participle","Participle following a conjunction","Participle preceded by ἵνα"], correct:1 },
    { text:"An attributive participle agrees with the noun it modifies in:", options:["Tense, voice, and mood","Gender, case, and number","Person, number, and voice","Accent, breathing, and ending"], correct:1 },
    { text:"Which is an attributive participle construction?", options:["ὁ γράφων ἄνθρωπος (the writing man / the man who writes)","γράφων εἶπεν (writing, he said)","ἐγὼ γράφω ἐπιστολήν (I write a letter)","ἵνα γράφωσιν (in order that they might write)"], correct:0 },
    { text:"Attributive participles can be translated in English as:", options:["Only gerunds (-ing forms used as nouns)","Relative clauses ('who/which + verb') or adjective phrases","Purpose clauses ('in order to')","Conditional clauses ('if')"], correct:1 }
  ]},
  va_20: { title:"Circumstantial Participles", passMark:4, questions:[
    { text:"A circumstantial participle describes:", options:["A specific noun within a phrase","The circumstances surrounding the main clause action","The result of the main verb","The subject's internal experience"], correct:1 },
    { text:"Which relationships can a circumstantial participle communicate?", options:["Only temporal (when/while)","Temporal, causal, concessive, conditional, means, or manner","Only causal (because)","Only conditional (if)"], correct:1 },
    { text:"How does a circumstantial differ from an attributive participle?", options:["Circumstantial modifies nouns; attributive modifies clauses","Attributive modifies nouns; circumstantial describes circumstances of the main action","Circumstantial appears only in passive voice","Attributive appears only in accusative case"], correct:1 },
    { text:"A present circumstantial participle often communicates:", options:["Action completed before the main verb","Action simultaneous with or overlapping the main verb","Action occurring after the main verb","Action in a completely separate time frame"], correct:1 },
    { text:"An aorist circumstantial participle often communicates:", options:["Action ongoing at the same time","Action occurring after the main verb","Action completed prior to the main verb","Action repeated throughout the main verb's time"], correct:2 }
  ]},
  va_21: { title:"Genitive Absolute", passMark:4, questions:[
    { text:"What defines a genitive absolute construction?", options:["Any two genitive nouns in a sentence","A participle and its subject both in the genitive, grammatically independent from the main clause","A participle modifying a genitive noun in the main clause","A possessive genitive introducing a new subject"], correct:1 },
    { text:"Why is the construction called 'absolute'?", options:["Because it communicates absolute truth","Because the participial clause is grammatically independent from the rest of the sentence","Because it always appears at sentence end","Because participle and noun agree absolutely in four categories"], correct:1 },
    { text:"Genitive absolute constructions typically communicate:", options:["Temporal, causal, or concessive circumstances of the main clause","Direct object relationships with the main verb","Purpose or result clauses","First-class conditional relationships"], correct:0 },
    { text:"Where are genitive absolutes especially common in the NT?", options:["Only in Pauline Epistles","Throughout narrative, especially in the Gospels and Acts","Only in Revelation","Only in 1 Corinthians"], correct:1 },
    { text:"A genitive absolute can be translated as:", options:["'After/when/while [subject] was [verb-ing]...'","'Because of [noun]...' only","'In order that...'","'If [noun]...' only"], correct:0 }
  ]},
  va_22: { title:"Conditional Statements", passMark:4, questions:[
    { text:"What are the two parts of a conditional statement?", options:["Subject and predicate","Protasis (if-clause) and apodosis (result/then-clause)","Participle and main verb","Genitive and nominative"], correct:1 },
    { text:"A first class conditional uses:", options:["ἐάν + subjunctive","εἰ + secondary indicative","εἰ + indicative","ἵνα + subjunctive"], correct:2 },
    { text:"What does the first class condition communicate?", options:["That the condition is definitely true","That the condition is assumed for the sake of argument","That the condition is certainly false","That the condition might be true in the future"], correct:1 },
    { text:"A second class conditional communicates:", options:["A probable future condition","A simple assumption","A contrary-to-fact condition","A purpose or result"], correct:2 },
    { text:"A third class conditional uses:", options:["εἰ + indicative","εἰ + secondary indicative","ἐάν + subjunctive","ἵνα + aorist indicative"], correct:2 }
  ]},
  va_23: { title:"Principal Parts Strategy", passMark:4, questions:[
    { text:"How many principal parts does a Greek verb typically have?", options:["3","4","6","8"], correct:2 },
    { text:"What is the first principal part of a Greek verb?", options:["The aorist active indicative, 1st person singular","The perfect middle/passive, 1st person singular","The present active indicative, 1st person singular","The future active indicative, 1st person singular"], correct:2 },
    { text:"Why are principal parts strategically important?", options:["They allow deriving most inflected forms from six base forms","They allow translation without understanding grammar","They replace vocabulary memorization","They are required for understanding noun declensions"], correct:0 },
    { text:"Which principal part is the basis for aorist active forms?", options:["First (present active)","Second (future active)","Third (aorist active)","Fourth (perfect active)"], correct:2 },
    { text:"Verbs with the same type of stem often:", options:["Have identical principal parts","Follow predictable patterns in how their principal parts are formed","Are all deponents","Must be memorized individually"], correct:1 }
  ]},
  va_24: { title:"Complex Parsing", passMark:4, questions:[
    { text:"A complete parse of a finite Greek verb includes:", options:["Tense, voice, mood, person, number","Tense, gender, case, person","Voice, mood, declension, number","Tense, aspect, register, number"], correct:0 },
    { text:"A complete parse of a participle compared to a finite verb:", options:["Adds aspect and register","Replaces person with gender and adds case","Removes voice from the parse","Adds infinitive category to the parse"], correct:1 },
    { text:"Parsing a verb is best described as:", options:["The final step in interpretation","The starting point for syntactical and contextual analysis","A replacement for understanding context","Only necessary when theologically significant"], correct:1 },
    { text:"When multiple parses are possible for an ambiguous form, what determines the correct one?", options:["The first scholar to comment on the passage","Context — surrounding syntax and discourse","The chapter and verse number","The length of the Greek word"], correct:1 },
    { text:"Complex parsing integrates:", options:["Tense, voice, mood, syntax, and nuance together","Grammar memorization without context","Word-for-word translation without analysis","Ignoring aspect to focus on person and number"], correct:0 }
  ]},
  va_25: { title:"Translation Philosophy", passMark:4, questions:[
    { text:"Which philosophy stays closest to Greek grammatical structure?", options:["Dynamic equivalence","Literal (formal equivalence)","Paraphrase","Interpretive commentary"], correct:1 },
    { text:"What does dynamic (functional) equivalence prioritize?", options:["Preserving Greek word order in English","Communicating meaning clearly to the receptor language audience","Staying as close to the original words as possible","Using the most scholarly language available"], correct:1 },
    { text:"Which approach is universally best for all readers?", options:["Literal — always most accurate","Dynamic — always most readable","No single approach — depends on purpose","Paraphrase — always clearest"], correct:2 },
    { text:"What risk accompanies interpretive (paraphrase) translation?", options:["It is always too literal","The translator's interpretive choices may become embedded as if original","It is never used in serious study","It is only appropriate for John's Gospel"], correct:1 },
    { text:"For a student learning Greek, which translation is most useful for comparison?", options:["A smooth dynamic translation only","A literal translation that preserves Greek structures","A paraphrase with explanatory notes","Only the original Greek without translation"], correct:1 }
  ]},
  va_26: { title:"Exegetical Pitfalls", passMark:4, questions:[
    { text:"What is the most common tense-related exegetical pitfall?", options:["Ignoring verb tense entirely","Over-reading tense — claiming more than a form actually communicates","Using too many commentaries","Only reading passive voice verbs"], correct:1 },
    { text:"Why is claiming the aorist proves 'once-for-all' a pitfall?", options:["Aorist verbs are too rare to matter","The aorist presents action as a whole — it does not communicate that action cannot recur","The aorist is identical to the imperfect","The aorist is not in theologically significant passages"], correct:1 },
    { text:"Forcing theology into grammar means:", options:["Using grammar carefully to explain theology","Making grammar bear theological weight it cannot carry","Translating theological terms carefully","Using scholarly commentaries for support"], correct:1 },
    { text:"Which is an example of simplistic aspect claims to avoid?", options:["Noting that present tense tends toward ongoing action","Claiming every aorist proves a doctrine of singularity or finality","Observing perfect tense communicates completed action with ongoing result","Noting imperfects appear often in narrative"], correct:1 },
    { text:"Responsible exegesis from grammar requires:", options:["Ignoring grammar for theological tradition","Using grammar as one tool among many, without over-claiming or under-valuing it","Claiming every grammatical observation is theologically definitive","Only using grammar when it supports your interpretation"], correct:1 }
  ]},
  va_27: { title:"Extended NT Reading", passMark:4, questions:[
    { text:"What is the primary goal of extended NT reading practice?", options:["Memorizing every Greek word","Building the skill of following Greek narrative and argument naturally","Translating every sentence word-for-word","Identifying every aorist form in a passage"], correct:1 },
    { text:"When following extended Greek text, what should students focus on first?", options:["Every accusative noun","Tracking main verbs and their subjects to follow who is doing what","Looking up every unknown word immediately","Analyzing every participle in detail first"], correct:1 },
    { text:"How do discourse markers like οὖν, δέ, γάρ help in extended reading?", options:["They indicate the following verb is aorist","They signal logical connections — conclusion, contrast, explanation — helping readers follow the argument","They replace the need to identify verb tense","They only appear in Pauline Epistles"], correct:1 },
    { text:"Which habit HINDERS extended NT reading?", options:["Noticing tense shifts across a narrative passage","Stopping to look up every unfamiliar word and losing sentence flow","Identifying the main clause then parsing surrounding participles","Using paragraph divisions to see discourse structure"], correct:1 },
    { text:"Extended reading differs from sentence-level analysis in that:", options:["Extended reading ignores Greek grammar","Extended reading builds skill at following connected discourse, not just isolated sentences","Sentence-level analysis is always more accurate","Extended reading focuses only on vocabulary"], correct:1 }
  ]},
  va_28: { title:"Final Integration", passMark:4, questions:[
    { text:"Final integration in Greek verb study means:", options:["Memorizing all 28 lesson summaries","Bringing together tense, voice, mood, syntax, and nuance in actual reading contexts","Completing quizzes without review","Focusing only on vocabulary"], correct:1 },
    { text:"What does integrated reading of Greek text require?", options:["Parsing every form before reading the next word","Applying grammatical, syntactical, and contextual awareness together as a whole","Memorizing all principal parts first","Reading only passages without participles"], correct:1 },
    { text:"Which BEST represents the goal of this verb curriculum?", options:["Passing quizzes and completing lessons","Developing the ability to think through Greek meaning naturally, not just identify labels","Memorizing verb paradigms for all six principal parts","Translating every NT verse into English"], correct:1 },
    { text:"At the integration stage, how should students approach new NT passages?", options:["Parse every word before attempting meaning","Bring accumulated grammatical and syntactical knowledge to bear while following the text's flow","Ignore grammar and focus only on English translation","Read only passages covered in this curriculum"], correct:1 },
    { text:"Which statement BEST reflects the purpose of Greek verb study?", options:["Grammar study is the final goal — knowing labels is enough","Grammar study serves reading — the goal is to think through how Greek communicates, not merely name forms","Advanced Greek is only for seminary professors","Greek verbs are too complex for most students"], correct:1 }
  ]},
  va_29: { title:"Morphological Construction", passMark:4, questions:[
    { text:"Which describes the correct morphological template for Greek verb forms?", options:["Ending + Stem + Connecting Vowel","Stem + (Tense Formative) + Connecting Vowel + Personal Ending","Connecting Vowel + Stem + Ending","Personal Ending + Tense Formative + Stem"], correct:1 },
    { text:"In λύσομεν, the -σ- between stem and connecting vowel is:", options:["The personal ending","A second stem","The tense formative marking the future system","The augment prefix"], correct:2 },
    { text:"What makes morphological analysis useful for NT reading?", options:["It allows students to decode unfamiliar forms by recognizing component parts","It replaces the need to understand context","It only works for the most common vocabulary","It is useful only for parsing practice"], correct:0 },
    { text:"In the present active indicative of λύω, which element is absent compared to the future?", options:["The personal ending","The connecting vowel","The tense formative","The lexical stem"], correct:2 },
    { text:"Why does understanding verb morphology complement understanding verb function?", options:["Form and function are identical","Form alone is sufficient for translating Greek","Recognizing form is the entry point for identifying grammatical category; function explains what it communicates","Function should always be learned before form"], correct:2 }
  ]},
  va_30: { title:"Connecting Vowels and Contracts", passMark:4, questions:[
    { text:"Contract verbs are verbs whose stems end in:", options:["A mute consonant","A liquid consonant","A vowel (α, ε, or ο)","A double consonant (ξ, ψ)"], correct:2 },
    { text:"In φιλέω (love), when stem-final ε meets connecting vowel ο, the result is:", options:["φιλεο- (both remain separate)","φιλου- (ε + ο contract to ου)","φιλα- (ε + ο contract to α)","φιλη- (ε + ο contract to η)"], correct:1 },
    { text:"When a labial consonant (π, β, φ) combines with the -σ- future marker, they merge to produce:", options:["ξ (xi)","ψ (psi)","The labial drops and σ remains","σσ (double sigma)"], correct:1 },
    { text:"Which principle best explains apparent stem irregularities in Greek verbs?", options:["Irregularities are random and must be memorized","Systematic phonological rules govern every apparent alteration","Most verbs have completely unique paradigms","Contract verbs use different personal endings"], correct:1 },
    { text:"Liquid verbs (stems ending in λ, μ, ν, ρ) differ primarily in that:", options:["They use a completely different set of personal endings","They never form aorists","They do not use the standard -σ- future tense formative but form futures through compensatory lengthening","They are all deponent verbs"], correct:2 }
  ]},
  va_31: { title:"Tense Formatives and Stem Changes", passMark:4, questions:[
    { text:"Which tense formative is characteristic of the aorist passive system?", options:["-σ-","-κ-","-θη-","-α-"], correct:2 },
    { text:"In ἔλυσα, the -σα- represents:", options:["Connecting vowel and personal ending combined","First aorist active tense formative (σ) plus thematic vowel (α)","The augment and the stem","The perfect active tense formative"], correct:1 },
    { text:"If a student spots -κ- between stem and ending, the most likely identification is:", options:["Future active","Aorist passive","Perfect active","Imperfect active"], correct:2 },
    { text:"Why are tense formatives 'diagnostic markers'?", options:["They replace the need to identify the personal ending","They narrow parsing possibilities to a specific tense-voice system before the ending is analyzed","They indicate the mood of the verb","They are only present in irregular verbs"], correct:1 },
    { text:"Which tense uses no tense formative in active forms but signals itself through reduplication?", options:["Aorist","Future","Perfect","Imperfect"], correct:2 }
  ]},
  va_32: { title:"Augment and Reduplication", passMark:4, questions:[
    { text:"The syllabic augment consists of:", options:["Lengthening the initial vowel of a vowel-initial stem","Adding ε- before consonant-initial stems to signal past indicative time","Reduplicating the initial consonant of the stem","Adding -κ- after the stem"], correct:1 },
    { text:"In ἤκουον (I was hearing — from ἀκούω), the augment is:", options:["A syllabic augment (ε- prefix added)","A temporal augment (initial α lengthened to η)","Reduplication of the first consonant","There is no augment in this form"], correct:1 },
    { text:"In which mood does the augment NOT appear, even for past-time verb systems?", options:["Indicative","Subjunctive","Only the imperative","Augment appears in all moods"], correct:1 },
    { text:"Reduplication in γέγραφα (from γράφω) consists of:", options:["The augment ε- before the stem","The γε- prefix formed by repeating initial consonant (γ) + ε","The perfect tense formative -κ-","A temporal lengthening of the initial vowel"], correct:1 },
    { text:"If a verb stem begins with an aspirated consonant (φ, θ, χ), the reduplication prefix uses:", options:["The aspirated consonant itself + ε","The corresponding unaspirated consonant + ε (e.g., πε- for φ-initial stems)","Simply ε- as a syllabic augment","No prefix — aspirated stems never reduplicate"], correct:1 }
  ]}
};
