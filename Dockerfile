FROM node:10-alpine

RUN apk add --no-cache \
  python2 \
  make \
  g++ 

RUN mkdir /app

COPY ./app /app

RUN cd /app && \
  npm i

COPY ./init.sh /

RUN chmod +x /init.sh

COPY ./init-update.sh /

RUN chmod +x /init-update.sh

COPY ./feed-cron /etc/periodic/15min/

RUN chmod +x /etc/periodic/15min/feed-cron

WORKDIR /app

CMD ["/init.sh"]

