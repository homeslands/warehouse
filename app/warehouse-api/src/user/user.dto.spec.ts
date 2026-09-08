import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateUserRequestDto } from './user.dto';

const messagesFor = (phonenumber: unknown): string[] => {
  const dto = plainToInstance(CreateUserRequestDto, {
    phonenumber,
    password: 'password',
    roleSlug: 'admin',
  });
  const error = validateSync(dto, { whitelist: true }).find((e) => e.property === 'phonenumber');
  return Object.values(error?.constraints ?? {});
};

describe('CreateUserRequestDto.phonenumber', () => {
  it.each(['0900000000', '0387654321', '0777777777', '0555555555'])(
    'accepts Vietnamese mobile number %s',
    (phonenumber) => {
      expect(messagesFor(phonenumber)).toEqual([]);
    },
  );

  it('trims surrounding whitespace before validating', () => {
    const dto = plainToInstance(CreateUserRequestDto, {
      phonenumber: '  0900000000  ',
      password: 'password',
      roleSlug: 'admin',
    });

    expect(validateSync(dto, { whitelist: true })).toEqual([]);
    expect(dto.phonenumber).toBe('0900000000');
  });

  // Đây là 2 case user báo: gửi chữ, hoặc gửi đúng 1 ký tự "0" thì phải bị từ chối.
  it.each(['abc', 'nguyen-van-a', '0'])('rejects %s with USER_PHONENUMBER_INVALID', (value) => {
    expect(messagesFor(value)).toContain('USER_PHONENUMBER_INVALID');
  });

  it.each([
    ['landline', '02838221234'],
    ['+84 form', '+84900000000'],
    ['too short', '090000000'],
    ['too long', '09000000000'],
    ['wrong prefix', '0100000000'],
    ['inner whitespace', '0900 000 000'],
    ['non-string', 900000000],
  ])('rejects %s', (_label, value) => {
    expect(messagesFor(value)).toContain('USER_PHONENUMBER_INVALID');
  });

  // `HttpExceptionFilter` chỉ map message ĐẦU TIÊN, nên thứ tự ở đây mới là thứ user nhìn thấy.
  it('reports USER_PHONENUMBER_IS_REQUIRED first when phonenumber is missing', () => {
    expect(messagesFor(undefined)[0]).toBe('USER_PHONENUMBER_IS_REQUIRED');
    expect(messagesFor('')[0]).toBe('USER_PHONENUMBER_IS_REQUIRED');
  });

  it('reports USER_PHONENUMBER_INVALID first for a non-empty bad value', () => {
    expect(messagesFor('0')[0]).toBe('USER_PHONENUMBER_INVALID');
    expect(messagesFor('abc')[0]).toBe('USER_PHONENUMBER_INVALID');
  });
});
