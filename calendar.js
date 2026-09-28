// ==================== Universität Paderborn academic calendar ====================
// Pure date logic, no DOM: used by script.js in the browser and by check.js in Node.

const Calendar = (function () {
  'use strict';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Campus Orientation week, WS 2026/27: 5–9 Oct 2026
  const DEFAULT_START = '2026-10-05';

  // Lecture periods (Vorlesungszeit) are set for all NRW universities by the MKW NRW:
  //   https://www.mkw.nrw/hochschule-und-forschung/studium-und-lehre/vorlesungszeiten
  // The Christmas break (Vorlesungsfreie Zeit Weihnachten) is set by Uni Paderborn and is
  // only published one winter ahead:
  //   https://www.uni-paderborn.de/zv/3-3/studienorganisation/termine
  // Checked 2026-09-28.
  const OFFICIAL_TERMS = {
    'WS 2026': { lectures: ['2026-10-12', '2027-02-05'], christmas: ['2026-12-23', '2027-01-06'] },
    'SS 2027': { lectures: ['2027-04-05', '2027-07-16'] },
    'WS 2027': { lectures: ['2027-10-11', '2028-02-04'] },
    'SS 2028': { lectures: ['2028-04-17', '2028-07-28'] },
    'WS 2028': { lectures: ['2028-10-09', '2029-02-02'] },
    'SS 2029': { lectures: ['2029-04-09', '2029-07-20'] },
    'WS 2029': { lectures: ['2029-10-08', '2030-02-01'] },
    'SS 2030': { lectures: ['2030-04-01', '2030-07-12'] },
  };

  // ---- Date Utilities ----
  function mondayOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function addWeeks(date, n) {
    return addDays(date, n * 7);
  }

  function firstMondayOnOrAfter(date) {
    return addDays(date, (8 - date.getDay()) % 7);
  }

  function formatDate(date) {
    return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }

  function formatDateShort(date) {
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  }

  function toISODate(date) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${m}-${d}`;
  }

  function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // ---- Terms ----
  // WS <year> runs 1 Oct <year> – 31 Mar <year+1>; SS <year> runs 1 Apr – 30 Sep.
  function termForDate(date) {
    const m = date.getMonth();
    const y = date.getFullYear();
    if (m >= 3 && m <= 8) return { kind: 'SS', year: y };
    return { kind: 'WS', year: m >= 9 ? y : y - 1 };
  }

  function nextTerm(term) {
    return term.kind === 'WS' ? { kind: 'SS', year: term.year + 1 } : { kind: 'WS', year: term.year };
  }

  // For terms outside OFFICIAL_TERMS. The WS rule reproduces every MKW winter term 2017/18–2029/30:
  // first Monday on/after 7 Oct, ending on the Friday 16 weeks later.
  // ponytail: the SS rule ignores Easter (MKW shifts summer starts around it), so it can be ~1 week off; adjust via overrides.
  function estimateLectures(term) {
    const start = firstMondayOnOrAfter(new Date(term.year, term.kind === 'WS' ? 9 : 3, 7));
    return [start, addDays(addWeeks(start, term.kind === 'WS' ? 16 : 14), 4)];
  }

  function termInfo(term) {
    const known = OFFICIAL_TERMS[`${term.kind} ${term.year}`];
    const [lectureStart, lectureEnd] = known ? known.lectures.map(parseDate) : estimateLectures(term);
    const info = {
      name: term.kind === 'WS'
        ? `Winter Semester ${term.year}/${String(term.year + 1).slice(2)}`
        : `Summer Semester ${term.year}`,
      lectureStart,
      lectureEnd,
      lecturesEstimated: !known,
      end: term.kind === 'WS' ? new Date(term.year + 1, 2, 31) : new Date(term.year, 8, 30),
      christmas: null,
      christmasEstimated: false,
    };
    if (term.kind === 'WS') {
      // Paderborn's usual break when not yet published: 23 Dec – 6 Jan
      info.christmas = known && known.christmas
        ? known.christmas.map(parseDate)
        : [new Date(term.year, 11, 23), new Date(term.year + 1, 0, 6)];
      info.christmasEstimated = !(known && known.christmas);
    }
    return info;
  }

  // ---- Periods ----
  // Each semester: [orientation] → lectures → [Christmas → lectures] → lecture-free period (exams).
  // The lecture-free period runs until the next semester's lectures start, or the official
  // semester end for the final semester.
  function buildPeriods(startDate, numSemesters) {
    const periods = [];
    let term = termForDate(startDate);
    // Arriving after this term's lectures ended (Sep pre-course, Feb/Mar for a summer intake):
    // semester 1 is the upcoming term, with the time until its lectures as orientation
    if (startDate > termInfo(term).lectureEnd) term = nextTerm(term);

    for (let s = 1; s <= numSemesters; s++) {
      const t = termInfo(term);
      const semesterLabel = `Semester ${s} · ${t.name}`;
      const est = (flag) => (flag ? ' (est.)' : '');

      const add = (key, type, label, isBreak, start, end) => {
        // First semester: skip whatever already passed before a late arrival
        if (s === 1 && start < startDate) start = startDate;
        if (start > end) return;
        periods.push({
          key: `s${s}_${key}`, semester: s, semesterLabel, type, label, isBreak,
          start: new Date(start), end: new Date(end),
        });
      };

      if (s === 1 && startDate < t.lectureStart) {
        add('orientation', 'orientation', 'Arrival & Orientation', false, startDate, addDays(t.lectureStart, -1));
      }

      const lecturesLabel = 'Lecture Period' + est(t.lecturesEstimated);
      if (t.christmas) {
        add('lectures', 'lectures', lecturesLabel, false, t.lectureStart, addDays(t.christmas[0], -1));
        add('christmas', 'christmas', 'Christmas Break' + est(t.christmasEstimated), true, t.christmas[0], t.christmas[1]);
        add('lectures2', 'lectures', lecturesLabel + ' (cont.)', false, addDays(t.christmas[1], 1), t.lectureEnd);
      } else {
        add('lectures', 'lectures', lecturesLabel, false, t.lectureStart, t.lectureEnd);
      }

      const next = nextTerm(term);
      const freeEnd = s < numSemesters ? addDays(termInfo(next).lectureStart, -1) : t.end;
      add('lectureFree', 'lectureFree', 'Lecture-free Period · Exams', true, addDays(t.lectureEnd, 1), freeEnd);

      term = next;
    }

    return periods;
  }

  function applyOverrides(periods, overrides) {
    return periods.map((p) => {
      const oStart = overrides[`${p.key}_start`];
      const oEnd = overrides[`${p.key}_end`];
      return {
        ...p,
        start: oStart ? parseDate(oStart) : p.start,
        end: oEnd ? parseDate(oEnd) : p.end,
      };
    });
  }

  // ---- Weeks ----
  // A Monday–Sunday week belongs to the period containing its Thursday (ISO 8601 convention),
  // so periods that start or end mid-week (Christmas on a Wednesday) never share a week.
  // Week numbers count per semester and type, so lecture weeks continue after Christmas.
  function generateWeeks(periods) {
    const weeks = [];
    const counters = {};

    periods.forEach((period) => {
      let weekStart = mondayOfWeek(addDays(period.start, 3));
      const last = weeks[weeks.length - 1];
      if (last && weekStart <= last.start) weekStart = addWeeks(last.start, 1); // overlapping overrides
      const counterKey = `${period.semester}_${period.type}`;

      while (addDays(weekStart, 3) <= period.end) {
        counters[counterKey] = (counters[counterKey] || 0) + 1;
        weeks.push({
          id: toISODate(weekStart),
          globalIndex: weeks.length,
          periodWeek: counters[counterKey],
          periodKey: period.key,
          periodLabel: period.label,
          periodStart: period.start,
          periodEnd: period.end,
          periodType: period.type,
          isBreak: period.isBreak,
          semester: period.semester,
          semesterLabel: period.semesterLabel,
          start: new Date(weekStart),
          end: addDays(weekStart, 6),
        });
        weekStart = addWeeks(weekStart, 1);
      }
    });

    return weeks;
  }

  return {
    DEFAULT_START,
    parseDate, toISODate, formatDate, formatDateShort,
    termForDate, termInfo, buildPeriods, applyOverrides, generateWeeks,
  };
})();
