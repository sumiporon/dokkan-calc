/** Loopback-only owner preview for the self-authored F3-prep fixture. */
import { startStaticServer } from '../tests/helpers/static-server.mjs';
const server=await startStaticServer();
console.log(`${server.origin}/prototypes/phase11-f3-prep/index.html`);
process.on('SIGINT',async()=>{await server.close();process.exit(0);});
