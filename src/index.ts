import http from 'node:http';
import express from 'express';
import { config } from './config';
import { connectMysql } from './db/mysql';
import { connectMongo } from './db/mongo';
import { errorHandler } from './middleware/error-handler';
import { conversationRepository } from './repositories/conversation-repository';
import { apiRouter } from './routes/index';
import { verifyAccessToken } from './security/access-token';
import { attachWs } from './ws/hub';

const app = express();
app.use(express.json());
app.use(express.static('web'));
app.use('/api', apiRouter);
app.use(errorHandler);

const server = http.createServer(app);
attachWs(server, {
  verifyAccessToken,
  canAccessConversations: (userId, conversationIds) =>
    conversationRepository.hasAccessToAll(userId, conversationIds)
});

await connectMysql();
await connectMongo();

server.listen(config.port, () => {
  console.log(`relay listening on :${config.port}`);
});
