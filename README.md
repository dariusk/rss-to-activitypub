# RSS to ActivityPub Converter

This is a server that lets users convert any RSS feed to an ActivityPub actor that can be followed by users on ActivityPub-compliant social networks like Mastodon.

This is based on my [Express ActivityPub Server](https://github.com/dariusk/express-activitypub), a simple Node/Express server that supports a subset of ActivityPub.

As of the `v2.0.0` release of this project, only users who are authenticated with a particular OAuth server can _create_ feeds. Any federated user can still read the feeds. I implemented this because running this service in the open invited thousands of spammers to create feeds and overwhelm the service. With this new model, you can run this as an added bonus for people in a community like a Mastodon server, and as the person running it you are taking on only the moderation burden of the users you are already responsible for on your federated server.

## Requirements

This requires Node.js v10.10.0 or above.

You also need `beanstalkd` running. This is a simple and fast queueing system we use to manage polling RSS feeds. [Here are installation instructions](https://beanstalkd.github.io/download.html). On a production server you'll want to [install it as a background process](https://github.com/beanstalkd/beanstalkd/tree/master/adm).

You'll also need to control some kind of OAuth provider that you can regsiter this application on. This application was designed to work with Mastodon as that OAuth provider (see more on setting that up below), but any OAuth 2.0 provider should work. Many federated software packages besides Mastodon can act as OAuth providers, and if you want something standalone, [Keycloak](https://www.keycloak.org) and [ORY Hydra](https://github.com/ory/hydra) are two open source providers you could try.

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
  "CERT_PATH": "/path/to/your/ssl/cert.pem",
  "OAUTH": {
    "client_id": "abc123def456",
    "client_secret": "zyx987wvu654",
    "redirect_uri": "https://rss.example.social/convert",
    "domain": "example.social",
    "domain_human": "Example Online Community",
    "authorize_path": "/oauth/authorize",
    "token_path": "/oauth/token",
    "token_verification_path": "/some/path/to/verify/token"
  }
}
```

* `DOMAIN`: your domain! this should be a discoverable domain of some kind like "example.com" or "rss.example.com"
* `PORT_HTTP`: the http port that Express runs on
* `PORT_HTTPS`: the https port that Express runs on
* `PRIVKEY_PATH`: point this to your private key you got from Certbot or similar
* `CERT_PATH`: point this to your cert you got from Certbot or similar
* `OAUTH`: this object contains properties related to OAuth login. See the section below on "Running with OAuth" for more details.
  * `client_id`: also known as the "client key". A long series of characters. You generate this when you register this application with an OAuth provider.
  * `client_secret`: Another long series of characters that you generate when you register this application with an OAuth provider.
  * `redirect_uri`: This is the URI that people get redirected to after they authorize the application on the OAuth server. Must point to the server where THIS service is running, and must point to the `/convert` page. This uri has to match what you put in the application info on the OAuth provider.
  * `domain`: The domain of the OAuth provider. Not necessarily the same as this server (for example, you could host this at rss.mydomain.com and then handle all OAuth through some other server you control, like a Mastodon server).
  * `domain_human`: The human-readable name of the OAuth provider. This will appear in various messages, so if you say "Example Online Community" here then the user will see a message like "Click here to log in via Example Online Community".
  * `authorize_path`: This will generally be `/oauth/authorize/` but you can change it here if your OAuth provider uses a nonstandard authorization path.
  * `token_path`: This will generally be `/oauth/token/` but you can change it here if your OAuth provider uses a nonstandard token path.
  * `token_verification_path`: This should be the path to any URL at the OAuth server that responds with an HTTP status code 200 when you are correctly logged in (and with a non-200 value when you are not). This is the path relative to the `domain` you set, so if your `domain` is `example.social` and you set `token_verification_path` to `/foo/bar/` then the full path that this service will run a GET on to verify you are logged in is `https://example.social/foo/bar`.

Run the server!

`node index.js`

Go to `https://whateveryourdomainis.com:3000/convert` or whatever port you selected for HTTP, and enter an RSS feed and a username. If all goes well it will create a new ActivityPub user with instructions on how to view the user.

## Sending out updates to followers

There is also a file called `queueFeeds.js` that needs to be run on a cron job or similar scheduler. I like to run mine once a minute. It queries every RSS feed in the database to see if there has been a change to the feed. If there is a new post, it sends out the new post to everyone subscribed to its corresponding ActivityPub Actor.

## Running with OAuth

OAuth is unfortunately a bit underspecified so there are a lot of funky implementations out there. Here I will include an example of using a Mastodon server as the OAuth provider. This is how I have my RSS service set up: I run friend.camp as my Mastodon server, and I use my admin powers on friend.camp to register rss.friend.camp as an application. The steps for this, for Mastodon, are:

* log in as an admin user
* go to Preferences
* select Development
* select New Application
* type in an application name, and the URL where this service is running
* type in the redirect URI, which will be whatever base domain this service is running at with the `/convert` path appended. So something like `https://rss.example.social/convert`
* uncheck all scopes, and check `read:accounts` (this is the minimum required access, simply so this RSS converter can confirm someone is truly logged in)
* once you're done, save
* you will now have access to a "client key" and "client secret" for this app.
* open `config.js` in an editor
* fill in `client_id` with the client key, and `client_secret` with the client secret.
* set the `redirect_uri` to be identical to the one you put in Mastodon. It should look like `https://rss.example.social/convert` (the `/convert` part is important, this software won't work if you point to a different path)
* set `domain` to the domain of your Mastodon server, and `domain_human` to its human-friendly name
* leave `authorize_path` and `token_path` on their defaults
* set `token_verification_path` to `/api/v1/accounts/verify_credentials`
* cross your fingers and start up this server

## Local testing

You can use a service like [ngrok](https://ngrok.com/) to test things out before you deploy on a real server. All you need to do is install ngrok and run `ngrok http 3000` (or whatever port you're using if you changed it). Then go to your `config.json` and update the `DOMAIN` field to whatever `abcdef.ngrok.io` domain that ngrok gives you and restart your server.

Then make sure to manually run `updateFeed.js` when the feed changes. I recommend having your own test RSS feed that you can update whenever you want.

## Database

This server uses a SQLite database stored in the file `bot-node.db` to keep track of all the data. To connect directly to the database for debugging, from the root directory of the project, run:

```bash
sqlite3 bot-node.db
```

There are two tables in the database: `accounts` and `feeds`.

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
