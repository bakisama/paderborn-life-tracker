// ==================== M.Sc. Life Tracker — Universität Paderborn ====================
// UI only. Semester dates and week generation live in calendar.js.

(function () {
  'use strict';

  const {
    parseDate, toISODate, formatDate, formatDateShort,
    buildPeriods, applyOverrides, generateWeeks, DEFAULT_START,
  } = Calendar;

  // ---- Constants ----
  const STORAGE_KEYS = {
    startDate: 'upblt-start-date',
    semesters: 'upblt-semesters',
    scores: 'upblt-scores', // { 'YYYY-MM-DD' (Monday of week): 1..5 }
    overrides: 'upblt-overrides',
    theme: 'upblt-theme',
  };

  const DEFAULT_SEMESTERS = '4';
  const SCORE_LABELS = ['', 'Rough', 'Low', 'Okay', 'Good', 'Great'];

  // ---- DOM References ----
  const $ = (id) => document.getElementById(id);
  const startDateInput = $('startDate');
  const programTypeSelect = $('programType');
  const buildBtn = $('buildBtn');
  const advancedToggle = $('advancedToggle');
  const advancedBtn = $('advancedBtn');
  const advancedPanel = $('advancedPanel');
  const advancedContent = $('advancedContent');
  const saveOverridesBtn = $('saveOverrides');
  const clearOverridesBtn = $('clearOverrides');
  const statsBar = $('statsBar');
  const currentWeekBar = $('currentWeekBar');
  const todayDisplay = $('todayDisplay');
  const calendarGrid = $('calendarGrid');
  const footer = $('footer');
  const modalOverlay = $('modalOverlay');
  const modalTitle = $('modalTitle');
  const modalSubtitle = $('modalSubtitle');
  const modalClose = $('modalClose');
  const clearScoreBtn = $('clearScore');
  const cancelModalBtn = $('cancelModal');
  const tooltip = $('tooltip');

  // ---- State ----
  let allWeeks = [];
  let scores = {};
  let overrides = {};
  let currentModalWeek = null;

  function today() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  function weekRange(week) {
    return `${formatDateShort(week.start)} – ${formatDateShort(week.end)}`;
  }

  // ---- Current Week Detection ----
  function findCurrentWeekIndex() {
    const now = today();
    for (let i = 0; i < allWeeks.length; i++) {
      if (now >= allWeeks[i].start && now <= allWeeks[i].end) return i;
    }
    if (allWeeks.length > 0 && now > allWeeks[allWeeks.length - 1].end) return allWeeks.length;
    return -1;
  }

  // ---- Statistics ----
  // Counted by date, not by current-week index: today can fall in a gap left by overrides
  function updateStats() {
    const now = today();
    const pastWeeks = allWeeks.filter((w) => w.end < now);
    const elapsed = pastWeeks.length;
    let scored = 0;
    let totalScore = 0;

    pastWeeks.forEach((w) => {
      const s = scores[w.id];
      if (s) {
        scored++;
        totalScore += s;
      }
    });

    const remaining = allWeeks.filter((w) => w.start > now).length;
    const avg = scored > 0 ? (totalScore / scored).toFixed(2) : '—';

    $('statElapsed').textContent = elapsed;
    $('statScored').textContent = scored;
    $('statAvg').textContent = avg;
    $('statRemaining').textContent = remaining;
  }

  // ---- Current Week Bar ----
  function updateCurrentWeekBar() {
    const currentIdx = findCurrentWeekIndex();
    if (currentIdx < 0 || currentIdx >= allWeeks.length) {
      currentWeekBar.style.display = 'none';
      return;
    }

    const week = allWeeks[currentIdx];
    currentWeekBar.style.display = 'flex';
    $('cwPeriod').textContent = `${week.semesterLabel} — ${week.periodLabel}`;
    $('cwWeek').textContent = `Week ${week.periodWeek} (overall ${week.globalIndex + 1}/${allWeeks.length})`;
    $('cwDates').textContent = weekRange(week);
  }

  // ---- Render Calendar ----
  function renderCalendar() {
    calendarGrid.innerHTML = '';
    const currentIdx = findCurrentWeekIndex();
    const now = today();

    // Group weeks by semester, then by period (insertion order = chronological)
    const semesterGroups = new Map();
    allWeeks.forEach((w) => {
      if (!semesterGroups.has(w.semester)) {
        semesterGroups.set(w.semester, { label: w.semesterLabel, periods: new Map() });
      }
      const periods = semesterGroups.get(w.semester).periods;
      if (!periods.has(w.periodKey)) periods.set(w.periodKey, { label: w.periodLabel, weeks: [] });
      periods.get(w.periodKey).weeks.push(w);
    });

    semesterGroups.forEach((sem) => {
      const semDiv = document.createElement('div');
      semDiv.className = 'year-group';

      const semTitle = document.createElement('h2');
      semTitle.className = 'year-title';
      semTitle.textContent = sem.label;
      semDiv.appendChild(semTitle);

      sem.periods.forEach((period) => {
        const periodDiv = document.createElement('div');
        periodDiv.className = 'period-group';

        const header = document.createElement('div');
        header.className = 'period-header';

        const name = document.createElement('span');
        name.className = 'period-name';
        name.textContent = period.label;

        // Actual period dates (e.g. Christmas 23 Dec – 6 Jan), not the Monday–Sunday week span
        const dates = document.createElement('span');
        dates.className = 'period-dates';
        const { periodStart, periodEnd } = period.weeks[0];
        dates.textContent = `${formatDateShort(periodStart)} – ${formatDateShort(periodEnd)}`;

        header.appendChild(name);
        header.appendChild(dates);
        periodDiv.appendChild(header);

        const row = document.createElement('div');
        row.className = 'weeks-row';

        period.weeks.forEach((week) => {
          const sq = document.createElement('div');
          sq.className = 'week-square';
          sq.dataset.week = week.id;

          const isCurrent = week.globalIndex === currentIdx;
          const isPast = week.end < now && !isCurrent;
          const isFuture = week.start > now && !isCurrent;
          const score = scores[week.id];

          if (isCurrent) {
            sq.classList.add('current');
          } else if (isPast && score) {
            sq.classList.add('past', `score-${score}`);
          } else {
            if (isPast) sq.classList.add('past');
            if (isFuture) sq.classList.add('future');
            sq.classList.add(week.isBreak ? 'break' : 'teaching');
          }

          sq.setAttribute('aria-label', tooltipText(week, isCurrent, isPast, score).replace(/\n/g, ', '));

          // Past weeks are scoreable by mouse and keyboard
          if (isPast) {
            sq.tabIndex = 0;
            sq.setAttribute('role', 'button');
            sq.addEventListener('click', () => openScoreModal(week));
            sq.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openScoreModal(week);
              }
            });
          }

          sq.addEventListener('mouseenter', (e) => showTooltip(e, week, isCurrent, isPast, score));
          sq.addEventListener('mouseleave', hideTooltip);
          sq.addEventListener('mousemove', moveTooltip);

          row.appendChild(sq);
        });

        periodDiv.appendChild(row);
        semDiv.appendChild(periodDiv);
      });

      calendarGrid.appendChild(semDiv);
    });
  }

  // ---- Tooltip ----
  function tooltipText(week, isCurrent, isPast, score) {
    let text = `${week.semesterLabel}\n${week.periodLabel}\n`;
    text += `Week ${week.periodWeek} · ${weekRange(week)}`;

    if (isCurrent) {
      text += '\n★ You are here';
    } else if (isPast && score) {
      text += `\nScore: ${score}/5 (${SCORE_LABELS[score]})`;
    } else if (isPast) {
      text += '\nClick to score';
    }
    return text;
  }

  function showTooltip(e, week, isCurrent, isPast, score) {
    tooltip.textContent = tooltipText(week, isCurrent, isPast, score);
    tooltip.style.whiteSpace = 'pre-line';
    tooltip.classList.add('visible');
    moveTooltip(e);
  }

  function moveTooltip(e) {
    // Flip to the left of the cursor near the right edge so it never leaves the viewport
    const flip = e.clientX + 12 + tooltip.offsetWidth > window.innerWidth;
    tooltip.style.left = (flip ? e.clientX - 12 - tooltip.offsetWidth : e.clientX + 12) + 'px';
    tooltip.style.top = (e.clientY - 10) + 'px';
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
  }

  // ---- Modal ----
  function openScoreModal(week) {
    currentModalWeek = week;
    modalTitle.textContent = `${week.semesterLabel} — ${week.periodLabel}`;
    modalSubtitle.textContent = `Week ${week.periodWeek} · ${weekRange(week)}`;

    const existing = scores[week.id];
    clearScoreBtn.style.display = existing ? 'inline-block' : 'none';

    document.querySelectorAll('.score-btn').forEach((btn) => {
      btn.classList.toggle('active', +btn.dataset.score === existing);
    });

    hideTooltip();
    modalOverlay.classList.add('active');
    document.querySelector(`.score-btn[data-score="${existing || 3}"]`).focus();
  }

  // Return focus to the week's square (looked up by id: scoring re-renders the grid)
  function closeModal() {
    if (!modalOverlay.classList.contains('active')) return;
    modalOverlay.classList.remove('active');
    const sq = calendarGrid.querySelector(`[data-week="${currentModalWeek.id}"]`);
    currentModalWeek = null;
    if (sq) sq.focus();
  }

  function refresh() {
    renderCalendar();
    updateStats();
  }

  function setScore(score) {
    if (!currentModalWeek) return;
    scores[currentModalWeek.id] = score;
    saveScores();
    refresh();
    closeModal();
  }

  function clearScore() {
    if (!currentModalWeek) return;
    delete scores[currentModalWeek.id];
    saveScores();
    refresh();
    closeModal();
  }

  // ---- LocalStorage ----
  function saveScores() {
    localStorage.setItem(STORAGE_KEYS.scores, JSON.stringify(scores));
  }

  function loadJSON(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveOverridesData() {
    localStorage.setItem(STORAGE_KEYS.overrides, JSON.stringify(overrides));
  }

  function saveConfig(startDate, semesters) {
    localStorage.setItem(STORAGE_KEYS.startDate, startDate);
    localStorage.setItem(STORAGE_KEYS.semesters, semesters);
  }

  function loadConfig() {
    return {
      startDate: localStorage.getItem(STORAGE_KEYS.startDate),
      semesters: localStorage.getItem(STORAGE_KEYS.semesters) || DEFAULT_SEMESTERS,
    };
  }

  // ---- Advanced Settings ----
  function renderAdvancedPanel(periods) {
    advancedContent.innerHTML = '';
    const grouped = new Map();
    periods.forEach((p) => {
      if (!grouped.has(p.semester)) grouped.set(p.semester, { label: p.semesterLabel, periods: [] });
      grouped.get(p.semester).periods.push(p);
    });

    grouped.forEach((sem) => {
      const semDiv = document.createElement('div');
      semDiv.className = 'advanced-year';

      const title = document.createElement('h4');
      title.textContent = sem.label;
      semDiv.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'advanced-semesters';

      sem.periods.forEach((p) => {
        [['start', 'Start'], ['end', 'End']].forEach(([field, word]) => {
          const label = document.createElement('label');
          label.textContent = `${p.label} ${word}`;
          const input = document.createElement('input');
          input.type = 'date';
          input.value = toISODate(p[field]);
          input.dataset.key = `${p.key}_${field}`;
          label.appendChild(input);
          grid.appendChild(label);
        });
      });

      semDiv.appendChild(grid);
      advancedContent.appendChild(semDiv);
    });
  }

  // Only store values that differ from the computed default, so defaults can still improve later
  function collectOverrides(defaultPeriods) {
    const defaults = {};
    defaultPeriods.forEach((p) => {
      defaults[`${p.key}_start`] = toISODate(p.start);
      defaults[`${p.key}_end`] = toISODate(p.end);
    });
    const next = {};
    advancedContent.querySelectorAll('input[data-key]').forEach((inp) => {
      if (inp.value && inp.value !== defaults[inp.dataset.key]) next[inp.dataset.key] = inp.value;
    });
    return next;
  }

  // ---- Build Everything ----
  let defaultPeriods = [];

  function buildCalendar(startDate, semesters) {
    defaultPeriods = buildPeriods(parseDate(startDate), +semesters || +DEFAULT_SEMESTERS);
    const periods = applyOverrides(defaultPeriods, overrides);
    allWeeks = generateWeeks(periods);

    advancedToggle.style.display = 'block';
    statsBar.style.display = 'flex';
    todayDisplay.style.display = 'block';
    footer.style.display = 'block';

    $('todayDate').textContent = formatDate(new Date());

    refresh();
    updateCurrentWeekBar();
    renderAdvancedPanel(periods);
  }

  function rebuildFromConfig() {
    const config = loadConfig();
    if (config.startDate) buildCalendar(config.startDate, config.semesters);
    advancedPanel.style.display = 'none';
  }

  // ---- Event Handlers ----
  buildBtn.addEventListener('click', () => {
    const startDate = startDateInput.value;
    if (!startDate) {
      startDateInput.focus();
      return;
    }
    const semesters = programTypeSelect.value;
    // Overrides are keyed by semester position (s1_…), so they don't carry over to a different plan
    const prev = loadConfig();
    if (prev.startDate && (prev.startDate !== startDate || prev.semesters !== semesters)) {
      overrides = {};
      saveOverridesData();
    }
    saveConfig(startDate, semesters);
    buildCalendar(startDate, semesters);
  });

  advancedBtn.addEventListener('click', () => {
    const isOpen = advancedPanel.style.display !== 'none';
    advancedPanel.style.display = isOpen ? 'none' : 'block';
  });

  saveOverridesBtn.addEventListener('click', () => {
    overrides = collectOverrides(defaultPeriods);
    saveOverridesData();
    rebuildFromConfig();
  });

  clearOverridesBtn.addEventListener('click', () => {
    overrides = {};
    saveOverridesData();
    rebuildFromConfig();
  });

  document.querySelectorAll('.score-btn').forEach((btn) => {
    btn.addEventListener('click', () => setScore(+btn.dataset.score));
  });

  clearScoreBtn.addEventListener('click', clearScore);
  cancelModalBtn.addEventListener('click', closeModal);
  modalClose.addEventListener('click', closeModal);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (modalOverlay.classList.contains('active') && e.key >= '1' && e.key <= '5') {
      setScore(+e.key);
    }
  });

  // ---- Theme Toggle ----
  const themeToggle = $('themeToggle');

  function getPreferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggle.textContent = theme === 'dark' ? '☀' : '☾';
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  }

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  // ---- Init ----
  function init() {
    applyTheme(getPreferredTheme());
    scores = loadJSON(STORAGE_KEYS.scores);
    overrides = loadJSON(STORAGE_KEYS.overrides);
    const config = loadConfig();

    programTypeSelect.value = config.semesters;
    startDateInput.value = config.startDate || DEFAULT_START;
    if (config.startDate) buildCalendar(config.startDate, config.semesters);
  }

  init();
})();
