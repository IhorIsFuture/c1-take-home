FROM node:22.23.2-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/index.ts"]
