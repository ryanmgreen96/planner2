import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
// import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCQxR90Ldzn9xRi6kGjY3-PDQnijcP8M74",
  authDomain: "planner-14b1f.firebaseapp.com",
  projectId: "planner-14b1f",
  storageBucket: "planner-14b1f.appspot.com",
  messagingSenderId: "1051139154745",
  appId: "1:1051139154745:web:daef4eddfe0ded9c0cbee8"
};

const app = initializeApp(firebaseConfig);
// const db = getFirestore(app);


const calendarEl = document.getElementById('work-calendar');
const paySummaryEl = document.getElementById('pay-summary');
const monthLabel = document.getElementById('month-label');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');

// Store shifts in-memory for now (dateStr: { shift: '6-11', hours: 5 })
let shifts = {};

// Persist/load shifts to localStorage so data survives refreshes
function saveShiftsToStorage() {
  try { localStorage.setItem('planner_shifts', JSON.stringify(shifts)); } catch (e) { console.warn('Failed to save shifts', e); }
}
try {
  const saved = localStorage.getItem('planner_shifts');
  if (saved) shifts = JSON.parse(saved);
} catch (e) {
  console.warn('Failed to load shifts', e);
}

// If localStorage is empty, try loading shifts from a repo file (shifts.json)
async function loadShiftsFromRepoIfEmpty() {
  if (Object.keys(shifts).length > 0) return;
  try {
    const res = await fetch('shifts.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        shifts = data;
        saveShiftsToStorage();
      }
    }
  } catch (e) {
    console.warn('No shifts.json available or failed to load', e);
  }
}

// Sanitize stored holiday markers: keep only the explicit manual holiday list,
// and remove Boxing Day and any unexpected family-day markers.
(function sanitizeStoredHolidays() {
  try {
    const manual = {
      '2025-12-25': 'Christmas Day',
      '2026-01-01': "New Year’s Day",
      '2026-02-09': 'Family Day',
      '2026-04-03': 'Good Friday',
      '2026-05-18': 'Victoria Day',
      '2026-07-01': 'Canada Day',
      '2026-08-03': 'B.C. Day',
      '2026-09-07': 'Labour Day',
      '2026-09-30': 'National Day for Truth and Reconciliation',
      '2026-10-12': 'Thanksgiving Day',
      '2026-11-11': 'Remembrance Day',
      '2026-12-25': 'Christmas Day'
    };
    let changed = false;
    Object.keys(shifts).forEach(k => {
      if (shifts[k] && shifts[k].holiday) {
        if (!manual[k]) {
          delete shifts[k];
          changed = true;
        }
      }
    });
    // Explicitly remove Boxing Day 2025 and stray family-day dates
    ['2025-12-26','2026-02-16','2026-02-17'].forEach(d => {
      if (shifts[d]) { delete shifts[d]; changed = true; }
    });
    if (changed) saveShiftsToStorage();
  } catch (e) {
    console.warn('sanitizeStoredHolidays failed', e);
  }
})();

// If no saved shifts, add unobtrusive sample shifts for visibility (Mon/Wed)
function addSampleShiftsForPeriod(periodStart) {
  if (Object.keys(shifts).length > 0) return;
  const start = new Date(periodStart);
  for (let i = 0; i < 14; i++) {
    let d = new Date(start);
    d.setDate(d.getDate() + i);
    // Monday (1) or Wednesday (3)
    if (d.getDay() === 1 || d.getDay() === 3) {
      const key = d.toISOString().slice(0, 10);
      shifts[key] = { shift: '6-14', hours: 8 };
    }
  }
  saveShiftsToStorage();
}

