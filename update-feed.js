const fs = require('fs');
const path = require('path');

const feedPath = path.join(__dirname, 'feed.json');
const dataPath = path.join(__dirname, 'data.js');

const RSS_SOURCES = [
  'https://feeds.bbci.co.uk/news/world/europe/rss.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Europe.xml',
  'https://www.euronews.com/rss?level=theme&name=news'
];

const COUNTRY_KEYWORDS = {
  DEU: ['germany', 'german', 'berlin'],
  FRA: ['france', 'french', 'paris', 'macron'],
  ITA: ['italy', 'italian', 'rome'],
  ESP: ['spain', 'spanish', 'madrid'],
  POL: ['poland', 'polish', 'warsaw'],
  NLD: ['netherlands', 'dutch', 'amsterdam'],
  BEL: ['belgium', 'belgian', 'brussels'],
  AUT: ['austria', 'austrian', 'vienna'],
  SWE: ['sweden', 'swedish', 'stockholm'],
  FIN: ['finland', 'finnish', 'helsinki'],
  DNK: ['denmark', 'danish', 'copenhagen'],
  IRL: ['ireland', 'irish', 'dublin'],
  PRT: ['portugal', 'portuguese', 'lisbon'],
  GRC: ['greece', 'greek', 'athens'],
  CZE: ['czech', 'czechia', 'prague'],
  SVK: ['slovakia', 'slovak', 'bratislava'],
  HUN: ['hungary', 'hungarian', 'budapest', 'orban'],
  ROU: ['romania', 'romanian', 'bucharest'],
  BGR: ['bulgaria', 'bulgarian', 'sofia'],
  HRV: ['croatia', 'croatian', 'zagreb'],
  SVN: ['slovenia', 'slovenian', 'ljubljana'],
  LTU: ['lithuania', 'lithuanian', 'vilnius'],
  LVA: ['latvia', 'latvian', 'riga'],
  EST: ['estonia', 'estonian', 'tallinn'],
  LUX: ['luxembourg'],
  MLT: ['malta', 'maltese'],
  CYP: ['cyprus', 'cypriot'],
  SRB: ['serbia', 'serbian', 'belgrade'],
  ALB: ['albania', 'albanian', 'tirana'],
  MNE: ['montenegro'],
  MKD: ['macedonia', 'north macedonia', 'skopje'],
  BIH: ['bosnia', 'herzegovina', 'sarajevo'],
  XKX: ['kosovo', 'pristina'],
  UKR: ['ukraine', 'ukrainian', 'kyiv', 'kiev', 'zelensky'],
  MDA: ['moldova', 'moldovan', 'chisinau'],
  GEO: ['georgia', 'georgian', 'tbilisi'],
  ARM: ['armenia', 'armenian', 'yerevan'],
  AZE: ['azerbaijan', 'baku'],
  GBR: ['britain', 'british', ' uk ', ' u.k.', 'united kingdom', 'london'],
  CHE: ['switzerland', 'swiss', 'bern'],
  NOR: ['norway', 'norwegian', 'oslo'],
  ISL: ['iceland', 'icelandic', 'reykjavik'],
  TUR: ['turkey', 'turkish', 'ankara', 'erdogan'],
  RUS: ['russia', 'russian', 'moscow', 'putin'],
  BLR: ['belarus', 'belarusian', 'minsk']
};

function getCurrentDateString(date = new Date()) {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function classifyNewsHeadline(title) {
  const lower = title.toLowerCase();
  if (/veto|block|stall|stalls|split|dispute|tension|crisis|slow|delay|uncertain|uneven|fragment|fail|paralysis|divided/.test(lower)) {
    return {
      frag: 'Reinforces fragmentation',
      fed: 'Delays federal progress',
      fragWeight: 2,
      fedWeight: -1
    };
  }
  if (/agreement|joint|integrat|union|accession|deal|connected|shared|framework|strategy|approves|backs|advances|progress|roadmap|unveils/.test(lower)) {
    return {
      frag: 'Highlights the limits of national coordination',
      fed: 'Positive — supports federal integration',
      fragWeight: -1,
      fedWeight: 2
    };
  }
  return {
    frag: 'Mixed signal for fragmentation',
    fed: 'Mixed signal for federation',
    fragWeight: 0,
    fedWeight: 0
  };
}

function extractCountries(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const [iso, keywords] of Object.entries(COUNTRY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) found.push(iso);
  }
  if (/western balkans|balkans/.test(lower)) {
    ['SRB', 'ALB', 'MNE', 'MKD', 'BIH', 'XKX'].forEach(iso => {
      if (!found.includes(iso)) found.push(iso);
    });
  }
  if (/european union|\beu\b|commission|parliament|council|brussels/.test(lower)) {
    if (!found.includes('BEL')) found.push('BEL');
  }
  return found.slice(0, 5);
}

