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
    H = 270;

  const displayName = u.name || "Harikeshav Rameshkumar";

  // Circuit traces / Bus routing with 45° angled lines (HPC / CPU aesthetic)
  const circuitTraces = `
    <g stroke="#38bdf8" stroke-opacity="0.18" stroke-width="1.2" fill="none">
      <!-- Left side traces -->
      <path d="M 0 80 L 90 80 L 130 120 L 200 120"/>
      <path d="M 0 160 L 60 160 L 100 200 L 180 200"/>
      <path d="M 70 44 L 70 60 L 110 100 L 110 160"/>
      <!-- Right side traces -->
      <path d="M 1000 80 L 910 80 L 870 120 L 800 120"/>
      <path d="M 1000 160 L 940 160 L 900 200 L 820 200"/>
      <path d="M 930 44 L 930 60 L 890 100 L 890 160"/>
    </g>
    <!-- Solder / Node Pads -->
    <g fill="#38bdf8" opacity="0.4">
      <circle cx="200" cy="120" r="3"/>
      <circle cx="180" cy="200" r="3"/>
      <circle cx="800" cy="120" r="3"/>
      <circle cx="820" cy="200" r="3"/>
      <circle cx="110" cy="160" r="2.5"/>
      <circle cx="890" cy="160" r="2.5"/>
    </g>
    <!-- Pulsing Node Highlights -->
    <circle cx="200" cy="120" r="5" fill="none" stroke="#38bdf8" opacity="0.6">
      <animate attributeName="r" values="3;7;3" dur="2.4s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.8;0.1;0.8" dur="2.4s" repeatCount="indefinite"/>
    </circle>
    <circle cx="800" cy="120" r="5" fill="none" stroke="#38bdf8" opacity="0.6">
      <animate attributeName="r" values="3;7;3" dur="2.4s" begin="1.2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.8;0.1;0.8" dur="2.4s" begin="1.2s" repeatCount="indefinite"/>
    </circle>
  `;

  // Perspective Cyber Grid at the bottom
  let gridLines = "";
  for (let x = 0; x <= W; x += 40) {
    gridLines += `<line x1="${x}" y1="190" x2="${W / 2 + (x - W / 2) * 2.2}" y2="${H}" stroke="#2C5364" stroke-opacity="0.25" stroke-width="1"/>`;
  }
  for (let y = 195; y <= H; y += 12) {
    gridLines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#2C5364" stroke-opacity="0.25" stroke-width="1"/>`;
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(
    displayName
  )} — Systems &amp; AI Engineer">
  <defs>
    <!-- Deep Space Gradient Background -->
    <linearGradient id="deepBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06090e"/>
      <stop offset="35%" stop-color="#0a1019"/>
      <stop offset="70%" stop-color="#0c1724"/>
      <stop offset="100%" stop-color="#070c14"/>
    </linearGradient>

    <!-- Radial Glow 1 (Cyan / Teal Accent) -->
    <radialGradient id="glowTeal" cx="22%" cy="35%" r="55%">
      <stop offset="0%" stop-color="#00e5ff" stop-opacity="0.18"/>
      <stop offset="45%" stop-color="#2C5364" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>

    <!-- Radial Glow 2 (Electric Indigo Accent) -->
    <radialGradient id="glowIndigo" cx="78%" cy="65%" r="55%">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.16"/>
      <stop offset="50%" stop-color="#0ea5e9" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>

    <!-- Text Metallic Silver→Icy Teal Gradient -->
    <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="40%" stop-color="#f8fafc"/>
      <stop offset="75%" stop-color="#7dd3fc"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>

    <!-- Accent Bar Gradient -->
    <linearGradient id="barGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2C5364" stop-opacity="0"/>
      <stop offset="25%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#67e8f9"/>
      <stop offset="75%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#2C5364" stop-opacity="0"/>
    </linearGradient>

    <!-- Light Sweep Animation across banner -->
    <linearGradient id="lightBeam" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#38bdf8" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      <animate attributeName="x1" values="-150%;150%" dur="6s" repeatCount="indefinite"/>
      <animate attributeName="x2" values="-50%;250%" dur="6s" repeatCount="indefinite"/>
    </linearGradient>

    <!-- Pill Gradient -->
    <linearGradient id="pillGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#15202e" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#0a1019" stop-opacity="0.8"/>
    </linearGradient>

    <!-- Grid Fade Mask -->
    <linearGradient id="gridMaskGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="35%" stop-color="#fff" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="1"/>
    </linearGradient>
    <mask id="gridMask">
      <rect x="0" y="190" width="${W}" height="80" fill="url(#gridMaskGrad)"/>
    </mask>

    <!-- Glow Filter -->
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <style>
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
    .hud-title { font: 600 11px 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace; fill: #64748b; letter-spacing: 1.5px; }
    .hud-stat { font: 600 11px 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace; fill: #38bdf8; letter-spacing: 1px; }
    .name { font: 800 44px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif; letter-spacing: -0.5px; }
    .tagline { font: 500 14px 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace; fill: #94a3b8; }
    .tag-text { font: 600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; fill: #e2e8f0; }
    .tag-icon { font: 600 12px monospace; fill: #38bdf8; }
  </style>

  <!-- Background Base -->
  <rect width="${W}" height="${H}" rx="12" fill="url(#deepBg)"/>

  <!-- Radial Ambient Lighting -->
  <rect width="${W}" height="${H}" rx="12" fill="url(#glowTeal)"/>
  <rect width="${W}" height="${H}" rx="12" fill="url(#glowIndigo)"/>

  <!-- Circuit Routing Traces & Nodes -->
  ${circuitTraces}

  <!-- Perspective Floor Grid (Masked) -->
  <g mask="url(#gridMask)">${gridLines}</g>

  <!-- Shimmer Sweep -->
  <rect width="${W}" height="${H}" rx="12" fill="url(#lightBeam)"/>

  <!-- Outer HUD Frame Border -->
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="11" fill="none" stroke="#1b2430" stroke-width="1.5"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="11" fill="none" stroke="#38bdf8" stroke-opacity="0.2" stroke-width="1"/>

  <!-- Corner Tech Accents -->
  <path d="M 12 26 L 12 12 L 26 12" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>
  <path d="M ${W - 12} 26 L ${W - 12} 12 L ${W - 26} 12" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>
  <path d="M 12 ${H - 26} L 12 ${H - 12} L 26 ${H - 12}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>
  <path d="M ${W - 12} ${H - 26} L ${W - 12} ${H - 12} L ${W - 26} ${H - 12}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>

  <!-- Top HUD Bar -->
  <g transform="translate(24 24)">
    <!-- Terminal Dots -->
    <circle cx="8" cy="0" r="4.5" fill="#ef4444" opacity="0.8"/>
    <circle cx="23" cy="0" r="4.5" fill="#f59e0b" opacity="0.8"/>
    <circle cx="38" cy="0" r="4.5" fill="#10b981" opacity="0.8"/>
    <text x="56" y="4" class="hud-title">SYS://HARIKESHAV.ME</text>
    <text x="${W - 48}" y="4" class="hud-stat" text-anchor="end">
      <tspan fill="#10b981">●</tspan> STATUS: ACTIVE <tspan fill="#475569">|</tspan> SWE @ GE AEROSPACE
    </text>
  </g>

  <!-- Divider Line -->
  <line x1="24" y1="40" x2="${W - 24}" y2="40" stroke="#1b2430" stroke-width="1"/>

  <!-- Main Hero Title -->
  <g transform="translate(500 102)" text-anchor="middle">
    <!-- Glow Underlay -->
    <text x="0" y="0" class="name" fill="#38bdf8" opacity="0.25" filter="url(#glow)">${esc(
      displayName
    )}</text>
    <!-- Crisp Gradient Title -->
    <text x="0" y="0" class="name" fill="url(#textGrad)">${esc(
      displayName
    )}</text>
  </g>

  <!-- Sleek Glowing Neon Divider Bar -->
  <rect x="360" y="116" width="280" height="2.5" rx="1.2" fill="url(#barGrad)"/>

  <!-- Subtitle with terminal typing cursor -->
  <g transform="translate(500 148)" text-anchor="middle">
    <text class="tagline">
      <tspan fill="#38bdf8">&gt; </tspan>
      Go a layer deeper — from SIMD kernels to multi-agent orchestration
      <tspan fill="#38bdf8" style="animation: blink 1s infinite">_</tspan>
    </text>
  </g>

  <!-- 4 Feature Pills / Specializations -->
  <g transform="translate(500 205)" text-anchor="middle">
    <!-- Pill 1: HPC & SIMD -->
    <g transform="translate(-340 -16)">
      <rect x="0" y="0" width="155" height="32" rx="16" fill="url(#pillGrad)" stroke="#38bdf8" stroke-opacity="0.35" stroke-width="1"/>
      <text x="77.5" y="20" class="tag-text" text-anchor="middle">
        <tspan class="tag-icon">⚡ </tspan>HPC &amp; SIMD
      </text>
    </g>

    <!-- Pill 2: Distributed Systems -->
    <g transform="translate(-170 -16)">
      <rect x="0" y="0" width="180" height="32" rx="16" fill="url(#pillGrad)" stroke="#38bdf8" stroke-opacity="0.35" stroke-width="1"/>
      <text x="90" y="20" class="tag-text" text-anchor="middle">
        <tspan class="tag-icon">🌐 </tspan>Distributed Systems
      </text>
    </g>

    <!-- Pill 3: LLM Architecture -->
    <g transform="translate(25 -16)">
      <rect x="0" y="0" width="165" height="32" rx="16" fill="url(#pillGrad)" stroke="#38bdf8" stroke-opacity="0.35" stroke-width="1"/>
      <text x="82.5" y="20" class="tag-text" text-anchor="middle">
        <tspan class="tag-icon">🧠 </tspan>LLM Architecture
      </text>
    </g>

    <!-- Pill 4: Applied Crypto -->
    <g transform="translate(205 -16)">
      <rect x="0" y="0" width="145" height="32" rx="16" fill="url(#pillGrad)" stroke="#38bdf8" stroke-opacity="0.35" stroke-width="1"/>
      <text x="72.5" y="20" class="tag-text" text-anchor="middle">
        <tspan class="tag-icon">🔐 </tspan>Applied Crypto
      </text>
    </g>
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

// ══════════════════════════════════════════════════════════════════════════
// SVG 5 — Activity / Contribution Graph (self-hosted; replaces flaky activity-graph)
// ══════════════════════════════════════════════════════════════════════════
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(dStr) {
  const parts = dStr.split("-");
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return `${months[m - 1]} ${d}`;
}

function activitySVG() {
  const W = 840,
    H = 210;
  const last31 = days.slice(-31);
  const total31 = last31.reduce((a, d) => a + d.contributionCount, 0);
  const maxCount = Math.max(...last31.map((d) => d.contributionCount), 1);
  let yMax = Math.max(maxCount, 4);
  if (yMax % 2 !== 0) yMax += 1;
  const yMid = Math.round(yMax / 2);

  const padLeft = 45,
    padRight = 35,
    padTop = 68,
    padBottom = 38;
  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;
  const baseY = padTop + chartH;

  const pts = last31.map((d, i) => {
    const x = padLeft + (i / (last31.length - 1)) * chartW;
    const y = baseY - (d.contributionCount / yMax) * chartH;
    return { x, y, count: d.contributionCount, date: d.date };
  });

  let pathD = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  let areaD = `M ${pts[0].x.toFixed(2)} ${baseY.toFixed(2)} L ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const pPrev = pts[i - 1] || p0;
    const pNext = pts[i + 2] || p1;

    let cp1x = p0.x + (p1.x - pPrev.x) / 6;
    let cp1y = p0.y + (p1.y - pPrev.y) / 6;
    let cp2x = p1.x - (pNext.x - p0.x) / 6;
    let cp2y = p1.y - (pNext.y - p0.y) / 6;

    cp1y = Math.min(Math.max(cp1y, padTop), baseY);
    cp2y = Math.min(Math.max(cp2y, padTop), baseY);

    const segment = ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
    pathD += segment;
    areaD += segment;
  }
  areaD += ` L ${pts[pts.length - 1].x.toFixed(2)} ${baseY.toFixed(2)} Z`;

  let circles = "";
  pts.forEach((p) => {
    if (p.count > 0) {
      circles += `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="4" fill="${T.card}" stroke="${T.accent2}" stroke-width="2.5"/>`;
      circles += `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="1.8" fill="#ffffff"/>`;
      circles += `<text x="${p.x.toFixed(2)}" y="${(p.y - 8).toFixed(2)}" class="pt-val">${p.count}</text>`;
    }
  });

  let xLabels = "";
  const step = Math.floor((pts.length - 1) / 5);
  const labelIndices = [0, step, step * 2, step * 3, step * 4, pts.length - 1];
  labelIndices.forEach((idx) => {
    const p = pts[idx];
    const anchor = idx === 0 ? "start" : idx === pts.length - 1 ? "end" : "middle";
    xLabels += `<text x="${p.x.toFixed(2)}" y="${(baseY + 20).toFixed(2)}" class="axis-lbl" text-anchor="${anchor}">${fmtDate(p.date)}</text>`;
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contribution activity graph for ${esc(
    LOGIN
  )}">
  <defs>
    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${T.accent2}" stop-opacity="0.45"/>
      <stop offset="60%" stop-color="${T.accent}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${T.card}" stop-opacity="0.0"/>
    </linearGradient>
  </defs>
  <style>
    .title{font:600 17px 'Segoe UI',Ubuntu,sans-serif;fill:${T.title}}
    .subtitle{font:400 13px 'Segoe UI',Ubuntu,sans-serif;fill:${T.muted}}
    .stat-pill{font:600 12px 'Segoe UI',Ubuntu,sans-serif;fill:${T.text}}
    .stat-highlight{font:700 12px 'Segoe UI',Ubuntu,sans-serif;fill:${T.accent2}}
    .grid{stroke:${T.border};stroke-dasharray:3,4;stroke-width:1}
    .axis-lbl{font:400 11px 'Segoe UI',Ubuntu,sans-serif;fill:${T.muted}}
    .pt-val{font:600 10px 'Segoe UI',Ubuntu,sans-serif;fill:${T.text};text-anchor:middle}
  </style>

  <rect x="0.5" y="0.5" rx="8" width="${W - 1}" height="${H - 1}" fill="${T.card}" stroke="${T.border}"/>

  <!-- Header -->
  <g transform="translate(25 33)">
    <text x="0" y="0" class="title">Contribution Graph</text>
    <text x="160" y="0" class="subtitle">· Last 31 Days</text>
  </g>

  <!-- Stat summary pills on top right -->
  <g transform="translate(${W - 35} 33)" text-anchor="end">
    <text x="0" y="0" class="stat-pill">
      Total: <tspan class="stat-highlight">${fmt(total31)}</tspan> contribs
      <tspan fill="${T.muted}">  ·  </tspan>
      Max: <tspan class="stat-highlight">${yMax}</tspan>/day
    </text>
  </g>

  <!-- Y Grid & Labels -->
  <g>
    <line x1="${padLeft}" y1="${padTop}" x2="${padLeft + chartW}" y2="${padTop}" class="grid"/>
    <text x="${padLeft - 10}" y="${padTop + 4}" class="axis-lbl" text-anchor="end">${yMax}</text>

    <line x1="${padLeft}" y1="${padTop + chartH / 2}" x2="${padLeft + chartW}" y2="${padTop + chartH / 2}" class="grid"/>
    <text x="${padLeft - 10}" y="${padTop + chartH / 2 + 4}" class="axis-lbl" text-anchor="end">${yMid}</text>

    <line x1="${padLeft}" y1="${baseY}" x2="${padLeft + chartW}" y2="${baseY}" stroke="${T.border}" stroke-width="1.2"/>
    <text x="${padLeft - 10}" y="${baseY + 4}" class="axis-lbl" text-anchor="end">0</text>
  </g>

  <!-- Area & Line Graph -->
  <path d="${areaD}" fill="url(#areaGrad)"/>
  <path d="${pathD}" fill="none" stroke="${T.accent2}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

  <!-- Data Points -->
  ${circles}

  <!-- X Axis Labels -->
  ${xLabels}
</svg>`;
}

writeFileSync("assets/header.svg", headerSVG());
writeFileSync("assets/stats.svg", statsSVG());
writeFileSync("assets/langs.svg", langsSVG());
writeFileSync("assets/streak.svg", streakSVG());
writeFileSync("assets/activity.svg", activitySVG());
console.log("Wrote assets/{header,stats,langs,streak,activity}.svg");
console.log(
  `stars=${stars} commits=${stats.Commits} prs=${stats.PRs} contribs=${totalContribs} curStreak=${current} longest=${longest}`
);
