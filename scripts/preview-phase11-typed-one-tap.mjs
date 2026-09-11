import { startStaticServer } from '../tests/helpers/static-server.mjs';
const server = await startStaticServer();
console.log(`${server.origin}/prototypes/phase11-typed-one-tap/index.html`);
process.on('SIGINT', async () => { await server.close(); process.exit(0); });
