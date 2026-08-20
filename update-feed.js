const fs = require('fs');
const path = require('path');

const feedPath = path.join(__dirname, 'feed.json');
const dataPath = path.join(__dirname, 'data.js');

// Each source carries the publisher's name so collected items can be
// credited on the page. The headlines and summaries below are their words,
// not ours — only the A/B scenario readings are ours.
const RSS_SOURCES = [
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml' },
  { name: 'The New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Europe.xml' },
  { name: 'Euronews', url: 'https://www.euronews.com/rss?level=theme&name=news' }
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
  if (/veto|block|stall|stalls|split|dispute|tension|crisis|slow|delay|uncertain|uneven|fragment|fail|paralysis|divided|deadlock|unilateral|opt-out|withdraw|quits|rejects|refuses|far-right|nationalist|populist|eurosceptic|border check|breakaway|walks out|no deal|collapse of talks/.test(lower)) {
    return {
      frag: 'Reinforces fragmentation',
      fed: 'Delays federal progress',
      fragWeight: 2,
      fedWeight: -1
    };
  }
  if (/agreement|joint|integrat|union|accession|deal|connected|shared|framework|strategy|approves|backs|advances|progress|roadmap|unveils|ratif|harmonis|harmoniz|solidarity|common defence|common defense|defence union|coordinated|eu-wide|bloc-wide|cohesion fund|recovery fund|pact|accord|endorses|expands membership|opens talks/.test(lower)) {
    return {
      frag: 'Highlights the limits of national coordination',
      fed: 'Positive — supports federal integration',
      fragWeight: -1,
      fedWeight: 2
    };
  }
  // Plenty of real European news — a missile strike, an arrest, a domestic
  // row — genuinely does not point either way. Say so once rather than
  // manufacturing a reading for each scenario.
  return {
    frag: '',
    fed: '',
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
    const link = stripHtml((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]);
    if (title) items.push({ title, description, pubDate, link });
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
  for (const source of RSS_SOURCES) {
    try {
      const parsed = await fetchRss(source.url);
      parsed.slice(0, 25).forEach(item => items.push({ ...item, source: source.name }));
    } catch (err) {
      console.warn('Failed to fetch', source.url, err.message);
    }
  }
  return items;
}

// The source feeds are general Europe desks, so they carry sport, crime and
// celebrity stories alongside policy. Attaching a scenario reading to a
// football injury makes the whole feed look unserious, so an item has to
// touch EU policy, institutions, enlargement, economy or security to earn
// one — everything else is dropped rather than labelled "mixed signal".
const RELEVANT = /\beu\b|european union|brussels|european commission|european parliament|european council|eurozone|euro area|schengen|nato|accession|enlargement|candidate status|member state|single market|customs union|treaty|directive|regulation|sanction|tariff|trade deal|defence|defense|rearm|military aid|migration|asylum|border|energy|gas supply|pipeline|subsid|budget|fiscal|inflation|interest rate|central bank|summit|referendum|coalition|parliament approves|prime minister|chancellor|president|election|veto|rule of law|corruption probe|semiconductor|chips act|green deal|net zero|emissions|climate target|artificial intelligence|\bai act\b|digital services|data protection/i;

const IRRELEVANT = /football|soccer|premier league|champions league|bundesliga|la liga|serie a|world cup|euro 202|olympic|tennis|cycling|formula 1|\bf1\b|rugby|cricket|basketball|golf|boxing|athletics|transfer window|goalkeeper|striker|midfielder|manager sacked|celebrity|royal wedding|eurovision|film festival|box office|album|weather forecast|horoscope|recipe|obituary|zoo|panda/i;

// A policy keyword alone is not enough: "Trump tries economic pressure on
// Iran" matches on `sanction`/`president` without saying anything about
// Europe's path. Require a European anchor as well — an EU institution, or
// one of the countries the map already knows about.
function hasEuropeanAnchor(text) {
  const lower = text.toLowerCase();
  if (/\beu\b|european union|european commission|european parliament|european council|eurozone|euro area|schengen|brussels|\beurope\b|european|balkans/.test(lower)) return true;
  return Object.values(COUNTRY_KEYWORDS).some(keywords => keywords.some(kw => lower.includes(kw)));
}

function isRelevant(text) {
  if (IRRELEVANT.test(text)) return false;
  if (!RELEVANT.test(text)) return false;
  return hasEuropeanAnchor(text);
}

// Three feeds covering the same continent report the same events, and a
// wire story gets rewritten as its facts firm up. Comparing headline
// prefixes only caught byte-identical repeats, so one missile strike landed
// in the feed three times: the BBC's first version, its updated death toll,
// and the NYT's wording of the same attack.
const STOPWORDS = new Set(['the','a','an','and','or','but','of','in','on','at','to','for','with','as','by','from','is','are','was','were','be','been','it','its','that','this','after','over','into','out','up','down','his','her','their','they','he','she','who','why','how','what','when','not','no','new','say','says','said','amid','more','than','has','have','had']);

// Light stemming: real headlines alternate killed/kill, election/elections
// and defence/defense across outlets and revisions.
function normaliseToken(word) {
  let w = word.replace(/^ex-/, '').replace(/defens/, 'defenc');
  w = w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '');
  return w;
}

