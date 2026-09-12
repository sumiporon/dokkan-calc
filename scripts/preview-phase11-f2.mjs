/** Loopback-only preview for the self-authored Phase F2 fixture. */
import { startStaticServer } from '../tests/helpers/static-server.mjs';
const server = await startStaticServer();
console.log(`${server.origin}/prototypes/phase11-f2/index.html`);
process.on('SIGINT', async () => { await server.close(); process.exit(0); });
