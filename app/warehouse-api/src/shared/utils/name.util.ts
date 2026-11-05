/** Tên hiển thị "Họ Tên" — dùng cho cột snapshot tên người lập/người duyệt trên phiếu. */
export const fullName = (person: { firstName: string; lastName: string }): string =>
  `${person.lastName} ${person.firstName}`.trim();
