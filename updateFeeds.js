const config = require('./config.json');
const { DOMAIN, PRIVKEY_PATH, CERT_PATH, PORT_HTTP, PORT_HTTPS } = config;
const Database = require('better-sqlite3');
const db = new Database('bot-node.db'),
      Parser = require('rss-parser'),
      request = require('request'),
      crypto = require('crypto'),
      parser = new Parser();

// get all feeds from DB
let feeds = db.prepare('select * from feeds').all();

console.log('!!!',feeds.length);

let count = 0;

doFeed();

function doFeed() {
  let feed = feeds[count];
  console.log(count, feed.feed);
  if (feed === undefined) {
    return;
  }
  // fetch new RSS for each feed
  parser.parseURL(feed.feed, function(err, feedData) {
    if (err) {
      console.log('error fetching', feed.feed, err);
      doFeed(++count);
    }
    else {
      //console.log(feedData);
      // get the old feed data from the database
      let oldFeed = JSON.parse(feed.content);

      // compare the feed item contents. if there's one or more whole new items (aka a new item with a unique guid),
      // add the items to a list like
      // [ { items: [], username }, {}, ... ]

      let oldItems = oldFeed.items;
      let newItems = feedData.items;

      // find the difference of the sets of guids (fall back to title or
      // description since guid is not required by spec) in the old and new feeds
      let oldGuidSet = new Set(oldItems.map(el => el.guid || el.title || el.description));
      let newGuidSet = new Set(newItems.map(el => el.guid || el.title || el.description));
      // find things in the new set that aren't in the old set
      let difference = new Set( [...newGuidSet].filter(x => !oldGuidSet.has(x)));
      difference = [...difference];
      
      console.log('diff', feed.feed, difference.length, difference);

      if (difference.length > 0) {
        // get a list of new items in the diff
        let brandNewItems = newItems.filter(el => difference.includes(el.guid) || difference.includes(el.title) || difference.includes(el.description));
        let acct = feed.username;
        let domain = DOMAIN;
        //console.log(acct, brandNewItems);

        // send the message to everyone for each item!
        for (var item of brandNewItems) {
          // FIX THIS
          item = transformContent(item);
          //console.log(item.urls);
          let message = `<p><a href="${item.link}">${item.title}</a></p><p>${item.content}</p>`;
          if (item.enclosure && item.enclosure.url && item.enclosure.url.includes('.mp3')) {
            message += `<p><a href="${item.enclosure.url}">${item.enclosure.url}</a></p>`;
          }
          sendCreateMessage(message, acct, domain, null, null, item);
        }

        // update the DB with new contents
        let content = JSON.stringify(feedData);
        db.prepare('insert or replace into feeds(feed, username, content) values(?, ?, ?)').run(feed.feed, acct, content);
        count = count + 1;
        setTimeout(doFeed, 100);
      }
      else {
        count = count + 1;
        setTimeout(doFeed, 100);
      }
    }
  });
}

// TODO: update the display name of a feed if the feed title has changed

