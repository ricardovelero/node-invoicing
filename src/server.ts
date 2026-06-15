import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';

const app = createApp();
const server = createServer(app);

server.listen(env.PORT, () => {
  console.log(`Asentia app listening on http://localhost:${env.PORT}`);
});
