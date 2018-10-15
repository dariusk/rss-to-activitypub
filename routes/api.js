'use strict';
const express = require('express'),
      router = express.Router(),
      crypto = require('crypto'),
      Parser = require('rss-parser'),
      generateRSAKeypair = require('generate-rsa-keypair');

router.get('/convert', function (req, res) {
  let db = req.app.get('db');
  console.log(req.query);
  let username = req.query.username;
  let feed = req.query.feed;
  // reject if username is invalid
  if (username.match(/^[a-zA-Z0-9_]+$/) === null) {
    return res.status(400).json('Invalid username! Only alphanumerics and underscore (_) allowed.');
  }
  // check to see if feed exists
  let result = db.prepare('select * from feeds where feed = ? or username = ?').get(feed, username);
  // see if we already have an entry for this feed
  if (result) {
    // return feed
    res.status(200).json(result);
  }
  else if(feed && username) {
    console.log('VALIDATING');
    // validate the RSS
    let parser = new Parser();
    parser.parseURL(feed, function(err, feedData) {
      if (err) {
        res.status(400).json({err: err.message});
      }
      else {
        console.log(feedData.title);
        console.log('end!!!!');
        res.status(200).json(feedData);
        let displayName = feedData.title;
        let account = username;
        // create new user
        let db = req.app.get('db');
        let domain = req.app.get('domain');
        // create keypair
        var pair = generateRSAKeypair();
        let imageUrl = null;
        // if image exists set image
        if (feedData.image && feedData.image.url) {
          imageUrl = feedData.image.url;
        }
        let actorRecord = createActor(account, domain, pair.public, displayName, imageUrl);
        let webfingerRecord = createWebfinger(account, domain);
        const apikey = crypto.randomBytes(16).toString('hex');
        db.prepare('insert or replace into accounts(name, actor, apikey, pubkey, privkey, webfinger) values(?, ?, ?, ?, ?, ?)').run( `${account}@${domain}`, apikey, pair.public, pair.private, JSON.stringify(actorRecord), JSON.stringify(webfingerRecord));
        let content = JSON.stringify(feedData);
        db.prepare('insert or replace into feeds(feed, username, content) values(?, ?, ?)').run( feed, username, content);
      }
    });
  }
  else {
    res.status(404).json({msg: 'unknown error'});
  }
});

function createActor(name, domain, pubkey, displayName, imageUrl) {
  displayName = displayName || name;
  let actor =  {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1'
    ],

    'id': `https://${domain}/u/${name}`,
    'type': 'Person',
    'preferredUsername': `${name}`,
    'inbox': `https://${domain}/api/inbox`,
    'name': displayName,
    'publicKey': {
      'id': `https://${domain}/u/${name}#main-key`,
      'owner': `https://${domain}/u/${name}`,
      'publicKeyPem': pubkey
    }
  };
  if (imageUrl) {
    actor.icon = {
      'type': 'Image',
      'mediaType': 'image/png',
      'url': imageUrl,
    };
  }
  return actor;
}

function createWebfinger(name, domain) {
  return {
    'subject': `acct:${name}@${domain}`,

    'links': [
      {
        'rel': 'self',
        'type': 'application/activity+json',
        'href': `https://${domain}/u/${name}`
      }
    ]
  };
}

module.exports = router;
