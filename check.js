// Self-check for calendar.js — run: node check.js
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');

const C = vm.runInNewContext(fs.readFileSync(__dirname + '/calendar.js', 'utf8') + ';Calendar');
const iso = C.toISODate;
const build = (start, n) => C.buildPeriods(C.parseDate(start), n);
const span = (p) => `${iso(p.start)}..${iso(p.end)}`;
const byKey = (periods) => Object.fromEntries(periods.map((p) => [p.key, span(p)]));

// Ashmit: WS 2026/27 start at orientation week, standard 4 semesters
const periods = build(C.DEFAULT_START, 4);
const k = byKey(periods);
assert.equal(k.s1_orientation, '2026-10-05..2026-10-11');
assert.equal(k.s1_lectures, '2026-10-12..2026-12-22');
assert.equal(k.s1_christmas, '2026-12-23..2027-01-06');
assert.equal(k.s1_lectures2, '2027-01-07..2027-02-05');
assert.equal(k.s1_lectureFree, '2027-02-06..2027-04-04');
assert.equal(k.s2_lectures, '2027-04-05..2027-07-16');
assert.equal(k.s3_lectures, '2027-10-11..2027-12-22');
assert.equal(k.s4_lectures, '2028-04-17..2028-07-28');
assert.equal(k.s4_lectureFree, '2028-07-29..2028-09-30');
assert.match(periods.find((p) => p.key === 's3_christmas').label, /\(est\.\)/);
assert.doesNotMatch(periods.find((p) => p.key === 's1_christmas').label, /\(est\.\)/);

const weeks = C.generateWeeks(periods);
// Contiguous Monday-based weeks, no duplicates, from orientation to end of SS 2028
assert.equal(weeks[0].id, '2026-10-05');
assert.equal(iso(weeks[weeks.length - 1].end), '2028-10-01');
weeks.forEach((w, i) => {
  assert.equal(w.start.getDay(), 1);
  if (i) assert.equal(Math.round((w.start - weeks[i - 1].start) / 864e5), 7);
});
const count = (sem, type) => weeks.filter((w) => w.semester === sem && w.periodType === type).length;
assert.equal(count(1, 'lectures'), 15); // 10 before + 5 after Christmas
assert.equal(count(1, 'christmas'), 2);
assert.equal(count(2, 'lectures'), 15);
// Lecture weeks keep counting after Christmas
assert.equal(weeks.find((w) => w.id === '2027-01-04').periodWeek, 11);
assert.equal(weeks.find((w) => w.id === '2026-12-21').periodType, 'christmas');

// Late arrival (visa delays): first semester starts at arrival, nothing before it
const late = byKey(build('2026-10-26', 4));
assert.equal(late.s1_orientation, undefined);
assert.equal(late.s1_lectures, '2026-10-26..2026-12-22');

// Summer intake; arrival after a term's lectures ended starts with the upcoming term
assert.equal(byKey(build('2027-04-05', 4)).s1_lectures, '2027-04-05..2027-07-16');
for (const [start, lecturesFrom, planEnd] of [
  ['2026-08-20', '2026-10-12', '2028-09-30'],
  ['2026-09-20', '2026-10-12', '2028-09-30'],
  ['2027-02-20', '2027-04-05', '2029-03-31'],
  ['2027-03-20', '2027-04-05', '2029-03-31'],
]) {
  const p = build(start, 4);
  assert.equal(span(p[0]).split('..')[0], start);
  assert.equal(p[0].key, 's1_orientation');
  assert.equal(iso(p.find((x) => x.key === 's1_lectures').start), lecturesFrom);
  assert.equal(iso(p[p.length - 1].end), planEnd);
}
// Arrival after Christmas: semester 1 resumes with the second lecture block
assert.equal(build('2027-01-10', 4)[0].key, 's1_lectures2');

// Estimated WS rule beyond the MKW table matches its derivation
const ws30 = C.termInfo({ kind: 'WS', year: 2030 });
assert.equal(`${iso(ws30.lectureStart)}..${iso(ws30.lectureEnd)}`, '2030-10-07..2031-01-31');
const ws31 = C.termInfo({ kind: 'WS', year: 2031 });
assert.equal(`${iso(ws31.lectureStart)}..${iso(ws31.lectureEnd)}`, '2031-10-13..2032-02-06');

// Overlapping overrides never duplicate a week (scores are keyed by week)
const overlapped = C.applyOverrides(periods, { s1_christmas_start: '2026-12-01' });
const ids = C.generateWeeks(overlapped).map((w) => w.id);
assert.equal(new Set(ids).size, ids.length);

console.log(`ok — ${weeks.length} weeks, ${periods.length} periods`);
