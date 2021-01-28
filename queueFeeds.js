const Database = require('better-sqlite3');
const db = new Database('data/bot-node.db');
const Jackd = require('jackd');
const beanstalkd = new Jackd();


async function foo() {

  // get all feeds from DB
  let feeds = db.prepare('select feed from feeds').all();

  console.log('!!!',feeds.length);

  let count = 0;

  await beanstalkd.connect()

  for (feed of feeds) {
    await beanstalkd.put(feed.feed)
  }

  await beanstalkd.disconnect()

}

foo()
