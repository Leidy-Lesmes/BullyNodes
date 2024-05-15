FROM node:18-bullseye

ENV PORT=5020

WORKDIR /app

COPY . .

RUN npm install

EXPOSE $PORT
EXPOSE $NODE_SERVICE_IP

CMD ["npm", "start"]
