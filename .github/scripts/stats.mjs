// Builds streak.svg and activity.svg from the GitHub contribution calendar.
// Runs inside the "generate snake" workflow, so the cards never depend on outside services.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const USER = process.env.GH_USER;
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = process.env.OUT_DIR || "dist";
const C = { bg: "#1B1F3B", border: "#8E6BD8", lav: "#C8A2F0", crim: "#E0245E", ink: "#E8DEFF", dim: "#8A86B0", grid: "#2C2F55" };
const FONT = "font-family=\"'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif\"";

async function loadDays() {
  if (process.env.MOCK) return JSON.parse(readFileSync(process.env.MOCK, "utf8"));
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }));
}

const fmt = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function streaks(days) {
  let longest = { len: 0, start: null, end: null };
  let run = { len: 0, start: null };
  for (const d of days) {
    if (d.count > 0) {
      if (run.len === 0) run.start = d.date;
      run.len++;
      if (run.len > longest.len) longest = { len: run.len, start: run.start, end: d.date };
    } else run = { len: 0, start: null };
  }
  // current streak: today may still be empty, so start counting from yesterday in that case
  let i = days.length - 1;
  if (days[i] && days[i].count === 0) i--;
  let cur = { len: 0, start: null, end: days[i]?.date };
  for (; i >= 0 && days[i].count > 0; i--) { cur.len++; cur.start = days[i].date; }
  return { longest, cur, total: days.reduce((a, d) => a + d.count, 0), first: days[0].date, last: days[days.length - 1].date };
}

function streakSvg(s) {
  const W = 495, H = 195, col = W / 3;
  const range = (a, b) => (a ? `${fmt(a)} - ${fmt(b)}` : "no streak yet");
  const block = (cx, value, label, sub, valueColor) => `
    <text x="${cx}" y="88" text-anchor="middle" fill="${valueColor}" font-size="28" font-weight="700" ${FONT}>${esc(value)}</text>
    <text x="${cx}" y="122" text-anchor="middle" fill="${C.lav}" font-size="14" ${FONT}>${esc(label)}</text>
    <text x="${cx}" y="146" text-anchor="middle" fill="${C.dim}" font-size="12" ${FONT}>${esc(sub)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="contribution streaks">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="4.5" fill="${C.bg}" stroke="${C.border}"/>
  <line x1="${col}" y1="28" x2="${col}" y2="${H - 28}" stroke="${C.border}" stroke-opacity=".6"/>
  <line x1="${col * 2}" y1="28" x2="${col * 2}" y2="${H - 28}" stroke="${C.border}" stroke-opacity=".6"/>
  ${block(col / 2, s.total, "Total Contributions", `${fmt(s.first)}, ${s.first.slice(0,4)} - present`, "#FFFFFF")}
  <circle cx="${col * 1.5}" cy="78" r="40" fill="none" stroke="${C.crim}" stroke-width="5"/>
  <text x="${col * 1.5}" y="88" text-anchor="middle" fill="#FFFFFF" font-size="28" font-weight="700" ${FONT}>${s.cur.len}</text>
  <text x="${col * 1.5}" y="146" text-anchor="middle" fill="${C.crim}" font-size="14" font-weight="700" ${FONT}>Current Streak</text>
  <text x="${col * 1.5}" y="166" text-anchor="middle" fill="${C.dim}" font-size="12" ${FONT}>${esc(range(s.cur.start, s.cur.end))}</text>
  ${block(col * 2.5, s.longest.len, "Longest Streak", range(s.longest.start, s.longest.end), "#FFFFFF")}
</svg>`;
}

function activitySvg(days) {
  const recent = days.slice(-31);
  const W = 880, H = 300, L = 50, R = 24, T = 52, B = 46;
  const pw = W - L - R, ph = H - T - B;
  const max = Math.max(4, ...recent.map((d) => d.count));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const x = (i) => L + (pw * i) / (recent.length - 1);
  const y = (v) => T + ph - (ph * v) / top;
  const pts = recent.map((d, i) => `${x(i).toFixed(1)},${y(d.count).toFixed(1)}`);
  const grid = [0, 1, 2, 3, 4].map((k) => {
    const v = step * k;
    return `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="${C.grid}"/>
    <text x="${L - 10}" y="${y(v) + 4}" text-anchor="end" fill="${C.dim}" font-size="11" ${FONT}>${v}</text>`;
  }).join("");
  const labels = recent.map((d, i) => (i % 3 === 0 ? `<text x="${x(i)}" y="${H - B + 20}" text-anchor="middle" fill="${C.dim}" font-size="11" ${FONT}>${d.date.slice(8)}</text>` : "")).join("");
  const dots = recent.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.count).toFixed(1)}" r="3.5" fill="${C.lav}" stroke="${C.bg}" stroke-width="1.5"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="contributions over the last 31 days">
  <defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.border}" stop-opacity=".55"/><stop offset="1" stop-color="${C.border}" stop-opacity="0"/></linearGradient></defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="4.5" fill="${C.bg}" stroke="${C.border}"/>
  <text x="${W / 2}" y="32" text-anchor="middle" fill="${C.crim}" font-size="18" font-weight="700" ${FONT}>contribution graph</text>
  ${grid}
  <polygon points="${L},${y(0)} ${pts.join(" ")} ${W - R},${y(0)}" fill="url(#a)"/>
  <polyline points="${pts.join(" ")}" fill="none" stroke="${C.crim}" stroke-width="2.5" stroke-linejoin="round"/>
  ${dots}
  ${labels}
  <text x="${W / 2}" y="${H - 8}" text-anchor="middle" fill="${C.dim}" font-size="11" ${FONT}>last 31 days</text>
</svg>`;
}

const days = await loadDays();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/streak.svg`, streakSvg(streaks(days)));
writeFileSync(`${OUT}/activity.svg`, activitySvg(days));
console.log(`wrote ${OUT}/streak.svg and ${OUT}/activity.svg from ${days.length} days`);