function holidaysForYear(year) {
  const h = {};
  // New Year's Day
  h[ new Date(year,0,1).toISOString().slice(0,10) ] = "New Year's Day";
  // Family Day (3rd Monday Feb)
  h[ thirdMondayInMonth(year,1).toISOString().slice(0,10) ] = 'Family Day';
  // Good Friday (easter - 2)
  const easter = easterDate(year);
  const gf = new Date(easter); gf.setDate(gf.getDate() - 2);
  h[ gf.toISOString().slice(0,10) ] = 'Good Friday';
  // Victoria Day (Monday preceding May 25)
  h[ mondayBeforeMay25(year).toISOString().slice(0,10) ] = 'Victoria Day';
  // Canada Day (Jul 1)
  h[ new Date(year,6,1).toISOString().slice(0,10) ] = 'Canada Day';
  // BC Day (first Monday in August)
  h[ firstMondayInMonth(year,7).toISOString().slice(0,10) ] = 'BC Day';
  // Labour Day (first Monday Sept)
  h[ firstMondayInMonth(year,8).toISOString().slice(0,10) ] = 'Labour Day';
  // Thanksgiving (2nd Monday Oct)
  h[ nthWeekdayOfMonth(year,9,1,2).toISOString().slice(0,10) ] = 'Thanksgiving';
  // Remembrance Day
  h[ new Date(year,10,11).toISOString().slice(0,10) ] = 'Remembrance Day';
  // National Day for Truth and Reconciliation (Sept 30)
  h[ new Date(year,8,30).toISOString().slice(0,10) ] = 'Truth & Reconciliation Day';
  // Christmas Day
  h[ new Date(year,11,25).toISOString().slice(0,10) ] = 'Christmas Day';
  // Boxing Day intentionally omitted
  return h;
}

function addHolidaysToShifts(periods) {
  // Only apply the explicit manual holiday list for the visible range,
  // and remove any previously-added holiday markers that are not in that list.
  const manual = manualHolidays();
  const viewStart = new Date(periods[0].start);
  const viewEnd = new Date(periods[1].end);
  const cur = new Date(viewStart);
  while (cur <= viewEnd) {
    const key = cur.toISOString().slice(0,10);
    if (manual[key]) {
      // set/override holiday entry
      shifts[key] = { shift: manual[key], hours: 5, holiday: true };
    } else {
      // if there is an earlier holiday marker, remove it
      if (shifts[key] && shifts[key].holiday) delete shifts[key];
    }
    cur.setDate(cur.getDate() + 1);
  }
  saveShiftsToStorage();
}

// Merge in manual holiday dates requested explicitly (e.g., specific 2026 dates and Dec 25 2025)
function manualHolidays() {
  return {
    '2025-12-25': 'Christmas Day',
    '2026-01-01': "New Year’s Day",
    '2026-02-09': 'Family Day',
    '2026-04-03': 'Good Friday',
    '2026-05-18': 'Victoria Day',
    '2026-07-01': 'Canada Day',
    '2026-08-03': 'B.C. Day',
    '2026-09-07': 'Labour Day',
    '2026-09-30': 'National Day for Truth and Reconciliation',
    '2026-10-12': 'Thanksgiving Day',
    '2026-11-11': 'Remembrance Day',
    '2026-12-25': 'Christmas Day'
  };
}

const RATE = 16.9;
// Pay period navigation: each page is 4 weeks (2 pay periods)
const KNOWN_START = new Date(2024, 11, 22); // Dec 22, 2024 (Sunday)
// Known payday base (Thursday). Payday recurs every 14 days. Use Jan 8, 2026 as reference.
const KNOWN_PAYDAY = new Date(2026, 0, 8);

// Find the two most recent paydays <= a reference date
function twoMostRecentPaydaysBefore(refDate) {
  let p = new Date(KNOWN_PAYDAY);
  // move p forward in 14-day steps until the next payday would be after refDate
  while (true) {
    let next = new Date(p);
    next.setDate(next.getDate() + 14);
    if (next <= refDate) p = next; else break;
  }
  const latest = new Date(p);
  const prev = new Date(p); prev.setDate(prev.getDate() - 14);
  return [prev, latest];
}

// Find period start for the work period that gets paid on a given payday
// Payday is Thursday; period ends on the prior Saturday (payday - 5 days)
// Period is 14 days, so starts 13 days before the end
function getPeriodStartForPayday(paydayDate) {
  const periodEnd = new Date(paydayDate);
  periodEnd.setDate(periodEnd.getDate() - 5); // Saturday before Thursday payday
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - 13); // 14-day period (day 0-13)
  return periodStart;
}

// Set initial view to the 4-week span starting with the period paid on the earlier recent payday
function findPeriodStartCoveringRecentPaydays(refDate) {
  const [earlierPayday, laterPayday] = twoMostRecentPaydaysBefore(refDate);
  // Return the start of the period that gets paid on the earlier payday
  return getPeriodStartForPayday(earlierPayday);
}

