const config = require('./config.json');
const { DOMAIN, PRIVKEY_PATH, CERT_PATH, PORT_HTTP, PORT_HTTPS } = config;
const Database = require('better-sqlite3');
const db = new Database('bot-node.db'),
      Parser = require('rss-parser'),
      request = require('request'),
      crypto = require('crypto'),
      parser = new Parser({timeout: 2000});

const Jackd = require('jackd');
const beanstalkd = new Jackd();

beanstalkd.connect()

async function processQueue() {
  while (true) {
    try {
      const { id, payload } = await beanstalkd.reserve()
      /* ... process job here ... */
      await beanstalkd.delete(id)
      await doFeed(payload)
    } catch (err) {
      // Log error somehow
      console.error(err)
    }
  }
}

processQueue()

function doFeed(feedUrl) {
return new Promise((resolve, reject) => {
  // fetch new RSS for each feed
  parser.parseURL(feedUrl, function(err, feedData) {
    if (err) {
      reject('error fetching ' + feedUrl + '; ' + err);
    }
    else {
      let feed = db.prepare('select * from feeds where feed = ?').get(feedUrl);
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

        // send the message to everyone for each item!
        for (var item of brandNewItems) {
          item = transformContent(item);

          let message;
          if(item.link.match('/twitter.com/')) {
             message = `${item.content}`;
          }
          else {
             message = `<p><a href="${item.link}">${item.title}</a></p><p>${item.content || ''}</p>`;
          }

          if (item.enclosure && item.enclosure.url && item.enclosure.url.includes('.mp3')) {
            message += `<p><a href="${item.enclosure.url}">${item.enclosure.url}</a></p>`;
          }
          sendCreateMessage(message, acct, domain, null, null, item);
        }

        // update the DB with new contents
        let content = JSON.stringify(feedData);
        db.prepare('insert or replace into feeds(feed, username, content) values(?, ?, ?)').run(feed.feed, acct, content);
        return resolve('done with ' + feedUrl)
      }
      else {
        return resolve('done with ' + feedUrl + ', no change')
      }
    }
  });
}).catch((e) => console.log(e));
}

// TODO: update the display name of a feed if the feed title has changed

// This is a function with a bunch of custom rules for different kinds of content I've found in the wild in things like Reddit rss feeds. Right now we just use the first image we find, if any.
function transformContent(item) {
  let cheerio = require('cheerio');
  if (item.content === undefined) {
    item.urls = [];
    return item;
  }
  let $ = cheerio.load(item.content);

  // look through all the links to find images
  let links = $('a');
  let urls = [];
  links.each((i,e) => {
    let url = $(e).attr('href');
    // if there's an image, add it as a media attachment
    if (url && url.match(/(http)?s?:?(\/\/[^"']*\.(?:png|jpg|jpeg|gif|png|svg))/)) {
      urls.push(url);
    }
  });

  // look through all the images
  let images = $('img');
  images.each((i,e) => {
    let url = $(e).attr('src');
    // if there's an image, add it as a media attachment
    if (url) {
      urls.push(url);
      // remove the image from the post body since it's in the attachment now
      $(e).remove();
    }
  });

  item.urls = urls;

  // find iframe embeds and turn them into links
  let iframes = $('iframe');
  iframes.each((i,e) => {
    let url = $(e).attr('src');
    $(e).replaceWith($(`<a href="${url}">[embedded content]</a>`));
  });


  // remove multiple line breaks
  //$('br').remove();
  $('p').each((i, el) => {
    if($(el).html().replace(/\s|&nbsp;/g, '').length === 0) {$(el).remove();}
  });

  // couple of hacky regexes to make sure we clean up everything
  item.content = $('body').html().replace(/^(\n|\r)/g,'').replace(/>\r+</g,'><').replace(/  +/g, '');
  item.content = item.content.replace(/^(\n|\r)/g,'').replace(/>\r+</g,'><').replace(/>\s*</g,'><').replace(/&#x200B;/g,'').replace(/>\u200B+</g,'><').replace(/  +/g, '').replace(/<p><\/p>/g,'').replace(/(<br\/?>)+/g,'<br>');
  return item;
}

// for each item in the list, get the account corresponding to the username
//    for each item in the ITEMS list, send a message to all followers

// TODO import these form a helper
function signAndSend(message, name, domain, req, res, targetDomain, inbox) {
  // get the private key
  let inboxFragment = inbox.replace('https://'+targetDomain,'');
  let result = db.prepare('select privkey from accounts where name = ?').get(`${name}@${domain}`);
  if (result === undefined) {
    console.log(`No record found for ${name}.`);
  }
  else {
    // digest
    const digest = crypto.createHash('sha256').update(JSON.stringify(message)).digest('base64');

    let privkey = result.privkey;
    const signer = crypto.createSign('sha256');
    let d = new Date();
    let stringToSign = `(request-target): post ${inboxFragment}\nhost: ${targetDomain}\ndate: ${d.toUTCString()}\ndigest: SHA-256=${digest}`;
    signer.update(stringToSign);
    signer.end();
    const signature = signer.sign(privkey);
    const signature_b64 = signature.toString('base64');
    const algorithm = 'rsa-sha256';
    let header = `keyId="https://${domain}/u/${name}",algorithm="${algorithm}",headers="(request-target) host date digest",signature="${signature_b64}"`;
    request({
      url: inbox,
      headers: {
        'Host': targetDomain,
        'Date': d.toUTCString(),
        'Signature': header,
        'Digest': `SHA-256=${digest}`,
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json'
      },
      method: 'POST',
      json: true,
      body: message
    }, function (error, response, body){
    });
  }
}

function createMessage(text, name, domain, item, follower, guidNote) {
  const guidCreate = crypto.randomBytes(16).toString('hex');
  let d = new Date();

  let out = {
    '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
    'id': `https://${domain}/m/${guidCreate}`,
    'type': 'Create',
    'actor': `https://${domain}/u/${name}`,

    'to': [ follower ],

    'object': {
      'id': `https://${domain}/m/${guidNote}`,
      'type': 'Note',
      'published': d.toISOString(),
      'attributedTo': `https://${domain}/u/${name}`,
      'content': text,
      'link': item.link,
      'cc': 'https://www.w3.org/ns/activitystreams#Public'
    }
  };

  // add image attachment
  let attachment;
  if (item.enclosure && item.enclosure.url && item.enclosure.url.includes('.mp3')) {
    attachment = {
      'type': 'Document',
      'mediaType': 'audio/mpeg',
      'url': item.enclosure.url,
      'name': null
    };
    out.object.attachment = attachment;
  }
  else if (item.urls.length > 0) {
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

  db.prepare('insert or replace into messages(guid, message) values(?, ?)').run( guidCreate, JSON.stringify(out));
  db.prepare('insert or replace into messages(guid, message) values(?, ?)').run( guidNote, JSON.stringify(out.object));

  return out;
}

function sendCreateMessage(text, name, domain, req, res, item) {
  let result = db.prepare('select followers from accounts where name = ?').get(`${name}@${domain}`);
  let followers = JSON.parse(result.followers);
  const guidNote = crypto.randomBytes(16).toString('hex');
  if (!followers) {
    followers = [];
  }
  for (let follower of followers) {
    let inbox = follower+'/inbox';
    let myURL = new URL(follower);
    let targetDomain = myURL.hostname;
    let message = createMessage(text, name, domain, item, follower, guidNote);
    signAndSend(message, name, domain, req, res, targetDomain, inbox);
  }
}

