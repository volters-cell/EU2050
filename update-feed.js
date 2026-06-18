const fs = require('fs');
const path = require('path');

const feedPath = path.join(__dirname, 'feed.json');
const dataPath = path.join(__dirname, 'data.js');

function loadFeed() {
  try {
    return JSON.parse(fs.readFileSync(feedPath, 'utf8'));
  } catch (err) {
    console.error('Unable to read feed.json:', err.message);
    process.exit(1);
  }
}

function updateDataJs(feed) {
  const dataJs = fs.readFileSync(dataPath, 'utf8');
  const feedSection = dataJs.match(/\/\/ ---- Sample AI-generated daily signal feed ----[\s\S]*?\n\s*\]\n\};/);
  if (!feedSection) {
    console.error('Unable to locate feed section in data.js');
    process.exit(1);
  }

  const feedText = JSON.stringify(feed.feed, null, 2)
    .replace(/\n/g, '\n    ');

  const replacement = `// ---- Sample AI-generated daily signal feed ----\n  // In production this is regenerated daily by an automated pipeline that\n  // reads EU news/policy documents and tags each story's likely pull on each scenario.\n  feedUpdated: \"${feed.feedUpdated}\",\n  feed: ${feedText}\n};`;

  const updated = dataJs.replace(feedSection[0], replacement);
  fs.writeFileSync(dataPath, updated, 'utf8');
}

function main() {
  const feed = loadFeed();
  updateDataJs(feed);
  console.log('Updated data.js with newest feed data.');
}

main();
