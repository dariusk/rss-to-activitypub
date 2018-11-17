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
    name = `${name}@${domain}`;
    let result = db.prepare('select actor from accounts where name = ?').get(name);
    if (result === undefined) {
      return res.status(404).json(`No record found for ${name}.`);
    }
    else if (req.headers.accept && (req.headers.accept.includes('application/activity+json') || req.headers.accept.includes('application/json') || req.headers.accept.includes('application/json+ld'))) {
      res.json(JSON.parse(result.actor));
    }
    else {
      let actor = JSON.parse(result.actor);
      let username = name.replace('@'+domain,'');
      let content = db.prepare('select content from feeds where username = ?').get(username);
      if (content === undefined) {
        return res.status(404).json(`Something went very wrong!`);
      }
      let feedData = JSON.parse(content.content);
      let imageUrl = null;
      // if image exists set image
      if (actor.icon && actor.icon.url) {
        imageUrl = actor.icon.url;
      }
      res.render('user', { displayName: actor.name, items: feedData.items, accountName: '@'+name, imageUrl: imageUrl });
    }
  }
});

module.exports = router;
