import { fullName } from './name.util';

describe('fullName', () => {
  it('joins last name then first name', () => {
    expect(fullName({ firstName: 'An', lastName: 'Nguyễn Văn' })).toBe('Nguyễn Văn An');
  });

  it.each([
    [{ firstName: 'An', lastName: '' }, 'An'],
    [{ firstName: '', lastName: 'Nguyễn' }, 'Nguyễn'],
    [{ firstName: '', lastName: '' }, ''],
  ])('trims when a part is empty: %p', (user, expected) => {
    expect(fullName(user)).toBe(expected);
  });
});
