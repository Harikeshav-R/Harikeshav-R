// Generates self-hosted stats SVGs committed to the repo, so the profile never
// depends on rate-limited third-party services (github-readme-stats, streak-stats,
// profile-trophy) that GitHub's image proxy blocks when they error out.
//
// Runs in GitHub Actions with the built-in GITHUB_TOKEN (no personal token needed).
// Outputs: assets/stats.svg and assets/langs.svg
//
// Node 20+, no dependencies.

import { writeFileSync } from "node:fs";

const TOKEN = process.env.GITHUB_TOKEN;
const LOGIN = process.env.GH_LOGIN || "Harikeshav-R";
if (!TOKEN) throw new Error("GITHUB_TOKEN is required");

// ── Theme (teal→navy, matches the README) ────────────────────────────────
const T = {
  bg: "#0D1117",
  card: "#0D1117",
  border: "#1b2430",
  title: "#2C5364",
  text: "#c9d1d9",
  muted: "#8b949e",
  accent: "#2C5364",
  accent2: "#4a8296",
};

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => n.toLocaleString("en-US");

// ── Fetch ────────────────────────────────────────────────────────────────
const query = `
query($login:String!){
  user(login:$login){
    name
    followers{ totalCount }
    contributionsCollection{
      totalCommitContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalIssueContributions
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ date contributionCount weekday } }
      }
    }
    repositories(first:100, ownerAffiliations:OWNER, isFork:false){
      totalCount
      nodes{
        stargazerCount
        languages(first:10, orderBy:{field:SIZE,direction:DESC}){
          edges{ size node{ name color } }
        }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `bearer ${TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "profile-stats-generator",
  },
  body: JSON.stringify({ query, variables: { login: LOGIN } }),
});
const json = await res.json();
if (json.errors) throw new Error(JSON.stringify(json.errors));
const u = json.data.user;
const cc = u.contributionsCollection;

const stars = u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0);
const totalContribs = cc.contributionCalendar.totalContributions;

// ── Streaks from the contribution calendar ────────────────────────────────
const days = cc.contributionCalendar.weeks
  .flatMap((w) => w.contributionDays)
  .sort((a, b) => a.date.localeCompare(b.date));
let longest = 0,
  current = 0,
  run = 0;
for (const d of days) {
  if (d.contributionCount > 0) {
    run++;
    if (run > longest) longest = run;
  } else run = 0;
}
// current streak: walk backwards, tolerate a zero on the very last day (today
// may not have a commit yet) but not before.
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) current++;
  else if (i === days.length - 1) continue;
  else break;
}

const stats = {
  Stars: stars,
  Commits: cc.totalCommitContributions,
  PRs: cc.totalPullRequestContributions,
  Issues: cc.totalIssueContributions,
  Reviews: cc.totalPullRequestReviewContributions,
  Repos: u.repositories.totalCount,
  Followers: u.followers.totalCount,
};

// ── Languages aggregated by bytes ─────────────────────────────────────────
const langMap = new Map();
for (const r of u.repositories.nodes)
  for (const e of r.languages.edges) {
    const cur = langMap.get(e.node.name) || { size: 0, color: e.node.color };
    cur.size += e.size;
    langMap.set(e.node.name, cur);
  }
const langs = [...langMap.entries()]
  .map(([name, v]) => ({ name, ...v }))
  .sort((a, b) => b.size - a.size)
  .slice(0, 8);
const langTotal = langs.reduce((a, l) => a + l.size, 0);

