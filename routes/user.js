'use strict';
const express = require('express'),
      router = express.Router();

router.get('/:name', function (req, res) {
  let name = req.params.name;
  if (!name) {
    return res.status(400).send('Bad request.');
  }
  else {
    let db = req.app.get('db');
    let domain = req.app.get('domain');
    let username = name;
    name = `${name}@${domain}`;
    let result = db.prepare('select actor from accounts where name = ?').get(name);
    if (result === undefined) {
      return res.status(404).json(`No record found for ${name}.`);
    }
    else if (req.headers.accept && (req.headers.accept.includes('application/activity+json') || req.headers.accept.includes('application/json') || req.headers.accept.includes('application/json+ld'))) {
      let tempActor = JSON.parse(result.actor);
      // Added this followers URI for Pleroma compatibility, see https://github.com/dariusk/rss-to-activitypub/issues/11#issuecomment-471390881
      // New Actors should have this followers URI but in case of migration from an old version this will add it in on the fly
      if (tempActor.followers === undefined) {
        tempActor.followers = `https://${domain}/u/${username}/followers`;
      }
      res.json(tempActor);
    }
    else {
      let actor = JSON.parse(result.actor);
      let resultFeed = db.prepare('select content, feed from feeds where username = ?').get(username);
      if (resultFeed === undefined) {
        return res.status(404).json(`Something went very wrong!`);
      }
      let feedData = JSON.parse(resultFeed.content);
      let feedUrl = resultFeed.feed;
      let imageUrl = null;
      // if image exists set image
      if (actor.icon && actor.icon.url) {
        imageUrl = actor.icon.url;
      }
      let description = null;
      if (actor.summary) {
        description = actor.summary;
      }
      res.render('user', { displayName: actor.name, items: feedData.items, accountName: '@'+name, imageUrl: imageUrl, description, feedUrl });
    }
  }
});

router.get('/:name/followers', function (req, res) {
  let name = req.params.name;
  if (!name) {
    return res.status(400).send('Bad request.');
  }
  else {
    let db = req.app.get('db');
    let domain = req.app.get('domain');
    let result = db.prepare('select followers from accounts where name = ?').get(`${name}@${domain}`);
    let followers = JSON.parse(result.followers);
    // console.log(followers);
    if (!followers) {
      followers = [];
    }
    let followersCollection = {
      "type":"OrderedCollection",
      "totalItems":followers.length,
      "id":`https://${domain}/u/${name}/followers`,
      "first": {
        "type":"OrderedCollectionPage",
        "totalItems":followers.length,
        "partOf":`https://${domain}/u/${name}/followers`,
        "orderedItems": followers,
        "id":`https://${domain}/u/${name}/followers?page=1`
      },
      "@context":["https://www.w3.org/ns/activitystreams"]
    };
    res.json(followersCollection);
    //res.json(JSON.parse(result.actor));
  }
});

module.exports = router;
