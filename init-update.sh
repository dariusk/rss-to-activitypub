#!/bin/sh

cd /app

cp config.json.template config.json

if [[ ! -z ${DOMAIN+x} ]]; then
  sed -i "s/\"DOMAIN\": \"\"/\"DOMAIN\": \"${DOMAIN}\"/g" config.json
else
  echo 'Env var $DOMAIN is not set. Set it before starting the container'
  exit 1
fi

if [[ ! -z ${PORT_HTTP+x} ]]; then
  sed -i "s/\"PORT_HTTP\": \"3000\"/\"PORT_HTTP\": \"${PORT_HTTP}\"/g" config.json
fi

if [[ ! -z ${PORT_HTTPS+x} ]]; then
  sed -i "s/\"PORT_HTTPS\": \"8443\"/\"PORT_HTTPS\": \"${PORT_HTTPS}\"/g" config.json
fi

if [[ ! -z ${PRIVKEY_PATH+x} ]]; then
  sed -i "s@\"PRIVKEY_PATH\": \"\"@\"PRIVKEY_PATH\": \"${PRIVKEY_PATH}\"@g" config.json
fi

if [[ ! -z ${CERT_PATH+x} ]]; then
  sed -i "s@\"CERT_PATH\": \"\"@\"CERT_PATH\": \"${CERT_PATH}\"@g" config.json
fi

echo "Configuration file :"

cat config.json


node updateFeeds.js

