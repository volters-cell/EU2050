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

function saveFeed(feed) {
  fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2), 'utf8');
}

function updateDataJs(feed) {
  const dataJs = fs.readFileSync(dataPath, 'utf8');
  
  // Find the section from stats to the end of feed
  const feedSection = dataJs.match(/(\n  \/\/ ---- Aggregate scenario stats[\s\S]*?\n  \},)\n[\s\S]*?(\/\/ ---- Sample AI-generated daily signal feed ----[\s\S]*?\n\s*\]\n\};)/);
  
  if (!feedSection) {
    console.error('Unable to locate feed section in data.js');
    process.exit(1);
  }

  const feedText = JSON.stringify(feed.feed, null, 2)
    .replace(/\n/g, '\n    ');

  const replacement = `${feedSection[1]}\n\n  // ---- Sample AI-generated daily signal feed ----\n  // In production this is regenerated daily by an automated pipeline that\n  // reads EU news/policy documents and tags each story's likely pull on each scenario.\n  feedUpdated: \"${feed.feedUpdated}\",\n  feed: ${feedText}\n};`;

  const updated = dataJs.replace(feedSection[0], replacement);
  fs.writeFileSync(dataPath, updated, 'utf8');
}

function getCurrentDateString() {
  const today = new Date();
  return today.toLocaleDateString('en-GB', { 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  });
}

function main() {
  const feed = loadFeed();
  
  // Update the feedUpdated date to today
  feed.feedUpdated = getCurrentDateString();
  
  // Also update dates in the feed items to today and recent days
  const today = getCurrentDateString();
  
  // Update the most recent feed item to today
  if (feed.feed && feed.feed.length > 0) {
    feed.feed[0].date = today;
    // Update the rest to recent dates
    for (let i = 1; i < Math.min(feed.feed.length, 10); i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      feed.feed[i].date = date.toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
      });
    }
  }
  
  // Save the updated feed back to feed.json
  saveFeed(feed);
  
  // Update data.js with the new feed data
  updateDataJs(feed);
  
  console.log('Updated feed.json and data.js with current date:', today);
}

main();
