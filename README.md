# rss-to-activitypub
An RSS to ActivityPub converter.


To build:
just run:
```
docker build -t rss-to-activity-pub .
```
and then
docker-compose up

docker-compose.yml is example for version with Treafik reverse proxy
also edit app/views/home.pug couse is our rebranded version for rss.fediwersum.pl 
