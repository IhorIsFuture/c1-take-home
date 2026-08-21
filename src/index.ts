import http from 'node:http';
import express from 'express';
import { config } from './config';
import { connectMysql } from './db/mysql';
import { connectMongo } from './db/mongo';
import { errorHandler } from './middleware/error-handler';
import { apiRouter } from './routes/index';
import { attachWs } from './ws/hub';

const app = express();
app.use(express.json());
app.use(express.static('web'));
app.use('/api', apiRouter);
app.use(errorHandler);

const server = http.createServer(app);
attachWs(server);

await connectMysql();
await connectMongo();

server.listen(config.port, () => {
  console.log(`relay listening on :${config.port}`);
});
