// Computes real GitHub activity stats for rameenfatima325 and re-renders
// the profile README's terminal-window PNGs from them. Run by
// .github/workflows/update-terminal-stats.yml on a schedule, or manually
// with `node .github/scripts/fetch-stats.mjs`.
//
// Requires a GITHUB_TOKEN in the environment (Actions provides one
// automatically; only public read access is needed).

import { renderToFiles } from './render-terminal.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OWNER = 'rameenfatima325';
const TOKEN = process.env.GITHUB_TOKEN;
const API = 'https://api.github.com';

// This account's own commit history lives across its own repos only — the
// one fork (a teammate's project) is excluded from every commit-derived
// stat below (streaks, weekday, hours) but its stars still count toward
// the account's total, same methodology as the static numbers this
// replaces.
const FORKED_REPOS = new Set(['Smart-City-Emergency-Response-and-Optimization-system']);

// Languages under this many bytes in a given repo are treated as
// incidental (a stray header, a tiny build script) and dropped from the
// "top language" figure so they don't skew it.
const MIN_LANGUAGE_BYTES = 15000;

// The account's commits are authored from Pakistan; GitHub's REST API
// normalizes commit author dates to UTC, so weekday/time-of-day stats are
// shifted back to the account's actual local time (UTC+5) before bucketing.
const LOCAL_OFFSET_HOURS = 5;

function headers() {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'rameenfatima325-stats-script' };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function getJSON(url) {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function getPaginated(url) {
  const results = [];
  let page = 1;
  for (;;) {
    const sep = url.includes('?') ? '&' : '?';
    const data = await getJSON(`${url}${sep}per_page=100&page=${page}`);
    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return results;
}

function dayBucket(hourLocal) {
  if (hourLocal >= 5 && hourLocal < 12) return { key: 'morning', label: 'morning, 5am–12pm' };
  if (hourLocal >= 12 && hourLocal < 17) return { key: 'afternoon', label: 'afternoon, 12pm–5pm' };
  if (hourLocal >= 17 && hourLocal < 21) return { key: 'evening', label: 'evening, 5pm–9pm' };
  return { key: 'late night', label: 'late night, 9pm–5am' };
}

function daysBetween(a, b) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const da = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const db = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((db - da) / MS_PER_DAY);
}

export async function computeStats() {
  const now = new Date();

  const user = await getJSON(`${API}/users/${OWNER}`);
  const repos = await getPaginated(`${API}/users/${OWNER}/repos`);

  let totalStars = 0;
  let earliestRepoCreated = null;
  for (const r of repos) {
    totalStars += r.stargazers_count || 0;
    const created = new Date(r.created_at);
    if (!earliestRepoCreated || created < earliestRepoCreated) earliestRepoCreated = created;
  }

  // ---- commits, streaks, weekday, time-of-day (own repos only) --------
  const ownRepos = repos.filter(r => !FORKED_REPOS.has(r.name));
  const commitDates = [];
  for (const r of ownRepos) {
    let commits;
    try {
      commits = await getPaginated(`${API}/repos/${OWNER}/${r.name}/commits?author=${OWNER}`);
    } catch (err) {
      // An empty repo (no commits yet) 409s on the commits endpoint.
      if (String(err.message).includes('409')) continue;
      throw err;
    }
    for (const c of commits) {
      commitDates.push(new Date(c.commit.author.date));
    }
  }

  const totalCommits = commitDates.length;

  const localDates = commitDates.map(d => new Date(d.getTime() + LOCAL_OFFSET_HOURS * 3600 * 1000));

  const dayKeySet = new Set(
    commitDates.map(d => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  );
  const dayKeys = [...dayKeySet].sort((a, b) => a - b);
  const DAY_MS = 24 * 60 * 60 * 1000;

  let bestStreak = dayKeys.length ? 1 : 0;
  let run = dayKeys.length ? 1 : 0;
  for (let i = 1; i < dayKeys.length; i++) {
    if (dayKeys[i] - dayKeys[i - 1] === DAY_MS) {
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 1;
    }
  }

  let currentStreak = 0;
  if (dayKeys.length) {
    const lastDay = dayKeys[dayKeys.length - 1];
    const todayKey = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const gapDays = Math.round((todayKey - lastDay) / DAY_MS);
    // A streak is still "current" through the day after the last commit
    // (you haven't broken it until a full day has passed with nothing) —
    // same forgiving definition the earlier static number used.
    if (gapDays <= 1) {
      currentStreak = 1;
      for (let i = dayKeys.length - 1; i > 0; i--) {
        if (dayKeys[i] - dayKeys[i - 1] === DAY_MS) currentStreak++;
        else break;
      }
    }
  }

  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekdayCounts = new Map();
  for (const d of localDates) {
    const name = weekdayNames[d.getUTCDay()];
    weekdayCounts.set(name, (weekdayCounts.get(name) || 0) + 1);
  }
  let mostActiveDay = { name: '—', pct: 0 };
  for (const [name, count] of weekdayCounts) {
    const pct = Math.round((count / totalCommits) * 100);
    if (pct > mostActiveDay.pct) mostActiveDay = { name, pct };
  }

  const bucketCounts = new Map();
  for (const d of localDates) {
    const b = dayBucket(d.getUTCHours());
    bucketCounts.set(b.key, { label: b.label, count: (bucketCounts.get(b.key)?.count || 0) + 1 });
  }
  let peakHours = { label: '—', pct: 0 };
  for (const { label, count } of bucketCounts.values()) {
    const pct = Math.round((count / totalCommits) * 100);
    if (pct > peakHours.pct) peakHours = { label, pct };
  }

  // ---- top language by byte share (own repos only) ---------------------
  const languageTotals = new Map();
  for (const r of ownRepos) {
    const langs = await getJSON(`${API}/repos/${OWNER}/${r.name}/languages`);
    for (const [lang, bytes] of Object.entries(langs)) {
      if (bytes < MIN_LANGUAGE_BYTES) continue;
      languageTotals.set(lang, (languageTotals.get(lang) || 0) + bytes);
    }
  }
  const totalLangBytes = [...languageTotals.values()].reduce((a, b) => a + b, 0);
  let topLanguage = { name: '—', pct: 0 };
  for (const [name, bytes] of languageTotals) {
    const pct = (bytes / totalLangBytes) * 100;
    if (pct > topLanguage.pct) topLanguage = { name, pct };
  }

  const accountAgeDays = daysBetween(new Date(user.created_at), now);
  const shippingDays = earliestRepoCreated ? daysBetween(earliestRepoCreated, now) : 0;

  return {
    commits: totalCommits,
    bestStreak,
    currentStreak,
    topLanguage,
    mostActiveDay,
    peakHours,
    accountAgeDays,
    shippingDays,
    // not rendered, kept for debugging/logging
    _totalStars: totalStars
  };
}

async function main() {
  if (!TOKEN) {
    console.warn('Warning: no GITHUB_TOKEN in environment — GitHub API calls will be rate-limited/anonymous.');
  }
  const stats = await computeStats();
  console.log('Computed stats:', JSON.stringify(stats, null, 2));
  const outDir = path.resolve(__dirname, '../readme');
  const results = await renderToFiles(stats, outDir);
  console.log('Rendered:', JSON.stringify(results, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
