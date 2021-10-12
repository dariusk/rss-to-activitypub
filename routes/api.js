'use strict';
const express = require('express'),
      router = express.Router(),
      cors = require('cors'),
      crypto = require('crypto'),
      request = require('request'),
      Parser = require('rss-parser'),
      parseFavicon = require('parse-favicon').parseFavicon,
      generateRSAKeypair = require('generate-rsa-keypair'),
      oauth = require('../config.json').OAUTH;

router.get('/request-token', cors(), (req, res) => {
  if (!oauth) {
    return res.status(501).json({message: `OAuth is not enabled on this server.`});
  }
  else if (!oauth.client_id || !oauth.client_secret || !oauth.redirect_uri) {
    return res.status(501).json({message: `OAuth is misconfigured on this server. Please contact the admin at ${contactEmail} and let them know.`});
  }
  else if (!req.query.code) {
    return res.status(400).json({message: `Request is missing the required 'code' parameter.`});
  }

  let params = req.query;
  params.client_id = oauth.client_id;
  params.client_secret = oauth.client_secret;
  params.redirect_uri = oauth.redirect_uri;
  params.grant_type = 'authorization_code';
  request.post(`https://${oauth.domain}${oauth.token_path}`, {form: params}, (err,httpResponse,body) => {
    body = JSON.parse(body);
    if (body.access_token) {
      return res.json({ access_token: body.access_token, domain: oauth.domain});
    }
    else {
      return res.status(401).json(body);
    }
  });
});

// if oauth is enabled, this function checks to see if we've been sent an access token and validates it with the server
// otherwise we simply skip verification
function isAuthenticated(req, res, next) {
  if (oauth) {
    request.get({
      url: `https://${oauth.domain}${oauth.token_verification_path}`,
      headers: {
        'Authorization': `Bearer ${req.query.token}`
      },
    }, (err, resp, body) => {
      if (resp.statusCode === 200) {
        return next();
      }
      else {
        res.redirect('/');
      }
    });
  }
  else {
    return next();
  }
}

router.get('/convert', isAuthenticated, function (req, res) {
  let db = req.app.get('db');
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
    // validate the RSS
    let parser = new Parser();
    parser.parseURL(feed, function(err, feedData) {
      if (err) {
        if (err.message === 'Status code 400') {
          err.message = `That doesn't look like a valid RSS feed. Check <a href="${feed}">the URL you provided</a> in a feed validator. You can <a href="https://validator.w3.org/feed/check.cgi?url=${feed}" target="_blank">click here</a> to pop up a test immediately.`
        }
        res.status(400).json({err: err.message});
      }
      else {
        res.status(200).json(feedData);
        let displayName = feedData.title;
        let description = feedData.description;
        let account = username;
        // create new user
        let db = req.app.get('db');
        let domain = req.app.get('domain');
        // create keypair
        var pair = generateRSAKeypair();
        getImage(feed, feedData, imageUrl => {
          let actorRecord = createActor(account, domain, pair.public, displayName, imageUrl, description);
          let webfingerRecord = createWebfinger(account, domain);
          const apikey = crypto.randomBytes(16).toString('hex');
          db.prepare('insert or replace into accounts(name, actor, apikey, pubkey, privkey, webfinger) values(?, ?, ?, ?, ?, ?)').run( `${account}@${domain}`, JSON.stringify(actorRecord), apikey, pair.public, pair.private, JSON.stringify(webfingerRecord));
          let content = JSON.stringify(feedData);
          db.prepare('insert or replace into feeds(feed, username, content) values(?, ?, ?)').run( feed, username, content);
        });
      }
    });
  }
  else {
    res.status(404).json({msg: 'unknown error'});
  }
});

function getImage(feed, feedData, cb) {
  let imageUrl = null;
  // if image exists set image
  if (feedData.image && feedData.image.url) {
    imageUrl = feedData.image.url;
    return cb(imageUrl);
  }
  // otherwise parse the HTML for the favicon
  else {
    let favUrl = new URL(feed);
    request(favUrl.origin, (err, resp, body) => {
      parseFavicon(body, {baseURI: favUrl.origin}).then(result => {
        if (result && result.length) {
          return cb(result[0].url);
        }
        else {
          return cb(null);
        }
      });
    });
  }
}

function createActor(name, domain, pubkey, displayName, imageUrl, description) {
  displayName = displayName || name;
  let actor =  {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1'
    ],
    'id': `https://${domain}/u/${name}`,
    'type': 'Service',
    'preferredUsername': `${name}`,
    'inbox': `https://${domain}/api/inbox`,
    'followers': `https://${domain}/u/${name}/followers`,
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
  if (description) {
    actor.summary = `<p>${description}</p>`;
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