// ══════════════════════════════════════════════════════════════════════════
// SVG 1 — Stats card
// ══════════════════════════════════════════════════════════════════════════
function statsSVG() {
  const W = 480,
    H = 195;
  const rows = [
    ["Total Stars Earned", stats.Stars, "⭐"],
    ["Total Commits (2026)", stats.Commits, "🔀"],
    ["Total PRs", stats.PRs, "⬆️"],
    ["Total Issues", stats.Issues, "🐛"],
    ["Contributed to (last year)", stats.Repos, "📦"],
  ];
  const ring = `${totalContribs}`;
  const items = rows
    .map((r, i) => {
      const y = 62 + i * 25;
      return `
    <g transform="translate(30 ${y})" style="animation: fadein 0.4s ease-in-out forwards; animation-delay: ${0.15 +
        i * 0.1}s; opacity:0">
      <text x="0" y="0" class="lbl">${esc(r[2])}  ${esc(r[0])}</text>
      <text x="320" y="0" class="val">${fmt(r[1])}</text>
    </g>`;
    })
    .join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub stats for ${esc(
    u.name
  )}">
  <style>
    .title{font:600 18px 'Segoe UI',Ubuntu,sans-serif;fill:${T.title}}
    .lbl{font:400 14px 'Segoe UI',Ubuntu,sans-serif;fill:${T.text}}
    .val{font:700 14px 'Segoe UI',Ubuntu,sans-serif;fill:${T.text};text-anchor:end}
    .ring-num{font:800 22px 'Segoe UI',Ubuntu,sans-serif;fill:${T.title};text-anchor:middle}
    .ring-cap{font:400 10px 'Segoe UI',Ubuntu,sans-serif;fill:${T.muted};text-anchor:middle}
    @keyframes fadein{to{opacity:1}}
    @keyframes grow{to{stroke-dashoffset:0}}
  </style>
  <rect x="0.5" y="0.5" rx="8" width="${W - 1}" height="${H -
    1}" fill="${T.card}" stroke="${T.border}"/>
  <text x="30" y="35" class="title">${esc(u.name)} · GitHub Stats</text>
  ${items}
  <g transform="translate(400 118)">
    <circle r="42" fill="none" stroke="${T.border}" stroke-width="6"/>
    <circle r="42" fill="none" stroke="${T.accent}" stroke-width="6"
      stroke-linecap="round" transform="rotate(-90)"
      stroke-dasharray="264" stroke-dashoffset="66"
      style="animation: grow 1s ease-in-out forwards"/>
    <text y="-2" class="ring-num">${fmt(totalContribs)}</text>
    <text y="14" class="ring-cap">contributions</text>
    <text y="26" class="ring-cap">this year</text>
  </g>
  <g transform="translate(400 118)"></g>
</svg>`;
}

// ══════════════════════════════════════════════════════════════════════════
// SVG 2 — Top languages (animated bar + legend)
// ══════════════════════════════════════════════════════════════════════════
function langsSVG() {
  const W = 480,
    barY = 55,
    barW = W - 50,
    barH = 10;
  let x = 25;
  const segs = langs
    .map((l) => {
      const w = (l.size / langTotal) * barW;
      const seg = `<rect x="${x.toFixed(2)}" y="${barY}" width="${w.toFixed(
        2
      )}" height="${barH}" fill="${l.color || T.accent2}"/>`;
      x += w;
      return seg;
    })
    .join("");

  // legend, two columns
  const legend = langs
    .map((l, i) => {
      const col = i % 2;
      const rowi = Math.floor(i / 2);
      const lx = 25 + col * 230;
      const ly = 90 + rowi * 24;
      const pct = ((l.size / langTotal) * 100).toFixed(1);
      return `<g transform="translate(${lx} ${ly})" style="animation: fadein 0.4s ease forwards; animation-delay:${0.1 +
        i * 0.07}s; opacity:0">
        <circle cx="6" cy="-4" r="6" fill="${l.color || T.accent2}"/>
        <text x="20" y="0" class="lg">${esc(l.name)}</text>
        <text x="200" y="0" class="lgp">${pct}%</text>
      </g>`;
    })
    .join("");

  const H = 90 + Math.ceil(langs.length / 2) * 24 + 8;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Most used languages">
  <style>
    .title{font:600 18px 'Segoe UI',Ubuntu,sans-serif;fill:${T.title}}
    .lg{font:400 13px 'Segoe UI',Ubuntu,sans-serif;fill:${T.text}}
    .lgp{font:700 13px 'Segoe UI',Ubuntu,sans-serif;fill:${T.muted};text-anchor:end}
    @keyframes fadein{to{opacity:1}}
  </style>
  <rect x="0.5" y="0.5" rx="8" width="${W - 1}" height="${H -
    1}" fill="${T.card}" stroke="${T.border}"/>
  <text x="25" y="35" class="title">Most Used Languages</text>
  <clipPath id="r"><rect x="25" y="${barY}" width="${barW}" height="${barH}" rx="5"/></clipPath>
  <g clip-path="url(#r)">${segs}</g>
  ${legend}
