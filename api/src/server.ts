import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createApp } from './app.js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'), quiet: true });

const port = Number(process.env.PORT ?? '3000');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT debe ser un puerto TCP válido');
}
const host = process.env.API_HOST ?? '127.0.0.1';
const app = createApp();
app.listen(port, host, () => {
  console.log(JSON.stringify({ event: 'http.listening', host, port }));
});
