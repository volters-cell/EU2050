// Daily feed updater, run by .github/workflows/update-feed.yml.
//
// Maintains feed.json only. The app now fetches feed.json directly at runtime
// (loadFeedData() in app.js), so the feed no longer needs to be inlined into
// data.js. Keeping the feed in one place removes the regex-based source rewrite
// that silently no-op'd whenever data.js formatting changed.
const fs = require('fs');
const path = require('path');

const feedPath = path.join(__dirname, 'feed.json');

function loadFeed() {
  try {
    return JSON.parse(fs.readFileSync(feedPath, 'utf8'));
  } catch (err) {
    console.error('Unable to read feed.json:', err.message);
    process.exit(1);
  }
}

function saveFeed(feed) {
  fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2) + '\n', 'utf8');
}

function dateStr(d) {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function main() {
  const feed = loadFeed();

  // Slide the most recent items' dates forward so the feed always reads as
  // recent relative to the run day. The headline text itself is curated, so we
  // only touch dates here.
  const today = dateStr(new Date());

  if (feed.feed && feed.feed.length > 0) {
    feed.feed[0].date = today;
    for (let i = 1; i < Math.min(feed.feed.length, 10); i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      feed.feed[i].date = dateStr(d);
    }
  }

  feed.feedUpdated = today;

  saveFeed(feed);
  console.log('Updated feed.json with current date:', today);
}

main();
