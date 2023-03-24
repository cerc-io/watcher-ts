FROM node:18.15.0-alpine3.16

WORKDIR /app

COPY . .

RUN apk --update --no-cache add git && yarn
