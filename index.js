const config = require('./config.json');
const { DOMAIN, PRIVKEY_PATH, CERT_PATH, PORT_HTTP, PORT_HTTPS } = config;
const express = require('express');
const app = express();
const Database = require('better-sqlite3');
const db = new Database('bot-node.db');
const fs = require('fs');
const routes = require('./routes'),
      bodyParser = require('body-parser'),
      cors = require('cors'),
      http = require('http');
let sslOptions;

try {
  sslOptions = {
    key: fs.readFileSync(PRIVKEY_PATH),
    cert: fs.readFileSync(CERT_PATH)
  };
} catch(err) {
  if (err.errno === -2) {
    console.log('No SSL key and/or cert found, not enabling https server');
  }
  else {
    console.log(err);
  }
}

// if there is no `accounts` table in the DB, create an empty table
db.prepare('CREATE TABLE IF NOT EXISTS accounts (name TEXT PRIMARY KEY, privkey TEXT, pubkey TEXT, webfinger TEXT, actor TEXT, apikey TEXT, followers TEXT, messages TEXT)').run();
// if there is no `feeds` table in the DB, create an empty table
db.prepare('CREATE TABLE IF NOT EXISTS feeds (feed TEXT PRIMARY KEY, username TEXT, content TEXT)').run();

app.set('db', db);
app.set('domain', DOMAIN);
app.set('port', process.env.PORT || PORT_HTTP);
app.set('port-https', process.env.PORT_HTTPS || PORT_HTTPS);
app.set('views', './views');
app.set('view engine', 'pug');
app.use(bodyParser.json({type: 'application/activity+json'})); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

app.get('/', (req, res) => res.render('home'));

// admin page
app.options('/api', cors());
app.use('/api', cors(), routes.api);
app.use('/admin', express.static('public/admin'));
app.use('/convert', express.static('public/convert'));
app.use('/.well-known/webfinger', cors(), routes.webfinger);
app.use('/u', cors(), routes.user);
app.use('/api/inbox', cors(), routes.inbox);

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
