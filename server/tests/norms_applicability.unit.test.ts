import test from 'node:test';
import assert from 'node:assert';
import { validateJobApplicability } from '../routes/norms';

test('validateJobApplicability accepts null as all job types', () => {
  assert.deepStrictEqual(validateJobApplicability(null), { valid: true, value: null });
});

test('validateJobApplicability normalizes a valid scope', () => {
  assert.deepStrictEqual(validateJobApplicability([10, 3]), { valid: true, value: [3, 10] });
});

test('validateJobApplicability rejects unsafe scope values', () => {
  for (const value of [undefined, [], [3, 3], [0], [3.5], ['3']]) {
    assert.strictEqual(validateJobApplicability(value).valid, false);
  }
});
