import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const DEFAULT_SOURCE_PATH = fileURLToPath(
  new URL('../fixtures/legacy/phase2-calculation-snapshot.js', import.meta.url)
);

const START_MARKER = '    const calculateNewDurability = (scenarioData) => {';
const END_MARKER = '\n    const updateScenarioResults = (card) => {';

export function loadLegacyCalculatorSource(sourcePath = DEFAULT_SOURCE_PATH) {
  return readFileSync(sourcePath, 'utf8');
}

/**
 * Loads the frozen Phase 2 production calculateNewDurability function without
 * executing the DOM-heavy application bootstrap. The snapshot deliberately
 * remains stable after production fixes so legacyExpected never becomes a
 * moving correctness target.
 */
export function loadLegacyCalculateNewDurability(sourcePath = DEFAULT_SOURCE_PATH) {
  const source = loadLegacyCalculatorSource(sourcePath);
  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER, start);

  if (start < 0 || end < 0) {
    throw new Error('Legacy calculator markers were not found; review the test loader before proceeding.');
  }
  if (source.indexOf(START_MARKER, start + START_MARKER.length) >= 0) {
    throw new Error('Legacy calculator start marker is ambiguous.');
  }

  const functionDeclaration = source.slice(start, end);
  const script = new vm.Script(
    `${functionDeclaration}\ncalculateNewDurability;`,
    { filename: sourcePath }
  );
  const calculator = script.runInNewContext(Object.create(null));

  if (typeof calculator !== 'function') {
    throw new TypeError('Extracted legacy calculator is not callable.');
  }
  return calculator;
}