// Set initial view to the 4-week span containing the two most recent work periods
let currentPeriodStart = findPeriodStartCoveringRecentPaydays(new Date());

// Determine if the previous month (relative to a 4-week view starting at periodStart)
// has three paydays. Used for rendering and navigation skips.
function prevMonthHasTriple(periodStart) {
  // Determine if the month of the current 4-week view's last day has three paydays
  const periods = getTwoPayPeriods(periodStart);
  const lastDay = new Date(periods[1].end);
  const mIdx = d => d.getFullYear()*12 + d.getMonth();
  const focusedMonthIndex = mIdx(new Date(lastDay.getFullYear(), lastDay.getMonth(), 1));
  const focusedStart = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
  const focusedEnd = new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, 0);
  const rangeStart = new Date(focusedStart); rangeStart.setDate(rangeStart.getDate() - 21);
  const rangeEnd = new Date(focusedEnd); rangeEnd.setDate(rangeEnd.getDate() + 21);
  let p = new Date(KNOWN_PAYDAY);
  while (p > rangeStart) p.setDate(p.getDate() - 14);
  let count = 0;
  while (p <= rangeEnd) {
    if (p >= rangeStart && p <= rangeEnd) {
      const idx = mIdx(new Date(p.getFullYear(), p.getMonth(), 1));
      if (idx === focusedMonthIndex) count++;
    }
    p.setDate(p.getDate() + 14);
  }
  return count === 3;
}

// Get the three period starts for the triple month associated with this view (if any)
function getTriplePeriodStarts(periodStart) {
  // Get the three period starts for the month of the current view's last day (if it has 3 paydays)
  const periods = getTwoPayPeriods(periodStart);
  const lastDay = new Date(periods[1].end);
  const mIdx = d => d.getFullYear()*12 + d.getMonth();
  const focusedMonthIndex = mIdx(new Date(lastDay.getFullYear(), lastDay.getMonth(), 1));
  const focusedStart = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
  const focusedEnd = new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, 0);
  const rangeStart = new Date(focusedStart); rangeStart.setDate(rangeStart.getDate() - 21);
  const rangeEnd = new Date(focusedEnd); rangeEnd.setDate(rangeEnd.getDate() + 21);
  let p = new Date(KNOWN_PAYDAY);
  while (p > rangeStart) p.setDate(p.getDate() - 14);
  const paydays = [];
  while (p <= rangeEnd) {
    if (p >= rangeStart && p <= rangeEnd) {
      const idx = mIdx(new Date(p.getFullYear(), p.getMonth(), 1));
      if (idx === focusedMonthIndex) paydays.push(new Date(p));
    }
    p.setDate(p.getDate() + 14);
  }
  if (paydays.length !== 3) return [];
  return paydays
    .map(pd => getPeriodStartForPayday(pd))
    .sort((a,b)=>a-b);
}

// Round pay according to user's rule: cents < 0.70 -> round down, otherwise round up
function roundPay(amount) {
  if (isNaN(amount)) return 0;
  const dollars = Math.floor(amount);
  const cents = amount - dollars;
  return (cents < 0.70) ? dollars : dollars + 1;
}

function getPeriodStartForDate(date) {
  // Find the pay period start (Sunday) before or on the given date
  let start = new Date(KNOWN_START);
  while (start <= date) {
    let next = new Date(start);
    next.setDate(next.getDate() + 14);
    if (next > date) break;
    start = next;
  }
  return start;
}

function getTwoPayPeriods(startDate) {
  // Returns [{start, end}, {start, end}] for 4 weeks (2 pay periods)
  let periods = [];
  let start = new Date(startDate);
  for (let i = 0; i < 2; i++) {
    let periodStart = new Date(start);
    let periodEnd = new Date(start);
    periodEnd.setDate(periodEnd.getDate() + 13);
    periods.push({ start: new Date(periodStart), end: new Date(periodEnd) });
    start.setDate(start.getDate() + 14);
  }
  return periods;
}

