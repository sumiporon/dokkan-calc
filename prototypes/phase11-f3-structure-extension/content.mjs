import { mountDiagnostic } from './ui.mjs';

// Exact URL checked again by the one-shot capture controller on the owner tap.
const expected = Object.freeze({
  url: 'https://jpnja.dokkaninfo.com/events/challenge/1705/17050015',
  eventId: '1705', stageId: '17050015'
});
if (window.top === window && location.href === expected.url) mountDiagnostic(expected);
