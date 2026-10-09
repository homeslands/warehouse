// Số di động Việt Nam: `0` + đầu số 3/5/7/8/9 + 8 chữ số.
export const VN_PHONENUMBER_REGEX = /^0[35789][0-9]{8}$/;

/**
 * Field được phép sort ở `GET /users` (`sort=field:ASC|DESC`) → property của `User` dùng làm key
 * `order` của find options. Whitelist bắt buộc: chỉ field khai ở đây mới vào được `ORDER BY`.
 */
export const USER_SORT_FIELDS = {
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  firstName: 'firstName',
  lastName: 'lastName',
  phonenumber: 'phonenumber',
  dob: 'dob',
} as const;

export const USER_SORT_REGEX = new RegExp(
  `^(${Object.keys(USER_SORT_FIELDS).join('|')}):(ASC|DESC)$`,
  'i',
);