function headlineTokens(title) {
  return new Set(
    title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
      .map(normaliseToken)
  );
}

// Containment against the shorter headline, not Jaccard: the same story told
// in eight words and in sixteen should still register as one story.
function sameStory(a, b) {
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  const smaller = Math.min(a.size, b.size);
  if (!smaller) return false;
  return shared >= 3 && shared / smaller >= 0.5;
}

function dedupeByHeadline(items) {
  const kept = [];
  const keptTokens = [];
  for (const item of items) {
    const title = item.title || item.headline || '';
    if (!title) continue;
    const tokens = headlineTokens(title);
    if (keptTokens.some(seen => sameStory(tokens, seen))) continue;
    kept.push(item);
    keptTokens.push(tokens);
  }
  return kept;
}

function buildFeedItems(rawItems) {
  return dedupeByHeadline(rawItems)
    .filter(item => isRelevant(`${item.title} ${item.description}`))
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
        countries: extractCountries(combined),
        source: item.source || '',
        url: item.link || ''
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

const FEED_MAX = 12;

function sortBySignalStrength(items) {
  const scored = items.map((item, i) => ({ item, i, signal: item.frag && item.fed ? 0 : 1 }));
  scored.sort((a, b) => a.signal - b.signal || a.i - b.i);
  return scored.map(entry => entry.item);
}

function mergeWithExisting(fresh) {
  // Re-filter the carried-over items too, so anything that predates the
  // relevance gate drops out on the next run instead of lingering forever.
  const existing = (loadExistingFeed().feed || [])
    .filter(item => isRelevant(`${item.headline || ''} ${item.ai || ''}`));
  return dedupeByHeadline([...fresh, ...existing]).slice(0, FEED_MAX);
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

  if (!feed.length) {
    console.warn('Fetched items but none were EU-relevant — keeping the existing feed.');
    const existing = loadExistingFeed();
    existing.momentum = computeMomentum(existing.feed || []);
    saveFeed(existing);
    updateDataJs(existing);
    return;
  }

  // Roll today's relevant stories in on top of the ones already published
  // rather than replacing the feed wholesale. Filtering out sport and
  // celebrity news means a quiet day can yield only two or three items, and
  // a straight replacement would throw away the rest of the week with them.
  // Stories that actually carry a scenario reading lead the list; the ones
  // that point neither way stay available behind "See more". Without this a
  // quiet news day fills the visible rows with "no clear signal", which
  // makes the section look broken rather than honest.
  const merged = sortBySignalStrength(mergeWithExisting(feed));

  const payload = {
    feedUpdated: getCurrentDateString(),
    syncedAt: new Date().toISOString(),
    momentum: computeMomentum(merged),
    feed: merged
  };

  saveFeed(payload);
  updateDataJs(payload);

  console.log(`Updated feed with ${feed.length} stories. Momentum — A:${payload.momentum.fragTotal} B:${payload.momentum.fedTotal}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