function renderCalendar(periodStart) {
  calendarEl.innerHTML = '';
  const periods = getTwoPayPeriods(periodStart);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // Special-case: if the focused month (month of lastDay) has three paydays (e.g., April), render three periods
  const mIdx = d => d.getFullYear()*12 + d.getMonth();
  const lastDay = new Date(periods[1].end);
  const focusedMonthIndex = mIdx(new Date(lastDay.getFullYear(), lastDay.getMonth(), 1));
  const focusedMonthStart = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
  const focusedMonthEnd = new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, 0);
  const rangeStart = new Date(focusedMonthStart); rangeStart.setDate(rangeStart.getDate() - 21);
  const rangeEnd = new Date(focusedMonthEnd); rangeEnd.setDate(rangeEnd.getDate() + 21);
  let scan = new Date(KNOWN_PAYDAY);
  while (scan > rangeStart) scan.setDate(scan.getDate() - 14);
  const focusedMonthPaydays = [];
  while (scan <= rangeEnd) {
    if (scan >= rangeStart && scan <= rangeEnd) {
      const idx = mIdx(new Date(scan.getFullYear(), scan.getMonth(), 1));
      if (idx === focusedMonthIndex) focusedMonthPaydays.push(new Date(scan));
    }
    scan.setDate(scan.getDate() + 14);
  }

  let renderPeriods = periods;
  if (focusedMonthPaydays.length === 3) {
    const starts = focusedMonthPaydays.map(pd => getPeriodStartForPayday(pd)).sort((a,b)=>a-b);
    const seen = new Set();
    const triple = [];
    starts.forEach(ps => {
      const key = ps.toISOString().slice(0,10);
      if (!seen.has(key)) { seen.add(key); const two = getTwoPayPeriods(ps); triple.push(two[0]); }
    });
    if (triple.length === 3) renderPeriods = triple;
  }

  // Add holidays into shifts for the actual displayed periods
  addHolidaysToShifts(renderPeriods);

  // Compute paydays and colors for this 4-week view
  const viewStart = new Date(renderPeriods[0].start);
  const viewEnd = new Date(renderPeriods[renderPeriods.length-1].end);
  const paydays = new Set();
  const paydayColor = {};
  function monthIndex(d) { return d.getFullYear()*12 + d.getMonth(); }
  const ref = new Date(KNOWN_PAYDAY);
  const refBudgetMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  let p = new Date(KNOWN_PAYDAY);
  while (p > viewStart) p.setDate(p.getDate() - 14);
  while (p <= viewEnd) {
    if (p >= viewStart && p <= viewEnd) {
      const ds = p.toISOString().slice(0,10);
      paydays.add(ds);
      const budget = new Date(p.getFullYear(), p.getMonth() + 1, 1);
      const diff = monthIndex(budget) - monthIndex(refBudgetMonth);
      paydayColor[ds] = (diff % 2 === 0) ? 'red' : 'blue';
    }
    p.setDate(p.getDate() + 14);
  }

  // Render calendar rows for each period
  let grid = document.createElement('div');
  grid.className = 'calendar-grid';
  let dayBoxes = [];
  renderPeriods.forEach((period, pIdx) => {
    for (let w = 0; w < 2; w++) {
      let weekRow = document.createElement('div');
      weekRow.className = 'week-row';
      for (let d = 0; d < 7; d++) {
        let day = new Date(period.start);
        day.setDate(day.getDate() + w * 7 + d);
        let box = document.createElement('div');
        box.className = 'day-box';
        box.dataset.date = day.toISOString().slice(0, 10);
        // Day number in top left, small
        let cls = '';
        if (paydays.has(box.dataset.date)) cls = ' payday ' + (paydayColor[box.dataset.date] || 'red');
        const dayNumHtml = `<div class="day-num${cls}">${day.getDate()}</div>`;
        const monthBadge = (day.getDate() === 1) ? `<div class="month-badge"><strong>${monthNames[day.getMonth()]}</strong></div>` : '';
        box.innerHTML = dayNumHtml + monthBadge;
        const s = shifts[box.dataset.date];
        if (s && s.holiday) {
          box.innerHTML += `<div class=\"holiday-name\">${s.shift}</div>`;
        } else if (s) {
          box.innerHTML += `<div class=\"shift-label\">${s.shift}</div>`;
        }
        box.addEventListener('click', () => openShiftModal(box.dataset.date));
        weekRow.appendChild(box);
        dayBoxes.push(box);
      }
      // compute this week's totals and add inline summary next to last box
      let weekHours = 0;
      for (let d = 0; d < 7; d++) {
        let day = new Date(period.start);
        day.setDate(day.getDate() + w * 7 + d);
        const key = day.toISOString().slice(0, 10);
        if (shifts[key]) weekHours += shifts[key].hours || 0;
      }
      const weekPayRaw = +(weekHours * RATE).toFixed(2);
      const weekPayRounded = roundPay(weekPayRaw);
      const inline = document.createElement('div');
      inline.className = 'week-inline-summary';
      inline.textContent = `${weekHours} / $${weekPayRounded}`;
      weekRow.appendChild(inline);
      grid.appendChild(weekRow);
      // Insert gap after each period when multiple are shown
      if (w === 1 && pIdx < renderPeriods.length - 1) {
        let gap = document.createElement('div');
        gap.className = 'period-gap';
        grid.appendChild(gap);
      }
    }
  });

  calendarEl.appendChild(grid);
  // Keep summary to the first two periods
  renderPaySummary([renderPeriods[0], renderPeriods[1]]);
}

