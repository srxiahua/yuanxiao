const QUESTIONS_PER_LEVEL = 5;
const MAX_SINGLE_LEVEL = 6;
const FAMILY_ROUNDS = 3;
const STREAK_BONUS = 15;
const LEADERBOARD_KEY = "lantern-riddle-leaderboard-v1";
const AUDIO_ENABLED_KEY = "lantern-riddle-audio-enabled-v1";
const THEME_FILTER_KEY = "lantern-riddle-theme-filter-v1";

const presetDifficultyPools = {
  child: ["easy", "medium"],
  family: ["easy", "medium", "hard"],
  challenge: ["medium", "hard"],
};

const state = {
  riddles: [],
  rewards: [],
  mode: "single",
  preset: "family",
  questionTime: 20,
  timeLeft: 20,
  timerId: null,
  currentQuestion: null,
  answerLocked: false,
  audioEnabled: true,
  audioCtx: null,
  selectedThemes: [],
  availableThemes: [],
  posterDataUrl: "",
  usedQuestionIds: new Set(),
  usedRewardIds: new Set(),
  pendingAction: null,
  single: {
    level: 1,
    score: 0,
    streak: 0,
    totalAnswered: 0,
    totalCorrect: 0,
    levelAnswered: 0,
    levelCorrect: 0,
    currentQuestions: [],
    questionIndex: 0,
  },
  family: {
    players: [],
    turnIndex: 0,
    totalTurns: 0,
    questions: [],
    currentPlayerIndex: 0,
  },
  lastSession: {
    mode: "single",
    score: 0,
    maxLevel: 0,
    accuracy: 0,
    summaryText: "",
  },
};

const el = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();

  try {
    const [riddleRes, rewardRes] = await Promise.all([
      fetch("./data/riddles.json"),
      fetch("./data/rewards.json"),
    ]);

    if (!riddleRes.ok || !rewardRes.ok) {
      throw new Error("题库或奖励卡加载失败");
    }

    state.riddles = await riddleRes.json();
    state.rewards = await rewardRes.json();
  } catch (error) {
    console.error(error);
    alert("数据加载失败，请检查 data 目录后刷新重试。");
    return;
  }

  initAudioPreference();
  renderThemeFilters();
  applyModeUI("single");
  renderLeaderboard();
  showScreen("home-screen");
}

function cacheElements() {
  el.homeScreen = document.getElementById("home-screen");
  el.quizScreen = document.getElementById("quiz-screen");
  el.levelResultScreen = document.getElementById("level-result-screen");
  el.finalScreen = document.getElementById("final-screen");

  el.familyConfig = document.getElementById("family-config");
  el.difficultyPreset = document.getElementById("difficultyPreset");
  el.questionTime = document.getElementById("questionTime");
  el.playerCount = document.getElementById("playerCount");
  el.audioToggle = document.getElementById("audio-toggle");
  el.audioToggleText = document.getElementById("audio-toggle-text");
  el.themeFilterBox = document.getElementById("theme-filter-box");

  el.statusBadge = document.getElementById("status-badge");
  el.scoreView = document.getElementById("score-view");
  el.streakView = document.getElementById("streak-view");
  el.progressView = document.getElementById("progress-view");
  el.timerView = document.getElementById("timer-view");
  el.timerBar = document.getElementById("timer-bar");

  el.questionTheme = document.getElementById("question-theme");
  el.questionText = document.getElementById("question-text");
  el.questionHint = document.getElementById("question-hint");
  el.optionsBox = document.getElementById("options-box");
  el.answerFeedback = document.getElementById("answer-feedback");

  el.levelResultTitle = document.getElementById("level-result-title");
  el.levelResultSummary = document.getElementById("level-result-summary");
  el.nextStepBtn = document.getElementById("next-step");
  el.rewardCard = document.getElementById("reward-card");
  el.rewardTitle = document.getElementById("reward-title");
  el.rewardDesc = document.getElementById("reward-desc");

  el.finalTitle = document.getElementById("final-title");
  el.finalSummary = document.getElementById("final-summary");
  el.saveScoreBlock = document.getElementById("save-score-block");
  el.nicknameInput = document.getElementById("nickname-input");
  el.posterPanel = document.getElementById("poster-panel");
  el.posterPreview = document.getElementById("poster-preview");
  el.downloadPoster = document.getElementById("download-poster");
  el.posterCanvas = document.getElementById("poster-canvas");

  el.leaderboardModal = document.getElementById("leaderboard-modal");
  el.leaderboardList = document.getElementById("leaderboard-list");
}

