FROM node:20-slim

WORKDIR /app

COPY package.json package.json
RUN npm install

COPY tsconfig.json tsconfig.json
COPY src src

RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080

CMD ["npm", "run", "start"]
