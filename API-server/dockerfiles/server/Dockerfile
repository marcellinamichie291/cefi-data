FROM node:14 as base

WORKDIR /home/node/app
COPY ./configs/server/package*.json ./
RUN npm i -g ts-node
RUN npm i -g typescript
RUN npm i


FROM base as production

ENV NODE_PATH=./build

RUN npm run build
