const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createTracker} = require('../gameplay-trends.js');

const KEY = 'inspo-gameplay-stats-v1';
const VERSION = 'taxonomy-v1';
const FIRST = '2026-10-27T03:04:00.000Z';
const SECOND = '2026-10-27T05:06:00.000Z';
const THIRD = '2026-10-28T07:08:00.000Z';
const stats = counts => Object.entries(counts).map(([value, count]) => ({value, label: value + '玩法', count}));

function memory(entries = []) {
  const data = new Map(entries), reads = [], writes = [];
  return {
    data, reads, writes,
    getItem(key) { reads.push(key); return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { writes.push([key, value]); data.set(key, value); }
  };
}

function withBaseline(counts = {puzzle: 8, action: 5}, options = {}) {
  const storage = memory([[options.key || KEY, JSON.stringify({
    version: options.version || VERSION, at: FIRST, counts
  })]]);
  const tracker = createTracker({storage, now: () => SECOND, ...options});
  return {storage, tracker};
}

test('first visit records a baseline without presenting all current counts as growth', () => {
  const storage = memory();
  const tracker = createTracker({storage, now: () => FIRST});
  const current = stats({puzzle: 8, action: 5});
  const empty = {previousAt: null, deltas: {}, hasBaseline: false};
  assert.deepEqual(tracker.compare(current), empty);
  assert.equal(tracker.save(current), true);
  assert.deepEqual(tracker.compare(current), empty);
  assert.deepEqual(createTracker({storage}).compare(current), {
    previousAt: FIRST, deltas: {action: 0, puzzle: 0}, hasBaseline: true
  });
});

test('later visits compare increases, decreases, new and removed gameplay values', () => {
  const {tracker} = withBaseline({puzzle: 8, action: 5, rhythm: 3});
  assert.deepEqual(tracker.compare(stats({puzzle: 10, action: 2, social: 4})), {
    previousAt: FIRST,
    deltas: {puzzle: 2, action: -3, rhythm: -3, social: 4},
    hasBaseline: true
  });
});

test('saving updated counts preserves the initial baseline throughout this visit', () => {
  const {storage, tracker} = withBaseline();
  assert.equal(tracker.save(stats({puzzle: 10, action: 5})), true);
  assert.deepEqual(tracker.compare(stats({puzzle: 11, action: 5})).deltas, {puzzle: 3, action: 0});
  assert.equal(tracker.compare(stats({})).previousAt, FIRST);
  const later = createTracker({storage, now: () => THIRD});
  assert.deepEqual(later.compare(stats({puzzle: 11, action: 5})), {
    previousAt: SECOND, deltas: {puzzle: 1, action: 0}, hasBaseline: true
  });
  assert.equal(storage.reads.length, 2);
});

test('unchanged counts ignore rank/order and labels without rewriting or changing recorded time', () => {
  let clockCalls = 0;
  const {storage, tracker} = withBaseline(undefined, {now: () => { clockCalls++; return SECOND; }});
  const reordered = [{value: 'action', label: '新名称', count: 5}, {value: 'puzzle', label: '新名称', count: 8}];
  assert.equal(tracker.save(reordered), true);
  assert.equal(tracker.save(reordered), true);
  assert.equal(storage.writes.length, 0);
  assert.equal(clockCalls, 0);
  assert.equal(JSON.parse(storage.data.get(KEY)).at, FIRST);
  assert.equal(tracker.save(stats({action: 5, puzzle: 9})), true);
  assert.equal(tracker.save(stats({puzzle: 9, action: 5})), true);
  assert.equal(storage.writes.length, 1);
  assert.equal(clockCalls, 1);
});

test('returning to older counts after a change persists the latest state', () => {
  const {storage, tracker} = withBaseline();
  tracker.save(stats({puzzle: 9, action: 5}));
  tracker.save(stats({puzzle: 8, action: 5}));
  assert.equal(storage.writes.length, 2);
  assert.deepEqual(JSON.parse(storage.data.get(KEY)).counts, {puzzle: 8, action: 5});
});

test('only the specified storage key is accessed and the record excludes labels or case data', () => {
  const key = 'custom-gameplay-record';
  const storage = memory([['inspo-token', 'untouched'], ['inspo-favorites', 'untouched']]);
  const tracker = createTracker({storage, key, version: 'taxonomy-v2', now: () => new Date(FIRST)});
  tracker.save([{value: 'puzzle', count: 2, label: '仅用于界面', cases: ['secret-case']}]);
  assert.deepEqual(storage.reads, [key]);
  assert.deepEqual(storage.writes.map(([name]) => name), [key]);
  assert.deepEqual(JSON.parse(storage.data.get(key)), {
    version: 'taxonomy-v2', at: FIRST, counts: {puzzle: 2}
  });
  assert.equal(storage.data.get('inspo-token'), 'untouched');
  assert.equal(storage.data.get('inspo-favorites'), 'untouched');
});

test('damaged records, incompatible versions and malformed snapshots safely start without a baseline', () => {
  const valid = {version: VERSION, at: FIRST, counts: {puzzle: 8}};
  const invalid = [
    '{broken', 'null', '[]', '{}',
    JSON.stringify({...valid, version: 'obsolete-taxonomy'}),
    JSON.stringify({...valid, at: 'not a date'}),
    JSON.stringify({...valid, at: '2026-10-27'}),
    JSON.stringify({...valid, counts: null}),
    JSON.stringify({...valid, counts: []}),
    JSON.stringify({...valid, counts: {puzzle: -1}}),
    JSON.stringify({...valid, counts: {puzzle: '8'}}),
    JSON.stringify({...valid, counts: {'': 1}})
  ];
  for (const raw of invalid) {
    const storage = memory([[KEY, raw]]);
    const tracker = createTracker({storage, now: () => SECOND});
    assert.deepEqual(tracker.compare(stats({puzzle: 10})), {previousAt: null, deltas: {}, hasBaseline: false});
    assert.equal(tracker.save(stats({puzzle: 10})), true);
    assert.equal(JSON.parse(storage.data.get(KEY)).at, SECOND);
  }
});

test('unavailable or throwing storage never interrupts comparisons and failed writes can retry', () => {
  for (const storage of [undefined, null, {}, {getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); }}]) {
    const tracker = createTracker({storage});
    assert.deepEqual(tracker.compare(stats({puzzle: 1})), {previousAt: null, deltas: {}, hasBaseline: false});
    assert.equal(tracker.save(stats({puzzle: 1})), false);
  }
  const {storage} = withBaseline();
  const write = storage.setItem;
  storage.setItem = () => { throw Error('quota'); };
  const tracker = createTracker({storage, now: () => SECOND});
  assert.equal(tracker.save(stats({puzzle: 10, action: 5})), false);
  assert.equal(tracker.compare(stats({puzzle: 10, action: 5})).deltas.puzzle, 2);
  storage.setItem = write;
  assert.equal(tracker.save(stats({puzzle: 10, action: 5})), true);
  assert.equal(storage.writes.length, 1);
});

