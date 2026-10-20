import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageItems, reachedResultWindow } from './pagination';

test('the pager stops at the capped page and says why only when the window cut the list', () => {
  assert.deepEqual(pageItems(50, 50).slice(-2), [49, 50]);
  // 201.713 results, 20 per page: the API caps totalPages at 50.
  assert.equal(reachedResultWindow(50, 50, 20, 201_713), true);
  assert.equal(reachedResultWindow(49, 50, 20, 201_713), false);
  // A short list ends naturally.
  assert.equal(reachedResultWindow(3, 3, 20, 45), false);
  // Exactly 1000 results: the last page is the real end.
  assert.equal(reachedResultWindow(50, 50, 20, 1_000), false);
});