// This is a function with a bunch of custom rules for different kinds of content I've found in the wild in things like Reddit rss feeds. Right now we just use the first image we find, if any.
function transformContent(item) {
  let cheerio = require('cheerio');
  console.log(JSON.stringify(item));
  if (item.content === undefined) {
    item.urls = [];
    return item;
  }
  let $ = cheerio.load(item.content);

  // look through all the links
  let links = $('a');
  let urls = [];
  //console.log('links', links.length);
  links.each((i,e) => {
    let url = $(e).attr('href');
    // if there's an image, add it as a media attachment
    if (url && url.match(/(http)?s?:?(\/\/[^"']*\.(?:png|jpg|jpeg|gif|png|svg))/)) {
      //console.log(url);
      urls.push(url);
    }
  });
  let images = $('img');
  images.each((i,e) => {
    console.log(i,e);
    let url = $(e).attr('src');
    // if there's an image, add it as a media attachment
    if (url && url.match(/(http)?s?:?(\/\/[^"']*\.(?:png|jpg|jpeg|gif|png|svg))/)) {
      //console.log(url);
      urls.push(url);
      // remove the image from the post body since it's in the attachment now
      $(e).remove();
    }
  });

  item.urls = urls;

  // remove multiple line breaks
  $('br').remove();
  $('p').each((i, el) => {
    if($(el).html().replace(/\s|&nbsp;/g, '').length === 0) {$(el).remove();}
  });

  // couple of hacky regexes to make sure we clean up everything
  item.content = $('body').html().replace(/^(\n|\r)/,'').replace(/>\r+</,' ').replace(/  +/g, '');
  item.content = item.content.replace(/^(\n|\r)/,'').replace(/>\r+</,' ').replace(/  +/g, '');
  return item;
}

// for each item in the list, get the account corresponding to the username
//    for each item in the ITEMS list, send a message to all followers

// TODO import these form a helper
function signAndSend(message, name, domain, req, res, targetDomain, inbox) {
  // get the private key
  console.log('sending to ', name, targetDomain, inbox);
  let inboxFragment = inbox.replace('https://'+targetDomain,'');
  let result = db.prepare('select privkey from accounts where name = ?').get(`${name}@${domain}`);
  //console.log('got key', result === undefined, `${name}@${domain}`);
  if (result === undefined) {
    console.log(`No record found for ${name}.`);
  }
  else {
    let privkey = result.privkey;
    const signer = crypto.createSign('sha256');
    let d = new Date();
    let stringToSign = `(request-target): post ${inboxFragment}\nhost: ${targetDomain}\ndate: ${d.toUTCString()}`;
    signer.update(stringToSign);
    signer.end();
    const signature = signer.sign(privkey);
    const signature_b64 = signature.toString('base64');
    let header = `keyId="https://${domain}/u/${name}",headers="(request-target) host date",signature="${signature_b64}"`;
    //console.log('signature:',header);
    request({
      url: inbox,
      headers: {
        'Host': targetDomain,
        'Date': d.toUTCString(),
        'Signature': header
      },
      method: 'POST',
      json: true,
      body: message
    }, function (error, response, body){
    });
  }
}

function createMessage(text, name, domain, item, follower) {
  const guid = crypto.randomBytes(16).toString('hex');
  let d = new Date();

  let out = {
    '@context': 'https://www.w3.org/ns/activitystreams',

    'id': `https://${domain}/${guid}`,
    'type': 'Create',
    'actor': `https://${domain}/u/${name}`,

    'to': [ follower ],

    'object': {
      'id': `https://${domain}/${guid}`,
      'type': 'Note',
      'published': d.toISOString(),
      'attributedTo': `https://${domain}/u/${name}`,
      'content': text,
      'cc': 'https://www.w3.org/ns/activitystreams#Public'
    }
  };

  // add image attachment
  let attachment;
  console.log('NUM IMAGES',item.urls.length);
  if (item.urls.length > 0) {
    attachment = {
      'type': 'Document',
      'mediaType': 'image/png', // TODO: update the mediaType to match jpeg,gif,etc
      'url': item.urls[0],
      'name': null
    };
    out.object.attachment = attachment;
  }
  else if (item.urls.length > 1) {
    attachment = [];
    let lengthFourMax = Math.min(item.urls.length, 4);
    for (var i=0; i<lengthFourMax; i++) {
      attachment.push({
        'type': 'Document',
        'mediaType': 'image/png', // TODO: update the mediaType to match jpeg,gif,etc
        'url': item.urls[i],
        'name': null
      });
    }
    out.object.attachment = attachment;
  }

  return out;
}

function sendCreateMessage(text, name, domain, req, res, item) {
  // console.log(`${name}@${domain}`);
  let result = db.prepare('select followers from accounts where name = ?').get(`${name}@${domain}`);
  let followers = JSON.parse(result.followers);
  // console.log(followers);
  if (!followers) {
    followers = [];
  }
  for (let follower of followers) {
    let inbox = follower+'/inbox';
    let myURL = new URL(follower);
    let targetDomain = myURL.hostname;
    let message = createMessage(text, name, domain, item, follower);
    signAndSend(message, name, domain, req, res, targetDomain, inbox);
  }
}