</svg>`;
}

// ══════════════════════════════════════════════════════════════════════════
// SVG 3 — Animated hero banner (self-hosted; replaces flaky capsule-render)
// ══════════════════════════════════════════════════════════════════════════
function headerSVG() {
  const W = 1000,
    H = 200;
  // faint circuit dots for texture
  let dots = "";
  for (let gy = 0; gy < H; gy += 25)
    for (let gx = 0; gx < W; gx += 25)
      dots += `<circle cx="${gx}" cy="${gy}" r="1" fill="#ffffff" opacity="0.05"/>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(
    u.name
  )}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F2027"/>
      <stop offset="50%" stop-color="#203A43"/>
      <stop offset="100%" stop-color="#2C5364"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      <animate attributeName="x1" values="-1;1" dur="6s" repeatCount="indefinite"/>
      <animate attributeName="x2" values="0;2" dur="6s" repeatCount="indefinite"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g>${dots}</g>
  <rect width="${W}" height="${H}" fill="url(#shine)"/>
  <text x="50%" y="82" text-anchor="middle"
    style="font:800 46px 'Segoe UI',Ubuntu,sans-serif;fill:#ffffff;letter-spacing:1px">
    Harikeshav Rameshkumar
    <animate attributeName="opacity" from="0" to="1" dur="1.2s" fill="freeze"/>
  </text>
  <g style="opacity:0"><animate attributeName="opacity" from="0" to="1" dur="1.2s" begin="0.4s" fill="freeze"/>
    <rect x="50%" y="100" width="120" height="3" rx="2" fill="#4a8296" transform="translate(-60 0)"/>
    <text x="50%" y="140" text-anchor="middle"
      style="font:400 19px 'Segoe UI',Ubuntu,sans-serif;fill:#c9d1d9;letter-spacing:2px">
      Systems &amp; AI Engineer  ·  HPC  ·  Distributed Systems  ·  LLM Architecture
    </text>
  </g>
</svg>`;
}

// ══════════════════════════════════════════════════════════════════════════
// SVG 4 — Streak card (self-hosted; replaces flaky streak-stats)
// ══════════════════════════════════════════════════════════════════════════
function streakSVG() {
  const W = 480,
    H = 195;
  const cols = [
    [fmt(totalContribs), "Contributions", "(past year)"],
    [fmt(current), "Current Streak", "🔥"],
    [fmt(longest), "Longest Streak", "(past year)"],
  ];
  const cells = cols
    .map((c, i) => {
      const cx = 80 + i * 160;
      const flame = c[2] === "🔥";
      return `<g transform="translate(${cx} 0)" style="animation:fadein .5s ease forwards;animation-delay:${0.15 +
        i * 0.15}s;opacity:0">
      <text x="0" y="72" text-anchor="middle" class="big">${esc(c[0])}</text>
      <text x="0" y="105" text-anchor="middle" class="cap ${
        flame ? "hot" : ""
      }">${esc(c[1])}</text>
      <text x="0" y="126" text-anchor="middle" class="sub">${esc(c[2])}</text>
    </g>`;
    })
    .join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contribution streak">
  <style>
    .big{font:800 34px 'Segoe UI',Ubuntu,sans-serif;fill:${T.text}}
    .cap{font:600 13px 'Segoe UI',Ubuntu,sans-serif;fill:${T.title}}
    .cap.hot{fill:#e8792b}
    .sub{font:400 11px 'Segoe UI',Ubuntu,sans-serif;fill:${T.muted}}
    @keyframes fadein{to{opacity:1}}
  </style>
  <rect x="0.5" y="0.5" rx="8" width="${W - 1}" height="${H -
    1}" fill="${T.card}" stroke="${T.border}"/>
  <line x1="160" y1="45" x2="160" y2="150" stroke="${T.border}"/>
  <line x1="320" y1="45" x2="320" y2="150" stroke="${T.border}"/>
  <circle cx="240" cy="97" r="46" fill="none" stroke="#e8792b" stroke-width="4" opacity="0.9"/>
  ${cells}
</svg>`;
}

writeFileSync("assets/header.svg", headerSVG());
writeFileSync("assets/stats.svg", statsSVG());
writeFileSync("assets/langs.svg", langsSVG());
writeFileSync("assets/streak.svg", streakSVG());
console.log("Wrote assets/{header,stats,langs,streak}.svg");
console.log(
  `stars=${stars} commits=${stats.Commits} prs=${stats.PRs} contribs=${totalContribs} curStreak=${current} longest=${longest}`
);
