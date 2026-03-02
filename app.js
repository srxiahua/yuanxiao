const QUESTIONS_PER_LEVEL = 5;
const MAX_SINGLE_LEVEL = 6;
const FAMILY_ROUNDS = 3;
const STREAK_BONUS = 15;
const LEADERBOARD_KEY = "lantern-riddle-leaderboard-v1";

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
  stopTimer();
  state.usedQuestionIds.clear();
  state.usedRewardIds.clear();
  state.preset = el.difficultyPreset.value;
  state.questionTime = Number(el.questionTime.value);
  state.answerLocked = false;

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
  const questions = pickQuestions(QUESTIONS_PER_LEVEL, levelPool, true);

  if (questions.length < QUESTIONS_PER_LEVEL) {
    // 理论上不会进入，除非题库被删空
    finishSingleGame();
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
  );

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

  let feedback;
  if (state.mode === "single") {
    feedback = scoreSingleAnswer(isCorrect, question, isTimeout);
  } else {
    feedback = scoreFamilyAnswer(isCorrect, question, isTimeout);
  }

  markAnswerResult(selectedIndex, question.answerIndex);
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
  el.saveScoreBlock.classList.remove("hidden");
  el.nicknameInput.value = "";

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
  };

  el.finalTitle.textContent = "家庭PK结束";
  el.finalSummary.innerHTML = `本轮冠军：${top.name}（${top.score}分）<br>${ranking
    .map((p, idx) => `${idx + 1}. ${p.name}：${p.score}分（答对${p.correct}/${p.answered}）`)
    .join("<br>")}`;
  el.saveScoreBlock.classList.add("hidden");

  showScreen("final-screen");
}

function pickQuestions(count, difficulties, avoidReuse) {
  const allEligible = state.riddles.filter((item) => difficulties.includes(item.difficulty));
  if (allEligible.length === 0) {
    return [];
  }

  let candidates = allEligible;
  if (avoidReuse) {
    const fresh = allEligible.filter((item) => !state.usedQuestionIds.has(item.id));
    candidates = fresh.length >= count ? fresh : allEligible;
  }

  const shuffled = shuffle([...candidates]);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  if (avoidReuse) {
    selected.forEach((item) => state.usedQuestionIds.add(item.id));
  }

  return selected;
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

function backHome() {
  stopTimer();
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
