FROM node:8

MAINTAINER <ale-batt albert.lebatteux@gmail.com>

ADD . /app

WORKDIR /app

RUN npm install --loglevel=warn

ENTRYPOINT ["./bin/coin-hive-stratum"]
