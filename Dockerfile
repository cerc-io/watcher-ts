FROM node:15.3.0-alpine3.10

WORKDIR /app

COPY . .

RUN apk --update --no-cache add git && yarn