function stripHtml(text) {
  return (text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function formatRssDate(pubDate) {
  if (!pubDate) return getCurrentDateString();
  const parsed = new Date(pubDate);
  if (Number.isNaN(parsed.getTime())) return pubDate.replace(/GMT$/, '').trim();
  return getCurrentDateString(parsed);
}

function parseRssItems(xml) {
  const items = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  itemBlocks.forEach(block => {
    const title = stripHtml((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    const description = stripHtml((block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1]);
    const pubDate = stripHtml((block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1]);
    if (title) items.push({ title, description, pubDate });
  });
  return items;
}

async function fetchRss(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml',
        // BBC and NYT reject the default undici agent string with a 403, so
        // identify the collector explicitly rather than fetching anonymously.
        'User-Agent': 'EU2050-feed-collector/1.0 (+https://github.com/volters-cell/EU2050)'
      }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return parseRssItems(await resp.text());
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAllFeeds() {
  const items = [];
  for (const url of RSS_SOURCES) {
    try {
      const parsed = await fetchRss(url);
      parsed.slice(0, 8).forEach(item => items.push(item));
    } catch (err) {
      console.warn('Failed to fetch', url, err.message);
    }
  }
  return items;
}

function dedupeByHeadline(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.title.toLowerCase().slice(0, 80);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildFeedItems(rawItems) {
  return dedupeByHeadline(rawItems)
    .slice(0, 12)
    .map(item => {
      const signal = classifyNewsHeadline(item.title);
      const combined = `${item.title} ${item.description}`;
      return {
        date: formatRssDate(item.pubDate),
        headline: item.title,
        ai: item.description || 'No summary available.',
        frag: signal.frag,
        fed: signal.fed,
        fragWeight: signal.fragWeight,
        fedWeight: signal.fedWeight,
        countries: extractCountries(combined)
      };
    });
}

function computeMomentum(feed) {
  const totals = feed.reduce(
    (acc, item) => {
      acc.frag += item.fragWeight || 0;
      acc.fed += item.fedWeight || 0;
      return acc;
    },
    { frag: 0, fed: 0 }
  );
  return {
    storyCount: feed.length,
    fragTotal: totals.frag,
    fedTotal: totals.fed
  };
}

function loadExistingFeed() {
  try {
    return JSON.parse(fs.readFileSync(feedPath, 'utf8'));
  } catch {
    return { feedUpdated: getCurrentDateString(), feed: [] };
  }
}

function saveFeed(payload) {
  fs.writeFileSync(feedPath, JSON.stringify(payload, null, 2), 'utf8');
}

function updateDataJs(payload) {
  const dataJs = fs.readFileSync(dataPath, 'utf8');
  const feedText = JSON.stringify(payload.feed, null, 2).replace(/\n/g, '\n    ');
  const replacement = `feedUpdated: "${payload.feedUpdated}",
  feed: ${feedText}
};`;

  const updated = dataJs.replace(
    /feedUpdated:\s*"[^"]*",[\s\S]*?feed:\s*\[[\s\S]*?\]\s*\n\};/,
    replacement
  );

  if (updated === dataJs) {
    // data.js carries the hand-written fallback pool, which has no
    // feedUpdated key to match; the page reads feed.json at runtime and only
    // falls back to data.js when that fetch fails, so this is not an error.
    return;
  }
  fs.writeFileSync(dataPath, updated, 'utf8');
}

async function main() {
  let rawItems = await fetchAllFeeds();

  if (!rawItems.length) {
    // Keep the previous feedUpdated date. Restamping it to today would make
    // the page badge read "Today" over content that was not collected today —
    // the page would claim a freshness it does not have.
    console.warn('No RSS items fetched — keeping existing feed entries and their date.');
    const existing = loadExistingFeed();
    existing.momentum = computeMomentum(existing.feed || []);
    saveFeed(existing);
    updateDataJs(existing);
    return;
  }

  const feed = buildFeedItems(rawItems);
  const payload = {
    feedUpdated: getCurrentDateString(),
    syncedAt: new Date().toISOString(),
    momentum: computeMomentum(feed),
    feed
  };

  saveFeed(payload);
  updateDataJs(payload);

  console.log(`Updated feed with ${feed.length} stories. Momentum — A:${payload.momentum.fragTotal} B:${payload.momentum.fedTotal}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
