// Instrument the extension's isolated world, not only the page's JS world.
// Prepended to fixture-test/content.js only; never in the candidate or preview.
(() => {
  const probe = { html: 0, digest: 0, network: 0, storage: 0, copy: 0 };
  const report = () => { document.documentElement.dataset.structureProbe = JSON.stringify(probe); };
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML');
  Object.defineProperty(Element.prototype, 'outerHTML', { ...descriptor, get() {
    probe.html++; report();
    const html = descriptor.get.call(this);
    if (document.documentElement.dataset.testUrlDrift === 'yes') history.replaceState(null, '', '?capture-drift');
    return html;
  } });
  const digest = SubtleCrypto.prototype.digest;
  SubtleCrypto.prototype.digest = function (...args) { probe.digest++; report(); return digest.apply(this, args); };
  const noNetwork = () => { probe.network++; report(); throw new Error('Unexpected network API'); };
  window.fetch = noNetwork; window.WebSocket = noNetwork; window.XMLHttpRequest = noNetwork; navigator.sendBeacon = noNetwork;
  const noStorage = () => { probe.storage++; report(); throw new Error('Unexpected persistence API'); };
  for (const key of ['getItem', 'setItem', 'removeItem', 'clear']) Storage.prototype[key] = noStorage;
  indexedDB.open = noStorage;
  Object.defineProperty(document, 'cookie', { get: noStorage, set: noStorage });
  const copy = document.execCommand.bind(document);
  document.execCommand = (...args) => {
    probe.copy++; report();
    if (document.documentElement.dataset.testCopyFailure === 'yes') return false;
    return copy(...args);
  };
  report();
})();
