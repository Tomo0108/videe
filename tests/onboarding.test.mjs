import test from 'node:test';
import assert from 'node:assert/strict';
import { markTourSeen, shouldAutoStartTour, tourSeen, TOUR_KEY, TOUR_VERSION } from '../src/onboarding.mjs';

const memory = (initial = {}) => { const data = { ...initial }; return { getItem: key => data[key] ?? null, setItem: (key, value) => { data[key] = String(value); }, data }; };

test('tour starts on first launch and stays closed once seen', () => {
  const storage = memory();
  assert.equal(shouldAutoStartTour({ storage }), true);
  markTourSeen(storage);
  assert.equal(storage.data[TOUR_KEY], TOUR_VERSION);
  assert.equal(tourSeen(storage), true);
  assert.equal(shouldAutoStartTour({ storage }), false);
});

test('an older tour version shows the new tour once', () => {
  assert.equal(shouldAutoStartTour({ storage: memory({ [TOUR_KEY]: '0' }) }), true);
});

test('automated browsers skip the tour unless ?tour asks for it', () => {
  assert.equal(shouldAutoStartTour({ storage: memory(), webdriver: true }), false);
  assert.equal(shouldAutoStartTour({ storage: memory({ [TOUR_KEY]: TOUR_VERSION }), webdriver: true, search: '?tour' }), true);
  assert.equal(shouldAutoStartTour({ storage: memory(), webdriver: true, search: '?x=1&tour=1' }), true);
  assert.equal(shouldAutoStartTour({ storage: memory(), webdriver: true, search: '?tours=1' }), false);
});

test('blocked storage never traps people in the tour', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(tourSeen(broken), true);
  assert.doesNotThrow(() => markTourSeen(broken));
  assert.equal(shouldAutoStartTour({ storage: broken }), false);
});

test('the Mac app gets the Mac guide, Windows and others the Windows guide', async () => {
  const { guideEdition } = await import('../src/onboarding.mjs');
  assert.equal(guideEdition({ platform: 'darwin' }), 'mac');
  assert.equal(guideEdition({ platform: 'win32', userAgent: 'Macintosh' }), 'win');
  assert.equal(guideEdition({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }), 'mac');
  assert.equal(guideEdition({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), 'win');
  assert.equal(guideEdition({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile' }), 'win');
});
