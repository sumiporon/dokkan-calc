import { mountDiagnosticV2 } from './ui.mjs';
const expected = { url: 'https://jpnja.dokkaninfo.com/events/challenge/1705/17050015', eventId: '1705', stageId: '17050015' };
if (window.top === window && location.href === expected.url) mountDiagnosticV2(expected);
