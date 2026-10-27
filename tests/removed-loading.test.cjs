const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// Execute the production helpers without evaluating the page or its UI setup.
function extractFunction(name) {
  const match = new RegExp('function\\s+' + name + '\\s*\\(').exec(html);
  assert.ok(match, 'Production function exists: ' + name);
  const body = html.indexOf('{', match.index);
  let depth = 0, quote = null, comment = null;
  for (let i = body; i < html.length; i++) {
    const ch = html[i], next = html[i + 1];
    if (comment === 'line') { if (ch === '\n') comment = null; continue; }
    if (comment === 'block') {
      if (ch === '*' && next === '/') { comment = null; i++; }
      continue;
    }
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { comment = 'line'; i++; continue; }
    if (ch === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return html.slice(match.index, i + 1);
  }
  throw new Error('Unterminated production function: ' + name);
}

const production = extractFunction('validateRemoved') + '\n' + extractFunction('fetchRemoved');
const API = 'https://api.example.test/contents/data/removed.json';
const RAW = 'https://raw.example.test/main/data/removed.json';
const response = (value, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => value
});
const apiResponse = value => response({content: Buffer.from(JSON.stringify(value)).toString('base64')});
const normalize = value => value === null ? null : JSON.parse(JSON.stringify(value));

function setup(responses) {
  const calls = [];
  const context = {
    API, RAW, BRANCH: 'main',
    token: () => '',
    b64dec: value => Buffer.from(value, 'base64').toString('utf8'),
    Date: {now: () => 123456789},
    fetch: async (url, options) => {
      calls.push({url, options});
      const next = responses[calls.length - 1];
      if (next instanceof Error) throw next;
      assert.ok(next, 'No unexpected extra fallback request');
      return next;
    }
  };
  vm.runInNewContext(production, context);
  return {calls, load: () => context.fetchRemoved()};
}

function assertRoutes(calls, expected) {
  assert.deepEqual(calls.map(call => call.url.split('?')[0]), expected);
  assert.ok(calls.every(call => call.options.cache === 'no-store'));
}

test('a successful API array is decoded and returned without fallback requests', async () => {
  const records = [{id: 'removed-a', at: '2026-10-27T01:02:00Z'}];
  const {calls, load} = setup([apiResponse(records)]);
  assert.deepEqual(normalize(await load()), records);
  assertRoutes(calls, [API]);
});

test('API 404 falls through to raw data instead of claiming an empty removal list', async () => {
  const records = [{id: 'still-removed'}];
  const {calls, load} = setup([response({message: 'Not Found'}, 404), response(records)]);
  assert.deepEqual(normalize(await load()), records);
  assertRoutes(calls, [API, RAW]);
});

test('valid JSON with a non-array API payload falls through to raw data', async () => {
  for (const invalid of [null, {}, 'not-an-array', 42, {removed: []}]) {
    const records = [{id: 'raw-removal'}];
    const {calls, load} = setup([apiResponse(invalid), response(records)]);
    assert.deepEqual(normalize(await load()), records);
    assertRoutes(calls, [API, RAW]);
  }
});

test('three HTTP failures return null so unknown status cannot become an empty baseline', async () => {
  const {calls, load} = setup([response(null, 404), response(null, 503), response(null, 404)]);
  assert.equal(await load(), null);
  assertRoutes(calls, [API, RAW, 'data/removed.json']);
});

test('three network failures return null without rejecting the load', async () => {
  const {calls, load} = setup([new Error('api offline'), new Error('raw offline'), new Error('local offline')]);
  assert.equal(await load(), null);
  assertRoutes(calls, [API, RAW, 'data/removed.json']);
});

test('a successful local empty array is a legitimate loaded removal list', async () => {
  const {calls, load} = setup([response(null, 503), response(null, 404), response([])]);
  assert.deepEqual(normalize(await load()), []);
  assertRoutes(calls, [API, RAW, 'data/removed.json']);
});

test('invalid raw payloads continue to local data and invalid local payloads return null', async () => {
  const localRecords = [{id: 'local-removal'}];
  const fallback = setup([apiResponse({}), response({not: 'an array'}), response(localRecords)]);
  assert.deepEqual(normalize(await fallback.load()), localRecords);
  assertRoutes(fallback.calls, [API, RAW, 'data/removed.json']);

  const failed = setup([apiResponse({}), response({not: 'an array'}), response({not: 'an array'})]);
  assert.equal(await failed.load(), null);
  assertRoutes(failed.calls, [API, RAW, 'data/removed.json']);
});
