import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtOptionalAuthGuard } from './jwt-optional-auth.guard';

describe('JwtOptionalAuthGuard', () => {
  const buildContext = (name: string) =>
    ({ getHandler: () => name, getClass: () => name }) as unknown as ExecutionContext;

  const buildGuard = (publicHandlers: string[]) => {
    const reflector = {
      getAllAndOverride: jest.fn((_key: string, targets: string[]) =>
        publicHandlers.includes(targets[0]),
      ),
    } as unknown as Reflector;
    return new JwtOptionalAuthGuard(reflector);
  };

  it('lets a public route through without a user', () => {
    const guard = buildGuard(['publicHandler']);

    expect(guard.handleRequest(null, undefined, null, buildContext('publicHandler'))).toEqual({});
  });

  it('rejects a protected route without a user', () => {
    const guard = buildGuard([]);

    expect(() =>
      guard.handleRequest(null, undefined, null, buildContext('protectedHandler')),
    ).toThrow(UnauthorizedException);
  });

  // Guard là singleton: trạng thái public phải đi theo context của từng request, không được
  // giữ trên instance. Nếu giữ trên instance, lời gọi cho route public phía dưới sẽ làm route
  // cần JWT đi lọt mà không có token.
  it('keeps per-request state isolated when calls interleave', () => {
    const guard = buildGuard(['publicHandler']);

    const publicResult = guard.handleRequest(null, undefined, null, buildContext('publicHandler'));

    expect(publicResult).toEqual({});
    expect(() =>
      guard.handleRequest(null, undefined, null, buildContext('protectedHandler')),
    ).toThrow(UnauthorizedException);
    expect(guard.handleRequest(null, undefined, null, buildContext('publicHandler'))).toEqual({});
  });
});
