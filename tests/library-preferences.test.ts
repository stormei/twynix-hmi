import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  libraryPreferencesKey,
  parseLibraryPreferences,
} from '../apps/editor/src/app/library-preferences';

test('library preferences restore exact search, explicit expansion and active tab', () => {
  const preferences = {
    version: 1,
    search: 'Pressure PT ',
    expanded: ['equipment', 'piping'],
    activeTab: 'symbols',
  };
  assert.deepEqual(parseLibraryPreferences(JSON.stringify(preferences)), preferences);
  assert.deepEqual(
    parseLibraryPreferences(JSON.stringify({ ...preferences, expanded: [] })).expanded,
    [],
  );
});
test('invalid, outdated or partial preferences recover safely and discard unknown categories', () => {
  for (const value of [null, 'broken', 'null', '[]', '{"version":2}'])
    assert.deepEqual(parseLibraryPreferences(value).expanded, ['dashboard']);
  const result = parseLibraryPreferences(
    JSON.stringify({
      version: 1,
      search: 42,
      expanded: ['equipment', 'unknown', null, 'equipment'],
      activeTab: 'invalid',
    }),
  );
  assert.deepEqual(result, {
    version: 1,
    search: '',
    expanded: ['equipment'],
    activeTab: 'screens',
  });
});
test('review workspace preferences do not overwrite the main editor', () => {
  assert.equal(libraryPreferencesKey('http://127.0.0.1:4200/'), 'twynix.symbol-library.v1');
  assert.equal(
    libraryPreferencesKey('http://127.0.0.1:4200/?workspace=review'),
    'twynix.symbol-library.v1:review',
  );
  assert.equal(
    libraryPreferencesKey('http://127.0.0.1:4200/?workspace=invalid%2Fkey'),
    'twynix.symbol-library.v1',
  );
});
