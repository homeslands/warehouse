import { WRITE_LOCK } from './lock.util';

describe('WRITE_LOCK', () => {
  it('is a plain pessimistic_write lock (no extra options)', () => {
    expect(WRITE_LOCK).toStrictEqual({ mode: 'pessimistic_write' });
  });
});