function renderMonthLabel(periodStart) {
  // Title as "for {Month}" where Month is the budget month for the view.
  const periods = getTwoPayPeriods(periodStart);
  const lastDay = new Date(periods[1].end);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // If previous month has triple, label is the next month; else use next month of last day
  const labelDate = prevMonthHasTriple(periodStart)
    ? new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, 1)
    : new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, 1);
  monthLabel.textContent = `for ${monthNames[labelDate.getMonth()]} ${labelDate.getFullYear()}`;
}

prevMonthBtn.addEventListener('click', () => {
  // Go back by default 4 weeks; if heading into a triple month, land on the first of the trio
  const candidate = new Date(currentPeriodStart);
  candidate.setDate(candidate.getDate() - 28);
  // If the page at candidate is a triple month, align to its first start
  if (prevMonthHasTriple(candidate)) {
    const starts = getTriplePeriodStarts(candidate);
    if (starts.length === 3) currentPeriodStart = new Date(starts[0]); else currentPeriodStart = candidate;
  } else {
    // If the page after candidate is a triple month (redundant middle page), land directly on that trio
    const afterCandidate = new Date(candidate);
    afterCandidate.setDate(afterCandidate.getDate() + 28);
    if (prevMonthHasTriple(afterCandidate)) {
      const starts = getTriplePeriodStarts(afterCandidate);
      currentPeriodStart = (starts.length === 3) ? new Date(starts[0]) : candidate;
    } else {
      currentPeriodStart = candidate;
    }
  }
  renderMonthLabel(currentPeriodStart);
  renderCalendar(currentPeriodStart);
});
nextMonthBtn.addEventListener('click', () => {
  // Default: move forward 4 weeks; if current page is a triple, go to the immediate period after the trio
  if (prevMonthHasTriple(currentPeriodStart)) {
    const starts = getTriplePeriodStarts(currentPeriodStart);
    if (starts.length === 3) {
      // next view should start at lastStart + 14 days
      const nextStart = new Date(starts[2]);
      nextStart.setDate(nextStart.getDate() + 14);
      currentPeriodStart = nextStart;
    } else {
      const candidate = new Date(currentPeriodStart);
      candidate.setDate(candidate.getDate() + 28);
      currentPeriodStart = candidate;
    }
  } else {
    const candidate = new Date(currentPeriodStart);
    candidate.setDate(candidate.getDate() + 28);
    currentPeriodStart = candidate;
  }
  renderMonthLabel(currentPeriodStart);
  renderCalendar(currentPeriodStart);
});

function openShiftModal(dateStr) {
  const modal = document.getElementById('shift-modal');
  const input = document.getElementById('shift-input');
  modal.classList.remove('hidden');
  input.value = shifts[dateStr]?.shift || '';
  input.focus();
  input.select();
  input.dataset.date = dateStr;
}
document.getElementById('close-modal').onclick = () => {
  document.getElementById('shift-modal').classList.add('hidden');
};