test('invalid or duplicate current statistics cannot overwrite a valid snapshot', () => {
  const {storage, tracker} = withBaseline();
  const invalid = [null, {}, [null], [{value: '', count: 1}], [{value: 'puzzle', count: '2'}],
    [{value: 'puzzle', count: NaN}], [{value: 'puzzle', count: Infinity}],
    [{value: 'puzzle', count: 1.5}], [{value: 'puzzle', count: -1}],
    [{value: 'puzzle', count: Number.MAX_SAFE_INTEGER + 1}],
    [{value: 'puzzle', count: 1}, {value: 'puzzle', count: 2}]];
  for (const value of invalid) {
    assert.equal(tracker.save(value), false);
    assert.deepEqual(tracker.compare(value), {previousAt: FIRST, deltas: {}, hasBaseline: true});
  }
  assert.equal(storage.writes.length, 0);
});

test('frozen caller input and returned-delta mutations cannot modify tracker state', () => {
  const {tracker} = withBaseline();
  const current = Object.freeze(stats({puzzle: 10, action: 5}).map(Object.freeze));
  const result = tracker.compare(current);
  result.deltas.puzzle = 900;
  result.previousAt = THIRD;
  assert.equal(tracker.compare(current).deltas.puzzle, 2);
  assert.equal(tracker.compare(current).previousAt, FIRST);
  assert.equal(tracker.save(current), true);
});

test('prototype-like gameplay values remain ordinary own keys', () => {
  const storage = memory();
  const initial = [{value: '__proto__', count: 2}, {value: 'constructor', count: 3}, {value: 'toString', count: 1}];
  assert.equal(createTracker({storage, now: () => FIRST}).save(initial), true);
  const tracker = createTracker({storage});
  const result = tracker.compare([{value: '__proto__', count: 4}, {value: 'constructor', count: 1}]);
  assert.equal(Object.getPrototypeOf(result.deltas), Object.prototype);
  assert.equal(Object.hasOwn(result.deltas, '__proto__'), true);
  assert.equal(result.deltas.__proto__, 2);
  assert.equal(result.deltas.constructor, -2);
  assert.equal(result.deltas.toString, -1);
  assert.equal({}.polluted, undefined);
});

test('empty complete statistics are valid and invalid clocks fail safely', () => {
  const {storage, tracker} = withBaseline();
  assert.deepEqual(tracker.compare([]).deltas, {puzzle: -8, action: -5});
  assert.equal(tracker.save([]), true);
  assert.deepEqual(createTracker({storage}).compare([]).deltas, {});
  assert.equal(createTracker({storage, now: () => 'invalid'}).save(stats({puzzle: 1})), false);
  assert.equal(createTracker({storage, now: () => { throw Error('clock unavailable'); }}).save(stats({puzzle: 1})), false);
});

test('browser UMD matches CommonJS without touching browser storage or fetching data', () => {
  const window = {};
  Object.defineProperty(window, 'localStorage', {get() { throw Error('must be injected'); }});
  const context = {window, fetch() { throw Error('must not fetch'); }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../gameplay-trends.js'), 'utf8'), context);
  assert.equal(typeof window.InspoGameplayTrends.createTracker, 'function');
  const {storage} = withBaseline();
  const browser = window.InspoGameplayTrends.createTracker({storage});
  const commonjs = createTracker({storage});
  assert.equal(JSON.stringify(browser.compare(stats({puzzle: 10}))), JSON.stringify(commonjs.compare(stats({puzzle: 10}))));
});