function bindEvents() {
  document.querySelectorAll('input[name="gameMode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      applyModeUI(radio.value);
    });
  });

  document.getElementById("start-game").addEventListener("click", startGame);
  document.getElementById("show-leaderboard").addEventListener("click", openLeaderboard);
  document.getElementById("close-leaderboard").addEventListener("click", closeLeaderboard);
  document.getElementById("back-home-from-level").addEventListener("click", backHome);
  document.getElementById("play-again").addEventListener("click", backHome);
  document.getElementById("view-leaderboard-final").addEventListener("click", openLeaderboard);
  document.getElementById("save-score").addEventListener("click", saveLeaderboardRecord);
  document.getElementById("select-all-themes").addEventListener("click", () => {
    setAllThemesChecked(true);
  });
  document.getElementById("clear-themes").addEventListener("click", () => {
    setAllThemesChecked(false);
  });
  document.getElementById("generate-poster").addEventListener("click", generatePoster);
  document.getElementById("share-result-text").addEventListener("click", copyResultText);

  el.audioToggle.addEventListener("change", () => {
    const nextEnabled = Boolean(el.audioToggle.checked);
    if (!nextEnabled && state.audioEnabled) {
      playSfx("uiOff");
    }
    state.audioEnabled = nextEnabled;
    if (state.audioEnabled) {
      unlockAudio();
      playSfx("uiOn");
    }
    localStorage.setItem(AUDIO_ENABLED_KEY, JSON.stringify(state.audioEnabled));
    syncAudioToggleLabel();
  });

  el.nextStepBtn.addEventListener("click", () => {
    if (typeof state.pendingAction === "function") {
      state.pendingAction();
    }
  });

  el.leaderboardModal.addEventListener("click", (event) => {
    if (event.target === el.leaderboardModal) {
      closeLeaderboard();
    }
  });
}

function initAudioPreference() {
  try {
    const raw = localStorage.getItem(AUDIO_ENABLED_KEY);
    if (raw !== null) {
      state.audioEnabled = JSON.parse(raw) === true;
    }
  } catch (error) {
    console.error(error);
    state.audioEnabled = true;
  }

  el.audioToggle.checked = state.audioEnabled;
  syncAudioToggleLabel();
}

function syncAudioToggleLabel() {
  el.audioToggleText.textContent = state.audioEnabled ? "开启" : "关闭";
}

