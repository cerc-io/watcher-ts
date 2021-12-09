FROM node:16.13.1-alpine3.14

WORKDIR /app

COPY . .

RUN apk --update --no-cache add git && yarn

