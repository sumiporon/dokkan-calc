import { mountDiagnosticV2 } from './ui.mjs';
const match = location.pathname.match(/^\/events\/challenge\/993300\/(993300[0-9]{2})(?:\.html)?$/);
if (window.top === window && location.protocol === 'http:' && location.hostname === '127.0.0.1' && !location.search && !location.hash && match) {
  mountDiagnosticV2({ url: location.href, eventId: '993300', stageId: match[1] });
}