function renderThemeFilters() {
  const uniqueThemes = [...new Set(state.riddles.map((item) => item.theme))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
  state.availableThemes = uniqueThemes;

  const stored = loadStoredThemes();
  const selected = stored.length
    ? stored.filter((theme) => uniqueThemes.includes(theme))
    : [...uniqueThemes];
  state.selectedThemes = selected.length ? selected : [...uniqueThemes];

  el.themeFilterBox.innerHTML = "";
  uniqueThemes.forEach((theme) => {
    const chip = document.createElement("label");
    chip.className = "theme-chip";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = theme;
    input.checked = state.selectedThemes.includes(theme);
    input.addEventListener("change", () => {
      updateSelectedThemesFromDOM();
      persistThemeSelections();
      playSfx("tick");
    });

    const text = document.createElement("span");
    text.textContent = theme;

    chip.appendChild(input);
    chip.appendChild(text);
    el.themeFilterBox.appendChild(chip);
  });

  persistThemeSelections();
}

function loadStoredThemes() {
  try {
    const raw = localStorage.getItem(THEME_FILTER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function persistThemeSelections() {
  localStorage.setItem(THEME_FILTER_KEY, JSON.stringify(state.selectedThemes));
}

function updateSelectedThemesFromDOM() {
  state.selectedThemes = [
    ...el.themeFilterBox.querySelectorAll('input[type="checkbox"]:checked'),
  ].map((input) => input.value);
}

function setAllThemesChecked(checked) {
  [...el.themeFilterBox.querySelectorAll('input[type="checkbox"]')].forEach((input) => {
    input.checked = checked;
  });
  updateSelectedThemesFromDOM();
  persistThemeSelections();
  playSfx("tick");
}

function applyModeUI(mode) {
  state.mode = mode;

  document.querySelectorAll(".radio-card").forEach((card) => card.classList.remove("selected"));
  const checked = document.querySelector(`input[name="gameMode"][value="${mode}"]`);
  if (checked) {
    checked.checked = true;
    checked.closest(".radio-card")?.classList.add("selected");
  }

  if (mode === "family") {
    el.familyConfig.classList.remove("hidden");
  } else {
    el.familyConfig.classList.add("hidden");
  }
}

function startGame() {
  unlockAudio();
  stopTimer();
  state.usedQuestionIds.clear();
  state.usedRewardIds.clear();
  state.preset = el.difficultyPreset.value;
  state.questionTime = Number(el.questionTime.value);
  state.answerLocked = false;
  state.posterDataUrl = "";
  el.posterPanel.classList.add("hidden");

  updateSelectedThemesFromDOM();
  if (!state.selectedThemes.length) {
    alert("请至少选择 1 个题目分类后再开始游戏。");
    return;
  }
  persistThemeSelections();
  playSfx("tick");

  const mode = document.querySelector('input[name="gameMode"]:checked')?.value || "single";
  if (mode === "family") {
    startFamilyGame();
    return;
  }

  startSingleGame();
}

function startSingleGame() {
  state.mode = "single";
  state.single.level = 1;
  state.single.score = 0;
  state.single.streak = 0;
  state.single.totalAnswered = 0;
  state.single.totalCorrect = 0;
  startSingleLevel();
}

function startSingleLevel() {
  state.single.levelAnswered = 0;
  state.single.levelCorrect = 0;
  state.single.questionIndex = 0;

  const levelPool = getSingleLevelPool(state.single.level, state.preset);
  const questions = pickQuestions(QUESTIONS_PER_LEVEL, levelPool, true, state.selectedThemes);

  if (questions.length < QUESTIONS_PER_LEVEL) {
    alert("当前分类下题目不足，请调整分类后重试。");
    backHome();
    return;
  }

  state.single.currentQuestions = questions;
  showScreen("quiz-screen");
  renderCurrentQuestion();
}

function getSingleLevelPool(level, preset) {
  if (preset === "child") {
    if (level <= 2) return ["easy"];
    if (level <= 4) return ["easy", "medium"];
    return ["medium"];
  }

  if (preset === "challenge") {
    if (level <= 2) return ["medium"];
    if (level <= 4) return ["medium", "hard"];
    return ["hard"];
  }

  if (level <= 2) return ["easy", "medium"];
  if (level <= 4) return ["medium", "hard"];
  return ["hard"];
}

function startFamilyGame() {
  state.mode = "family";
  const count = Number(el.playerCount.value);
  state.family.players = Array.from({ length: count }, (_, index) => ({
    name: `玩家${index + 1}`,
    score: 0,
    streak: 0,
    answered: 0,
    correct: 0,
  }));

  state.family.turnIndex = 0;
  state.family.currentPlayerIndex = 0;
  state.family.totalTurns = count * FAMILY_ROUNDS;
  state.family.questions = pickQuestions(
    state.family.totalTurns,
    presetDifficultyPools[state.preset],
    false,
    state.selectedThemes,
  );

  if (state.family.questions.length < state.family.totalTurns) {
    alert("当前分类下题目不足以完成家庭PK，请增加分类后重试。");
    backHome();
    return;
  }

  showScreen("quiz-screen");
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  state.answerLocked = false;
  el.answerFeedback.textContent = "";
  el.answerFeedback.classList.remove("ok", "bad");

  if (state.mode === "single") {
    const question = state.single.currentQuestions[state.single.questionIndex];
    if (!question) {
      finishSingleLevel();
      return;
    }

    state.currentQuestion = question;
    el.statusBadge.textContent = `单人闯关 · 第${state.single.level}关`;
    el.scoreView.textContent = `积分：${state.single.score}`;
    el.streakView.textContent = `连击：${state.single.streak}`;
    el.progressView.textContent = `第${state.single.questionIndex + 1}/${QUESTIONS_PER_LEVEL}题`;
  } else {
    if (state.family.turnIndex >= state.family.totalTurns) {
      finishFamilyGame();
      return;
    }

    const playerIndex = state.family.turnIndex % state.family.players.length;
    const round = Math.floor(state.family.turnIndex / state.family.players.length) + 1;
    state.family.currentPlayerIndex = playerIndex;
    state.currentQuestion = state.family.questions[state.family.turnIndex];

    const player = state.family.players[playerIndex];
    el.statusBadge.textContent = `家庭PK · 第${round}轮 · ${player.name}`;
    el.scoreView.textContent = `${player.name}积分：${player.score}`;
    el.streakView.textContent = `${player.name}连击：${player.streak}`;
    el.progressView.textContent = `第${state.family.turnIndex + 1}/${state.family.totalTurns}题`;
  }

  renderQuestionContent(state.currentQuestion);
  startTimer();
}

function renderQuestionContent(question) {
  el.questionTheme.textContent = `主题：${question.theme}`;
  el.questionText.textContent = question.question;
  el.questionHint.textContent = `提示：${question.hint}`;

  el.optionsBox.innerHTML = "";
  question.options.forEach((option, index) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.type = "button";
    btn.textContent = `${String.fromCharCode(65 + index)}. ${option}`;
    btn.addEventListener("click", () => handleAnswer(index, false));
    el.optionsBox.appendChild(btn);
  });
}

function startTimer() {
  stopTimer();
  state.timeLeft = state.questionTime;
  updateTimerView();

  state.timerId = window.setInterval(() => {
    state.timeLeft -= 1;
    updateTimerView();

    if (state.timeLeft <= 0) {
      handleAnswer(null, true);
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function updateTimerView() {
  const ratio = Math.max(0, state.timeLeft / state.questionTime);
  el.timerView.textContent = `${Math.max(0, state.timeLeft)}s`;
  el.timerBar.style.width = `${ratio * 100}%`;
}

function handleAnswer(selectedIndex, isTimeout) {
  if (state.answerLocked) {
    return;
  }

  state.answerLocked = true;
  stopTimer();

  const question = state.currentQuestion;
  const isCorrect = selectedIndex === question.answerIndex;
  if (!isTimeout) {
    playSfx("tick");
  }

  let feedback;
  if (state.mode === "single") {
    feedback = scoreSingleAnswer(isCorrect, question, isTimeout);
  } else {
    feedback = scoreFamilyAnswer(isCorrect, question, isTimeout);
  }

  markAnswerResult(selectedIndex, question.answerIndex);
  playSfx(isCorrect ? "correct" : "wrong");
  el.answerFeedback.textContent = feedback.text;
  el.answerFeedback.classList.toggle("ok", feedback.type === "ok");
  el.answerFeedback.classList.toggle("bad", feedback.type === "bad");

  window.setTimeout(() => {
    if (state.mode === "single") {
      state.single.questionIndex += 1;
    } else {
      state.family.turnIndex += 1;
    }
    renderCurrentQuestion();
  }, 900);
}

function scoreSingleAnswer(isCorrect, question, isTimeout) {
  state.single.totalAnswered += 1;
  state.single.levelAnswered += 1;

  if (isCorrect) {
    state.single.totalCorrect += 1;
    state.single.levelCorrect += 1;
    state.single.streak += 1;

    const base = 10;
    const timeBonus = Math.max(0, state.timeLeft);
    const comboBonus = state.single.streak % 3 === 0 ? STREAK_BONUS : 0;
    const totalGain = base + timeBonus + comboBonus;

    state.single.score += totalGain;

    el.scoreView.textContent = `积分：${state.single.score}`;
    el.streakView.textContent = `连击：${state.single.streak}`;

    const comboText = comboBonus > 0 ? `，连击奖励 +${comboBonus}` : "";
    return { text: `回答正确！+${totalGain} 分（基础10 + 时间${timeBonus}${comboText}）`, type: "ok" };
  }

  state.single.streak = 0;
  el.streakView.textContent = `连击：${state.single.streak}`;

  if (isTimeout) {
    return { text: `超时啦，正确答案是：${question.options[question.answerIndex]}`, type: "bad" };
  }

  return { text: `回答错误，正确答案是：${question.options[question.answerIndex]}`, type: "bad" };
}

function scoreFamilyAnswer(isCorrect, question, isTimeout) {
  const player = state.family.players[state.family.currentPlayerIndex];
  player.answered += 1;

  if (isCorrect) {
    player.correct += 1;
    player.streak += 1;

    const base = 10;
    const timeBonus = Math.floor(Math.max(0, state.timeLeft) * 0.8);
    const comboBonus = player.streak % 3 === 0 ? 10 : 0;
    const totalGain = base + timeBonus + comboBonus;

    player.score += totalGain;
    el.scoreView.textContent = `${player.name}积分：${player.score}`;
    el.streakView.textContent = `${player.name}连击：${player.streak}`;

    return { text: `${player.name}答对了！+${totalGain}分`, type: "ok" };
  }

  player.streak = 0;
  el.streakView.textContent = `${player.name}连击：${player.streak}`;

  if (isTimeout) {
    return { text: `${player.name}超时，正确答案：${question.options[question.answerIndex]}`, type: "bad" };
  }

  return { text: `${player.name}答错了，正确答案：${question.options[question.answerIndex]}`, type: "bad" };
}

function markAnswerResult(selectedIndex, answerIndex) {
  const buttons = [...el.optionsBox.querySelectorAll(".option-btn")];
  buttons.forEach((button, idx) => {
    button.disabled = true;
    if (idx === answerIndex) {
      button.classList.add("correct");
    } else if (selectedIndex !== null && idx === selectedIndex) {
      button.classList.add("wrong");
    }
  });
}

function finishSingleLevel() {
  const level = state.single.level;
  const accuracy = state.single.levelCorrect / QUESTIONS_PER_LEVEL;
  const pass = accuracy >= 0.6;

  let reward = null;
  if (pass && level % 2 === 0) {
    reward = getRandomReward();
  }

  if (pass) {
    state.single.level += 1;
  }
  playSfx(pass ? "pass" : "fail");

  el.levelResultTitle.textContent = pass ? `第${level}关通过` : `第${level}关未通过`;
  el.levelResultSummary.textContent = `本关答对 ${state.single.levelCorrect}/${QUESTIONS_PER_LEVEL} 题，正确率 ${Math.round(
    accuracy * 100,
  )}% 。当前总分 ${state.single.score} 分。${pass ? "继续冲刺下一关！" : "再试一次，稳住节奏！"}`;

  if (reward) {
    el.rewardCard.classList.remove("hidden");
    el.rewardTitle.textContent = reward.title;
    el.rewardDesc.textContent = reward.description;
  } else {
    el.rewardCard.classList.add("hidden");
  }

  if (!pass) {
    el.nextStepBtn.textContent = "重试本关";
    state.pendingAction = () => {
      showScreen("quiz-screen");
      startSingleLevel();
    };
  } else if (level >= MAX_SINGLE_LEVEL) {
    el.nextStepBtn.textContent = "查看总成绩";
    state.pendingAction = finishSingleGame;
  } else {
    el.nextStepBtn.textContent = "进入下一关";
    state.pendingAction = () => {
      showScreen("quiz-screen");
      startSingleLevel();
    };
  }

  showScreen("level-result-screen");
}

function finishSingleGame() {
  stopTimer();
  const accuracy =
    state.single.totalAnswered === 0
      ? 0
      : Math.round((state.single.totalCorrect / state.single.totalAnswered) * 100);
  const maxLevel = state.single.level - 1;

  state.lastSession = {
    mode: "single",
    score: state.single.score,
    maxLevel,
    accuracy,
  };

  el.finalTitle.textContent = "闯关结束";
  el.finalSummary.textContent = `你共完成 ${maxLevel} 关，总答题 ${state.single.totalAnswered} 题，正确率 ${accuracy}% ，最终积分 ${state.single.score} 分。`;
  state.lastSession.summaryText = `我在元宵猜灯谜闯关中拿到 ${state.single.score} 分，通关 ${maxLevel} 关，正确率 ${accuracy}%！`;
  el.saveScoreBlock.classList.remove("hidden");
  el.nicknameInput.value = "";
  el.posterPanel.classList.add("hidden");
  state.posterDataUrl = "";
  playSfx("victory");

  showScreen("final-screen");
}

function finishFamilyGame() {
  stopTimer();
  const ranking = [...state.family.players].sort((a, b) => b.score - a.score);
  const top = ranking[0];

  state.lastSession = {
    mode: "family",
    score: top?.score || 0,
    maxLevel: FAMILY_ROUNDS,
    accuracy: 0,
    summaryText: `家庭PK冠军是${top.name}，拿到 ${top.score} 分！`,
  };

  el.finalTitle.textContent = "家庭PK结束";
  el.finalSummary.innerHTML = `本轮冠军：${top.name}（${top.score}分）<br>${ranking
    .map((p, idx) => `${idx + 1}. ${p.name}：${p.score}分（答对${p.correct}/${p.answered}）`)
    .join("<br>")}`;
  el.saveScoreBlock.classList.add("hidden");
  el.posterPanel.classList.add("hidden");
  state.posterDataUrl = "";
  playSfx("victory");

  showScreen("final-screen");
}

function pickQuestions(count, difficulties, avoidReuse, themes = []) {
  const allEligible = state.riddles.filter((item) => {
    const difficultyMatch = difficulties.includes(item.difficulty);
    const themeMatch = !themes.length || themes.includes(item.theme);
    return difficultyMatch && themeMatch;
  });
  if (allEligible.length === 0) {
    return [];
  }

  let candidates = allEligible;
  if (avoidReuse) {
    const fresh = allEligible.filter((item) => !state.usedQuestionIds.has(item.id));
    candidates = fresh.length >= count ? fresh : allEligible;
  }

  const selected = [];
  while (selected.length < count) {
    const shuffled = shuffle([...candidates]);
    for (const item of shuffled) {
      selected.push(item);
      if (selected.length >= count) break;
    }
    if (!candidates.length) break;
  }

  if (avoidReuse) {
    selected.slice(0, count).forEach((item) => state.usedQuestionIds.add(item.id));
  }

  return selected.slice(0, count);
}

function getRandomReward() {
  if (!state.rewards.length) {
    return null;
  }

  let candidates = state.rewards.filter((reward) => !state.usedRewardIds.has(reward.id));
  if (!candidates.length) {
    state.usedRewardIds.clear();
    candidates = [...state.rewards];
  }

  const reward = candidates[Math.floor(Math.random() * candidates.length)];
  state.usedRewardIds.add(reward.id);
  return reward;
}

function saveLeaderboardRecord() {
  if (state.lastSession.mode !== "single") {
    return;
  }

  const name = (el.nicknameInput.value || "").trim() || "元宵玩家";
  const records = loadLeaderboard();
  const newRecord = {
    name,
    score: state.lastSession.score,
    level: state.lastSession.maxLevel,
    accuracy: state.lastSession.accuracy,
    date: new Date().toLocaleString("zh-CN", { hour12: false }),
  };

  const merged = [...records, newRecord]
    .sort((a, b) => b.score - a.score || b.level - a.level)
    .slice(0, 20);

  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(merged));
  renderLeaderboard();
  playSfx("save");
  alert("成绩已保存到本地排行榜！");
}

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function renderLeaderboard() {
  const records = loadLeaderboard();
  el.leaderboardList.innerHTML = "";

  if (!records.length) {
    const empty = document.createElement("li");
    empty.textContent = "暂无成绩，快去挑战第一名吧！";
    el.leaderboardList.appendChild(empty);
    return;
  }

  records.forEach((record) => {
    const li = document.createElement("li");
    li.textContent = `${record.name} · ${record.score}分 · 通关${record.level}关 · 正确率${record.accuracy}% · ${record.date}`;
    el.leaderboardList.appendChild(li);
  });
}

function openLeaderboard() {
  renderLeaderboard();
  el.leaderboardModal.classList.remove("hidden");
}

function closeLeaderboard() {
  el.leaderboardModal.classList.add("hidden");
}

function getAudioContext() {
  if (state.audioCtx) {
    return state.audioCtx;
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    return null;
  }

  state.audioCtx = new AudioCtx();
  return state.audioCtx;
}

function unlockAudio() {
  if (!state.audioEnabled) {
    return;
  }
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

function playTone(ctx, { freq, offset = 0, duration = 0.16, type = "sine", gain = 0.05 }) {
  const now = ctx.currentTime + offset;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(gain, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playSfx(kind) {
  if (!state.audioEnabled) {
    return;
  }

  const ctx = getAudioContext();
  if (!ctx || ctx.state === "suspended") {
    return;
  }

  const maps = {
    tick: [{ freq: 523, duration: 0.08, type: "triangle", gain: 0.03 }],
    correct: [
      { freq: 660, duration: 0.1, type: "triangle", gain: 0.04 },
      { freq: 880, offset: 0.1, duration: 0.12, type: "triangle", gain: 0.05 },
    ],
    wrong: [
      { freq: 280, duration: 0.12, type: "sawtooth", gain: 0.04 },
      { freq: 220, offset: 0.12, duration: 0.14, type: "sawtooth", gain: 0.04 },
    ],
    pass: [
      { freq: 740, duration: 0.1, type: "triangle", gain: 0.04 },
      { freq: 988, offset: 0.1, duration: 0.13, type: "triangle", gain: 0.05 },
    ],
    fail: [{ freq: 240, duration: 0.18, type: "square", gain: 0.035 }],
    victory: [
      { freq: 659, duration: 0.1, type: "triangle", gain: 0.04 },
      { freq: 784, offset: 0.1, duration: 0.1, type: "triangle", gain: 0.045 },
      { freq: 988, offset: 0.2, duration: 0.16, type: "triangle", gain: 0.05 },
    ],
    save: [{ freq: 587, duration: 0.11, type: "triangle", gain: 0.04 }],
    uiOn: [{ freq: 640, duration: 0.08, type: "triangle", gain: 0.03 }],
    uiOff: [{ freq: 300, duration: 0.1, type: "triangle", gain: 0.03 }],
  };

  const seq = maps[kind];
  if (!seq) return;
  seq.forEach((node) => playTone(ctx, node));
}

function generatePoster() {
  if (!state.lastSession.summaryText) {
    alert("请先完成一局游戏，再生成海报。");
    return;
  }

  const canvas = el.posterCanvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    alert("当前浏览器不支持海报生成功能。");
    return;
  }

  const width = canvas.width;
  const height = canvas.height;

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#8f1114");
  gradient.addColorStop(0.5, "#bc2428");
  gradient.addColorStop(1, "#f2b453");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255, 232, 184, 0.2)";
  for (let i = 0; i < 12; i += 1) {
    ctx.beginPath();
    ctx.arc(
      Math.random() * width,
      Math.random() * height,
      30 + Math.random() * 70,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  ctx.fillStyle = "#ffe9b0";
  ctx.font = "bold 78px STKaiti, KaiTi, serif";
  ctx.textAlign = "center";
  ctx.fillText("元宵猜灯谜", width / 2, 180);

  ctx.font = "bold 52px STKaiti, KaiTi, serif";
  ctx.fillStyle = "#fff6df";
  ctx.fillText("战绩海报", width / 2, 250);

  ctx.strokeStyle = "rgba(255, 240, 198, 0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(80, 320, width - 160, height - 470);

  ctx.fillStyle = "rgba(255, 251, 239, 0.92)";
  ctx.fillRect(110, 350, width - 220, height - 540);

  ctx.fillStyle = "#8c1216";
  ctx.font = "bold 48px STKaiti, KaiTi, serif";
  ctx.fillText(`模式：${state.lastSession.mode === "single" ? "单人闯关" : "家庭PK"}`, width / 2, 460);

  ctx.font = "bold 64px STKaiti, KaiTi, serif";
  ctx.fillText(`积分 ${state.lastSession.score}`, width / 2, 560);

  ctx.font = "38px PingFang SC, Microsoft YaHei, sans-serif";
  ctx.fillStyle = "#67201f";
  const lines = wrapPosterText(state.lastSession.summaryText, 22);
  lines.slice(0, 3).forEach((line, idx) => {
    ctx.fillText(line, width / 2, 680 + idx * 64);
  });

  ctx.fillStyle = "#7d241e";
  ctx.font = "30px PingFang SC, Microsoft YaHei, sans-serif";
  ctx.fillText(`时间：${new Date().toLocaleDateString("zh-CN")}`, width / 2, height - 250);
  ctx.fillText("快来和家人一起挑战吧！", width / 2, height - 190);
  ctx.fillText("yuanxiao lantern riddles", width / 2, height - 130);

  const dataUrl = canvas.toDataURL("image/png");
  state.posterDataUrl = dataUrl;
  el.posterPreview.src = dataUrl;
  el.downloadPoster.href = dataUrl;
  el.posterPanel.classList.remove("hidden");
  playSfx("save");
}

function wrapPosterText(text, maxLen) {
  const chars = [...text];
  const lines = [];
  let current = "";
  chars.forEach((char) => {
    current += char;
    if (current.length >= maxLen) {
      lines.push(current);
      current = "";
    }
  });
  if (current) {
    lines.push(current);
  }
  return lines;
}

async function copyResultText() {
  if (!state.lastSession.summaryText) {
    alert("请先完成一局游戏。");
    return;
  }

  const text = `${state.lastSession.summaryText}\n来试试《元宵猜灯谜大闯关》！`;
  try {
    await navigator.clipboard.writeText(text);
    playSfx("save");
    alert("战绩文案已复制，可以直接粘贴分享。");
  } catch (error) {
    console.error(error);
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    playSfx("save");
    alert("战绩文案已复制，可以直接粘贴分享。");
  }
}

function backHome() {
  stopTimer();
  state.posterDataUrl = "";
  el.posterPanel.classList.add("hidden");
  showScreen("home-screen");
}

function showScreen(screenId) {
  ["home-screen", "quiz-screen", "level-result-screen", "final-screen"].forEach((id) => {
    document.getElementById(id).classList.toggle("active", id === screenId);
  });
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
