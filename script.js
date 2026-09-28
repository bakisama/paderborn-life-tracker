// ==================== M.Sc. Life Tracker — Universität Paderborn ====================
// UI only. Semester dates, week generation and the backup format live in calendar.js.

(function () {
  'use strict';

  const {
    parseDate, toISODate, isISODate, formatDate, formatDateShort,
    buildPeriods, applyOverrides, generateWeeks, makeBackup, parseBackup, DEFAULT_START,
  } = Calendar;

  // ---- Constants ----
  const STORAGE_KEYS = {
    startDate: 'upblt-start-date',
    semesters: 'upblt-semesters',
    scores: 'upblt-scores', // { 'YYYY-MM-DD' (Monday of week): 1..5 }
    notes: 'upblt-notes', // { 'YYYY-MM-DD' (Monday of week): 'text' }
    overrides: 'upblt-overrides',
    theme: 'upblt-theme',
    helpSeen: 'upblt-help-seen',
  };

  const DEFAULT_SEMESTERS = '4';
  const SCORE_LABELS = ['', 'Rough', 'Low', 'Okay', 'Good', 'Great'];
  const TOOLTIP_NOTE_CHARS = 90;

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
  const nudgeBar = $('nudgeBar');
  const nudgeBtn = $('nudgeBtn');
  const todayDisplay = $('todayDisplay');
  const calendarGrid = $('calendarGrid');
  const footer = $('footer');
  const modalOverlay = $('modalOverlay');
  const modalTitle = $('modalTitle');
  const modalSubtitle = $('modalSubtitle');
  const modalClose = $('modalClose');
  const weekNote = $('weekNote');
  const clearScoreBtn = $('clearScore');
  const cancelModalBtn = $('cancelModal');
  const helpOverlay = $('helpOverlay');
  const helpBtn = $('helpBtn');
  const tooltip = $('tooltip');

  // ---- State ----
  let allWeeks = [];
  let scores = {};
  let notes = {};
  let overrides = {};
  let currentModalWeek = null;
  let catchingUp = false; // scoring unscored weeks one after another via "Catch up"

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

  // ---- Catch-up Nudge ----
  function unscoredPastWeeks() {
    const now = today();
    return allWeeks.filter((w) => w.end < now && !scores[w.id]);
  }

  function updateNudge() {
    const count = unscoredPastWeeks().length;
    nudgeBar.style.display = count ? 'flex' : 'none';
    $('nudgeText').textContent = `${count} past week${count === 1 ? '' : 's'} not scored yet`;
  }

  // Newest first: the most recent weeks are the easiest to remember
  function openNextUnscored() {
    const pending = unscoredPastWeeks();
    catchingUp = pending.length > 0;
    if (catchingUp) openScoreModal(pending[pending.length - 1]);
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
          if (notes[week.id]) sq.classList.add('has-note');

          const text = tooltipText(week, isCurrent, isPast, score);
          sq.setAttribute('aria-label', text.replace(/\n/g, ', '));

          // Past weeks are scoreable by mouse, touch and keyboard
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
            sq.addEventListener('focus', () => showTooltipBy(sq, text));
            sq.addEventListener('blur', () => {
              if (tooltipOwner === sq) hideTooltip();
            });
          } else {
            // Touch has no hover: a tap on a current/future week shows its info
            sq.addEventListener('pointerup', (e) => {
              if (e.pointerType !== 'mouse') showTooltipBy(sq, text);
            });
          }

          // Hover tooltip for mouse only (pointer events keep touch taps from triggering it)
          sq.addEventListener('pointerenter', (e) => {
            if (e.pointerType === 'mouse') showTooltipAt(e.clientX, e.clientY, text);
          });
          sq.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'mouse') moveTooltip(e.clientX, e.clientY);
          });
          sq.addEventListener('pointerleave', (e) => {
            if (e.pointerType === 'mouse') hideTooltip();
          });

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
      text += '\nClick or tap to score';
    }

    const note = notes[week.id];
    if (note) {
      text += `\n“${note.length > TOOLTIP_NOTE_CHARS ? note.slice(0, TOOLTIP_NOTE_CHARS) + '…' : note}”`;
    }
    return text;
  }

  let tooltipOwner = null; // square the tooltip is anchored to (touch/keyboard), null for mouse hover

  function showTooltip(text) {
    tooltip.textContent = text;
    tooltip.style.whiteSpace = 'pre-line';
    tooltip.classList.add('visible');
  }

  // Next to the mouse cursor
  function showTooltipAt(x, y, text) {
    tooltipOwner = null;
    showTooltip(text);
    moveTooltip(x, y);
  }

  function moveTooltip(x, y) {
    // Flip to the left of the cursor near the right edge so it never leaves the viewport
    const flip = x + 12 + tooltip.offsetWidth > window.innerWidth;
    tooltip.style.left = Math.max(8, flip ? x - 12 - tooltip.offsetWidth : x + 12) + 'px';
    tooltip.style.top = (y - 10) + 'px';
  }

  // Above an element (below it if there is no room), for touch and keyboard focus
  function showTooltipBy(el, text) {
    tooltipOwner = el;
    showTooltip(text);
    placeTooltipBy(el);
  }

  function placeTooltipBy(el) {
    const r = el.getBoundingClientRect();
    const w = tooltip.offsetWidth;
    const h = tooltip.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const top = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8;
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
    tooltipOwner = null;
  }

  // A tooltip opened by a tap stays until the next tap elsewhere or a scroll.
  // A keyboard-focused square keeps its tooltip and it follows the square when focus scrolls the page.
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.week-square')) hideTooltip();
  });
  window.addEventListener('scroll', () => {
    if (tooltipOwner && tooltipOwner === document.activeElement) placeTooltipBy(tooltipOwner);
    else hideTooltip();
  }, { passive: true });

  // ---- Score Modal ----
  function openScoreModal(week) {
    currentModalWeek = week;
    modalTitle.textContent = `${week.semesterLabel} — ${week.periodLabel}`;
    const left = catchingUp ? unscoredPastWeeks().length : 0;
    modalSubtitle.textContent = `Week ${week.periodWeek} · ${weekRange(week)}` +
      (left > 1 ? ` · ${left} to catch up` : '');

    const existing = scores[week.id];
    weekNote.value = notes[week.id] || '';
    clearScoreBtn.style.display = existing || notes[week.id] ? 'inline-block' : 'none';

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
    hideTooltip();
  }

  function cancelModal() {
    catchingUp = false;
    closeModal();
  }

  function refresh() {
    renderCalendar();
    updateStats();
    updateNudge();
  }

  function setScore(score) {
    if (!currentModalWeek) return;
    const id = currentModalWeek.id;
    scores[id] = score;
    const note = weekNote.value.trim();
    if (note) notes[id] = note;
    else delete notes[id];
    saveEntries();
    refresh();
    closeModal();
    if (catchingUp) openNextUnscored();
  }

  function clearScore() {
    if (!currentModalWeek) return;
    delete scores[currentModalWeek.id];
    delete notes[currentModalWeek.id];
    saveEntries();
    refresh();
    catchingUp = false;
    closeModal();
  }

  // ---- Help Modal ----
  let helpOpener = null;

  function openHelp(opener) {
    helpOpener = opener || null;
    hideTooltip();
    helpOverlay.classList.add('active');
    helpOverlay.querySelector('.help-modal').scrollTop = 0; // start reading at the top
    $('helpDone').focus({ preventScroll: true });
    localStorage.setItem(STORAGE_KEYS.helpSeen, '1');
  }

  function closeHelp() {
    if (!helpOverlay.classList.contains('active')) return;
    helpOverlay.classList.remove('active');
    if (helpOpener) helpOpener.focus();
  }

  // ---- LocalStorage ----
  function saveEntries() {
    localStorage.setItem(STORAGE_KEYS.scores, JSON.stringify(scores));
    localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
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

  // ---- Backup (Export / Import) ----
  function exportBackup() {
    const data = makeBackup({ ...loadConfig(), scores, notes, overrides }, new Date());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `msc-life-tracker-${toISODate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importBackup(text) {
    let data;
    try {
      data = parseBackup(text);
    } catch (e) {
      alert(`Could not import this file: ${e.message}.`);
      return;
    }

    const hasData = Object.keys(scores).length || Object.keys(notes).length ||
      Object.keys(overrides).length || loadConfig().startDate;
    const incoming = Object.keys(data.scores).length;
    if (hasData && !confirm(`Replace your current data with this backup (${incoming} scored week${incoming === 1 ? '' : 's'})? ` +
      'Your current scores, notes, start date and custom dates will be overwritten.')) return;

    // All-or-nothing: if storage fails midway (e.g. quota), put every key back as it was
    const keys = [STORAGE_KEYS.scores, STORAGE_KEYS.notes, STORAGE_KEYS.overrides, STORAGE_KEYS.startDate, STORAGE_KEYS.semesters];
    const before = keys.map((k) => localStorage.getItem(k));
    try {
      localStorage.setItem(STORAGE_KEYS.scores, JSON.stringify(data.scores));
      localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(data.notes));
      localStorage.setItem(STORAGE_KEYS.overrides, JSON.stringify(data.overrides));
      if (data.startDate) saveConfig(data.startDate, data.semesters);
    } catch (e) {
      keys.forEach((k, i) => (before[i] == null ? localStorage.removeItem(k) : localStorage.setItem(k, before[i])));
      alert(`Could not import this file: your browser refused to store it (${e.name}). Nothing was changed.`);
      return;
    }

    scores = data.scores;
    notes = data.notes;
    overrides = data.overrides;
    const config = loadConfig();
    if (config.startDate) {
      startDateInput.value = config.startDate;
      programTypeSelect.value = config.semesters;
    }
    rebuildFromConfig();
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
      if (isISODate(inp.value) && inp.value !== defaults[inp.dataset.key]) next[inp.dataset.key] = inp.value;
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

  $('exportBtn').addEventListener('click', exportBackup);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-importing the same file
    if (file) file.text().then(importBackup, (err) => alert(`Could not read this file (${err.name}).`));
  });

  nudgeBtn.addEventListener('click', openNextUnscored);

  // Ignore the 2nd click of a double-click/tap so catch-up doesn't score the next week by accident
  document.querySelectorAll('.score-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (e.detail > 1) return;
      setScore(+btn.dataset.score);
    });
  });

  clearScoreBtn.addEventListener('click', clearScore);
  cancelModalBtn.addEventListener('click', cancelModal);
  modalClose.addEventListener('click', cancelModal);
  onBackdropClick(modalOverlay, cancelModal);

  // Close on a click that both starts and ends on the backdrop, so a text selection
  // dragged out of the note field doesn't discard the note
  function onBackdropClick(overlay, close) {
    let pressedBackdrop = false;
    overlay.addEventListener('pointerdown', (e) => {
      pressedBackdrop = e.target === overlay;
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && pressedBackdrop) close();
    });
  }

  helpBtn.addEventListener('click', () => openHelp(helpBtn));
  $('helpDone').addEventListener('click', closeHelp);
  $('helpClose').addEventListener('click', closeHelp);
  onBackdropClick(helpOverlay, closeHelp);

  document.addEventListener('keydown', (e) => {
    // A held key must not score week after week during catch-up
    if (e.repeat && modalOverlay.classList.contains('active')) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      cancelModal();
      closeHelp();
    }
    // 1–5 scores the open week, except while typing a note or using shortcuts like Cmd+1
    const typing = e.target === weekNote;
    if (modalOverlay.classList.contains('active') && !typing && !e.metaKey && !e.ctrlKey && !e.altKey &&
      e.key >= '1' && e.key <= '5' && e.key.length === 1) {
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
    notes = loadJSON(STORAGE_KEYS.notes);
    overrides = loadJSON(STORAGE_KEYS.overrides);
    const config = loadConfig();

    programTypeSelect.value = config.semesters;
    startDateInput.value = config.startDate || DEFAULT_START;
    if (config.startDate) buildCalendar(config.startDate, config.semesters);
    if (!localStorage.getItem(STORAGE_KEYS.helpSeen)) openHelp();
  }

  init();
})();
