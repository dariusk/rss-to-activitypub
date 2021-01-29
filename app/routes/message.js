'use strict';
const express = require('express'),
      router = express.Router(),
      Parser = require('rss-parser'),
      parser = new Parser();

router.get('/:guid', function (req, res) {
  let guid = req.params.guid;
  if (!guid) {
    return res.status(400).send('Bad request.');
  }
  // render the raw JSON if JSON headers are passed
  else if (req.headers.accept && (req.headers.accept.includes('application/activity+json') || req.headers.accept.includes('application/json') || req.headers.accept.includes('application/json+ld'))) {
    let db = req.app.get('db');
    let result = db.prepare('select message from messages where guid = ?').get(guid);
    if (result === undefined) {
      return res.status(404).send(`No record found for ${guid}.`);
    }
    else {
      res.json(JSON.parse(result.message));
    }
  }
  // render a human-friendly view otherwise
  else {
    let db = req.app.get('db');
    let result = db.prepare('select message from messages where guid = ?').get(guid);
    if (result === undefined) {
      return res.status(404).send(`No record found for ${guid}.`);
    }
    else {
      let message = JSON.parse(result.message);
      let domain = req.app.get('domain');
      let username = message.attributedTo.replace(`https://${domain}/u/`,'');
      let resultFeed = db.prepare('select feed from feeds where username = ?').get(username);
      if (resultFeed === undefined) {
        return res.status(404).json(`Something went very wrong!`);
      }
      let feed = resultFeed.feed;
      res.render('message', { description: message.content, feedUrl: feed, author: message.attributedTo, link: message.link});
    }
  }
});

module.exports = router;
