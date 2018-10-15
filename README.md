# RSS to ActivityPub Converter

This is a server that lets users convert any RSS feed to an ActivityPub actor that can be followed by users on ActivityPub-compliant social networks like Mastodon. For a demo of this in action, see https://bots.tinysubversions.com/convert/

## Requirements

This requires Node.js v10.10.0 or above.

## Installation

Clone the repository, then `cd` into its root directory. Install dependencies:

`npm i`

Then copy `config.json.template` to `config.json`:

`cp config.json.template config.json`

Update your new `config.json` file:

```js
{
  "DOMAIN": "mydomain.com",
  "PORT_HTTP": "3000",
  "PORT_HTTPS": "8443",
  "PRIVKEY_PATH": "/path/to/your/ssl/privkey.pem",
  "CERT_PATH": "/path/to/your/ssl/cert.pem"
}
```

* `DOMAIN`: your domain! this should be a discoverable domain of some kind like "example.com" or "rss.example.com"
* `PORT_HTTP`: the http port that Express runs on
* `PORT_HTTPS`: the https port that Express runs on
* `PRIVKEY_PATH`: point this to your private key you got from Certbot or similar
* `CERT_PATH`: point this to your cert you got from Certbot or similar

Run the server!

`node index.js`

Go to `https://whateveryourdomainis.com:3000/convert` or whatever port you selected for HTTP, and enter an RSS feed and a username. If all goes well it will create a new ActivityPub user with instructions on how to view the user.

## Sending out updates to followers

There is also a file called `updateFeeds.js` that needs to be run on a cron job or similar scheduler. I like to run mine once a minute. It queries every RSS feed in the database to see if there has been a change to the feed. If there is a new post, it sends out the new post to everyone subscribed to its corresponding ActivityPub Actor.

## Local testing

You can use a service like [ngrok](https://ngrok.com/) to test things out before you deploy on a real server. All you need to do is install ngrok and run `ngrok http 3000` (or whatever port you're using if you changed it). Then go to your `config.json` and update the `DOMAIN` field to whatever `abcdef.ngrok.io` domain that ngrok gives you and restart your server.

Then make sure to manually run `updateFeed.js` when the feed changes. I recommend having your own test RSS feed that you can update whenever you want.

## Database

This server uses a SQLite database to keep track of all the data. There are two tables in the database: `accounts` and `feeds`.

### `accounts`

This table keeps track of all the data needed for the accounts. Columns:

* `name` `TEXT PRIMARY KEY`: the account name, in the form `thename@example.com`
* `privkey` `TEXT`: the RSA private key for the account
* `pubkey` `TEXT`: the RSA public key for the account
* `webfinger` `TEXT`: the entire contents of the webfinger JSON served for this account
* `actor` `TEXT`: the entire contents of the actor JSON served for this account
* `apikey` `TEXT`: the API key associated with this account
* `followers` `TEXT`: a JSON-formatted array of the URL for the Actor JSON of all followers, in the form `["https://remote.server/users/somePerson", "https://another.remote.server/ourUsers/anotherPerson"]`
* `messages` `TEXT`: not yet used but will eventually store all messages so we can render them on a "profile" page

### `feeds`

This table keeps track of all the data needed for the feeds. Columns:

* `feed` `TEXT PRIMARY KEY`: the URI of the RSS feed
* `username` `TEXT`: the username associated with the RSS feed
* `content` `TEXT`: the most recent copy fetched of the RSS feed's contents

## License

Copyright (c) 2018 Darius Kazemi. Licensed under the MIT license.
