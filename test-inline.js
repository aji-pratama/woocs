import fs from 'fs';
import { createServer } from 'vite';

async function run() {
  const server = await createServer({
    root: 'plugin/widget',
    server: { middlewareMode: true }
  });
  const result = await server.transformRequest('/src/styles.css?inline');
  console.log(result.code);
  await server.close();
}
run();
