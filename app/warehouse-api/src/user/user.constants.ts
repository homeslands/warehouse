// Số di động Việt Nam: `0` + đầu số 3/5/7/8/9 + 8 chữ số.
export const VN_PHONENUMBER_REGEX = /^0[35789][0-9]{8}$/;

/**
 * Field được phép sort ở `GET /users` (`sort=field:ASC|DESC`) → property path trên alias `user`.
 * Whitelist bắt buộc: giá trị này đi thẳng vào `ORDER BY`, nhận tự do là mở đường SQL injection.
 */
export const USER_SORT_FIELDS = {
  createdAt: 'user.createdAt',
  updatedAt: 'user.updatedAt',
  firstName: 'user.firstName',
  lastName: 'user.lastName',
  phonenumber: 'user.phonenumber',
  dob: 'user.dob',
} as const;

export const USER_SORT_REGEX = new RegExp(
  `^(${Object.keys(USER_SORT_FIELDS).join('|')}):(ASC|DESC)$`,
  'i',
);
