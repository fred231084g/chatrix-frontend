FROM node:16 AS build

WORKDIR /app

COPY package.json /app/package.json

RUN yarn install

COPY . .

RUN yarn build

FROM nginx:1.21.6

COPY --from=build /app/target/assets /usr/share/nginx/html/assets
