import { fileURLToPath } from 'node:url';
import { startStaticServer } from '../tests/helpers/static-server.mjs';
const server = await startStaticServer({ root: fileURLToPath(new URL('../generated/phase11-f3-structure-extension/preview/', import.meta.url)) });
console.log(`${server.origin}/index.html`);
process.on('SIGINT', async () => { await server.close(); process.exit(0); });
