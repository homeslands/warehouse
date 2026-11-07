import { ForbiddenException } from '@nestjs/common';
import { RoleEnum } from 'src/role/role.enum';
import { CurrentUserDto } from 'src/user/user.decorator';
import { AuthorityCode } from './authority.constants';
import { assertFullOrOwnAuthority, assertHasAnyAuthority } from './authority-check.util';

const user = (scope: string[] | undefined, roleName?: string): CurrentUserDto =>
  ({ userId: 'u1', roleName, scope }) as CurrentUserDto;

class NotOwnerError extends Error {}

describe('assertHasAnyAuthority', () => {
  const codes = [AuthorityCode.ImportFormCreate, AuthorityCode.ImportFormUpdateDraft];

  it('passes when the user has at least one of the codes', () => {
    expect(() =>
      assertHasAnyAuthority(user([AuthorityCode.ImportFormUpdateDraft]), codes),
    ).not.toThrow();
  });

  it.each([
    ['other codes only', [AuthorityCode.ExportFormCreate]],
    ['empty scope', []],
    ['missing scope', undefined],
  ])('throws a bare ForbiddenException (403 like AuthorityGuard): %s', (_label, scope) => {
    const call = () => assertHasAnyAuthority(user(scope, RoleEnum.Admin), codes);

    expect(call).toThrow(ForbiddenException);
    expect(call).toThrow(expect.objectContaining({ message: 'Forbidden' }));
  });

  it('lets SUPER_ADMIN through without any authority', () => {
    expect(() => assertHasAnyAuthority(user([], RoleEnum.SuperAdmin), codes)).not.toThrow();
  });
});

describe('assertFullOrOwnAuthority', () => {
  const full = AuthorityCode.ImportFormUpdateDraft;
  const own = AuthorityCode.ImportFormUpdateDraftOwn;
  const notOwner = jest.fn(() => new NotOwnerError());

  beforeEach(() => notOwner.mockClear());

  it('full code ⇒ allowed on any owner', () => {
    expect(() =>
      assertFullOrOwnAuthority(user([full]), full, own, 'other', notOwner),
    ).not.toThrow();
    expect(notOwner).not.toHaveBeenCalled();
  });

  it('own code only ⇒ allowed on own record', () => {
    expect(() => assertFullOrOwnAuthority(user([own]), full, own, 'u1', notOwner)).not.toThrow();
  });

  it.each([
    ['another owner', 'other'],
    ['unknown owner', undefined],
  ])('own code only ⇒ module error from `notOwner` on %s', (_label, ownerId) => {
    expect(() => assertFullOrOwnAuthority(user([own]), full, own, ownerId, notOwner)).toThrow(
      NotOwnerError,
    );
    expect(notOwner).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unrelated codes', [AuthorityCode.ImportFormCreate]],
    ['missing scope', undefined],
  ])('neither code ⇒ ForbiddenException before checking the owner: %s', (_label, scope) => {
    expect(() => assertFullOrOwnAuthority(user(scope), full, own, 'u1', notOwner)).toThrow(
      ForbiddenException,
    );
    expect(notOwner).not.toHaveBeenCalled();
  });

  it('SUPER_ADMIN bypasses both the authority and the owner check', () => {
    expect(() =>
      assertFullOrOwnAuthority(user([], RoleEnum.SuperAdmin), full, own, 'other', notOwner),
    ).not.toThrow();
  });
});
