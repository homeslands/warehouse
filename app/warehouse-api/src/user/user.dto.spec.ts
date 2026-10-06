import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateUserRequestDto, GetAllUserRequestDto } from './user.dto';

const messagesFor = (phonenumber: unknown): string[] => {
  const dto = plainToInstance(CreateUserRequestDto, {
    phonenumber,
    firstName: 'Văn A',
    lastName: 'Nguyễn',
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
      firstName: 'Văn A',
      lastName: 'Nguyễn',
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

const validBody = {
  phonenumber: '0900000000',
  firstName: 'Văn A',
  lastName: 'Nguyễn',
  password: 'password',
  roleSlug: 'admin',
};

const messagesOf = (property: string, body: Record<string, unknown>): string[] => {
  const dto = plainToInstance(CreateUserRequestDto, body);
  const error = validateSync(dto, { whitelist: true }).find((e) => e.property === property);
  return Object.values(error?.constraints ?? {});
};

describe('CreateUserRequestDto profile fields', () => {
  it('accepts a body with only the required fields (dob/email/address are optional)', () => {
    expect(validateSync(plainToInstance(CreateUserRequestDto, validBody))).toEqual([]);
  });

  it('accepts a body with every optional field filled in', () => {
    const dto = plainToInstance(CreateUserRequestDto, {
      ...validBody,
      dob: '1990-05-20',
      email: 'a.nguyen@example.com',
      address: 'Số 2, Ba Đình, Hà Nội',
    });
    expect(validateSync(dto)).toEqual([]);
  });

  it.each([
    ['firstName', 'USER_FIRST_NAME_IS_REQUIRED'],
    ['lastName', 'USER_LAST_NAME_IS_REQUIRED'],
  ])('requires %s', (property, message) => {
    expect(messagesOf(property, { ...validBody, [property]: undefined })).toContain(message);
    expect(messagesOf(property, { ...validBody, [property]: '   ' })).toContain(message);
  });

  it('trims firstName/lastName', () => {
    const dto = plainToInstance(CreateUserRequestDto, {
      ...validBody,
      firstName: '  Văn A ',
      lastName: ' Nguyễn  ',
    });
    expect(dto.firstName).toBe('Văn A');
    expect(dto.lastName).toBe('Nguyễn');
  });

  it.each(['1990/05/20', '20-05-1990', '1990-13-01', '1990-02-30', '1990-05-20T10:00:00Z', 'abc'])(
    'rejects dob %s with USER_DOB_INVALID',
    (dob) => {
      expect(messagesOf('dob', { ...validBody, dob })).toContain('USER_DOB_INVALID');
    },
  );

  it('rejects a malformed email with USER_EMAIL_INVALID', () => {
    expect(messagesOf('email', { ...validBody, email: 'not-an-email' })).toContain(
      'USER_EMAIL_INVALID',
    );
  });
});

describe('GetAllUserRequestDto', () => {
  const build = (query: Record<string, unknown>) =>
    plainToInstance(GetAllUserRequestDto, query, { enableImplicitConversion: false });
  const messages = (query: Record<string, unknown>, property: string): string[] =>
    Object.values(
      validateSync(build(query), { whitelist: true }).find((e) => e.property === property)
        ?.constraints ?? {},
    );

  it('accepts an empty query', () => {
    expect(validateSync(build({}), { whitelist: true })).toEqual([]);
  });

  // `?sort=a` ra string chứ không phải mảng.
  it('wraps a single sort value into an array', () => {
    const dto = build({ sort: 'firstName:ASC' });

    expect(dto.sort).toEqual(['firstName:ASC']);
    expect(messages({ sort: 'firstName:ASC' }, 'sort')).toEqual([]);
  });

  it.each(['createdAt:desc', 'lastName:ASC', 'dob:DESC', 'phonenumber:asc'])(
    'accepts whitelisted sort %s',
    (sort) => {
      expect(messages({ sort: [sort] }, 'sort')).toEqual([]);
    },
  );

  // Whitelist là rào chống SQL injection qua ORDER BY.
  it.each(['password:ASC', 'firstName', 'firstName:UP', 'firstName:ASC; DROP TABLE user_tbl'])(
    'rejects sort %s',
    (sort) => {
      expect(messages({ sort: [sort] }, 'sort')).toContain('USER_SORT_INVALID');
    },
  );

  it.each([
    ['startDate', 'USER_START_DATE_INVALID'],
    ['endDate', 'USER_END_DATE_INVALID'],
  ])('rejects an invalid %s', (property, code) => {
    expect(messages({ [property]: 'not-a-date' }, property)).toContain(code);
    expect(messages({ [property]: '2026-09-01' }, property)).toEqual([]);
    expect(messages({ [property]: '2026-09-01T10:00:00.000Z' }, property)).toEqual([]);
  });

  it('only accepts birthday as YYYY-MM-DD', () => {
    expect(messages({ birthday: '1990-05-20' }, 'birthday')).toEqual([]);
    expect(messages({ birthday: '1990-05-20T00:00:00Z' }, 'birthday')).toContain(
      'USER_BIRTHDAY_INVALID',
    );
    expect(messages({ birthday: '20/05/1990' }, 'birthday')).toContain('USER_BIRTHDAY_INVALID');
  });
});
