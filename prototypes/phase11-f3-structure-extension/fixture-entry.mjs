/** Localhost fixture entry only; never bundled into the target-host candidate. */
import { mountDiagnostic } from './ui.mjs';
const match = location.pathname.match(/^\/events\/challenge\/992200\/(9922000[1-9])(?:\.html)?$/);
if (window.top === window && location.protocol === 'http:' && location.hostname === '127.0.0.1' && !location.search && !location.hash && match) {
  mountDiagnostic({ url: location.href, eventId: '992200', stageId: match[1] });
}