function saveShiftInput() {
  const input = document.getElementById('shift-input');
  const val = input.value.trim();
  const date = input.dataset.date;
  let hours = 0;
  let shiftLabel = val;
  // Accept formats:
  // - single number or decimal or time (e.g. "11", "11.5", "11:15") -> treated as end (start defaults to 6)
  // - range: "7-12", "7-12.5", "6:30-14:15"
  function parseTimeToken(tok) {
    if (!tok) return null;
    tok = tok.trim();
    let m;
    // HH:MM
    m = tok.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (min >= 60) return null;
      return { value: h + min / 60, label: min ? `${h}:${String(min).padStart(2,'0')}` : `${h}` };
    }
    // decimal like 10.25 (fraction of hour)
    m = tok.match(/^(\d{1,2})\.(\d+)$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const frac = parseFloat('0.' + m[2]);
      const minutes = Math.round(frac * 60);
      return { value: h + frac, label: minutes ? `${h}:${String(minutes).padStart(2,'0')}` : `${h}` };
    }
    // integer hour
    m = tok.match(/^(\d{1,2})$/);
    if (m) {
      const h = parseInt(m[1], 10);
      return { value: h, label: `${h}` };
    }
    return null;
  }

  if (val.length > 0) {
    // range?
    const parts = val.split('-');
    if (parts.length === 2) {
      const a = parseTimeToken(parts[0]);
      const b = parseTimeToken(parts[1]);
      if (a && b) {
        let startVal = a.value;
        let endVal = b.value;
        // if end <= start, assume crossing noon/pm and add 12 hours
        if (endVal <= startVal) endVal += 12;
        if (endVal > startVal) hours = +(endVal - startVal).toFixed(2);
        shiftLabel = `${a.label}-${b.label}`;
      } else {
        // fallback: store raw text
        shiftLabel = val;
        hours = 0;
      }
    } else {
      // single token -> end time, start = 6
      const t = parseTimeToken(val);
      if (t) {
        let startVal = 6;
        let endVal = t.value;
        if (endVal <= startVal) endVal += 12;
        if (endVal > startVal) hours = +(endVal - startVal).toFixed(2);
        shiftLabel = `${startVal}-${t.label}`;
      } else {
        shiftLabel = val;
        hours = 0;
      }
    }
  }
  if (val.length > 0) {
    shifts[date] = { shift: shiftLabel, hours };
  } else {
    delete shifts[date];
  }
  saveShiftsToStorage();
  document.getElementById('shift-modal').classList.add('hidden');
  renderCalendar(currentPeriodStart);
}

document.getElementById('shift-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    saveShiftInput();
  }
});

// Clicking outside the modal content (on the overlay) should save and close the modal
const shiftModalEl = document.getElementById('shift-modal');
if (shiftModalEl) {
  shiftModalEl.addEventListener('click', function(e) {
    if (e.target === shiftModalEl) {
      // save current input and close
      saveShiftInput();
    }
  });
}

function renderPaySummary(periods) {
  // Calculate hours and pay for each period
  let p1 = { hours: 0, pay: 0 };
  let p2 = { hours: 0, pay: 0 };
  const rate = 16.9;
  // Period 1
  for (let i = 0; i < 14; i++) {
    let d = new Date(periods[0].start);
    d.setDate(d.getDate() + i);
    let key = d.toISOString().slice(0, 10);
    if (shifts[key]) p1.hours += shifts[key].hours;
  }
  // Period 2
  for (let i = 0; i < 14; i++) {
    let d = new Date(periods[1].start);
    d.setDate(d.getDate() + i);
    let key = d.toISOString().slice(0, 10);
    if (shifts[key]) p2.hours += shifts[key].hours;
  }
  p1.pay = +(p1.hours * rate).toFixed(2);
  p2.pay = +(p2.hours * rate).toFixed(2);
  // Apply user's rounding rule to displayed pay amounts
  const p1Rounded = roundPay(p1.pay);
  const p2Rounded = roundPay(p2.pay);
  const totalHours = p1.hours + p2.hours;
  const totalPayRounded = p1Rounded + p2Rounded;
  paySummaryEl.innerHTML = `
    <div>Pay Period 1: <b>${p1.hours}</b> hrs ($${p1Rounded})</div>
    <div>Pay Period 2: <b>${p2.hours}</b> hrs ($${p2Rounded})</div>
    <div>Total: <b>${totalHours}</b> hrs ($${totalPayRounded})</div>
  `;
}

// Initial render wrapped in async init to allow fetching shifts.json
async function init() {
  renderMonthLabel(currentPeriodStart);
  await loadShiftsFromRepoIfEmpty();
  if (Object.keys(shifts).length === 0) {
    addSampleShiftsForPeriod(currentPeriodStart);
  }
  renderCalendar(currentPeriodStart);
}

init();
