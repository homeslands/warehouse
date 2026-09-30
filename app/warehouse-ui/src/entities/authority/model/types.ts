/**
 * Một quyền đơn lẻ. `code` là khoá tra cứu BẤT BIẾN mà backend dùng trong `@RequireAuthority(code)`
 * và là thứ nằm trong `scope` của user; `slug` chỉ là định danh REST (đổi được). Đừng dùng `slug`
 * để so quyền.
 *
 * `authorityGroup` chỉ để nhóm hiển thị. Nó về lồng sẵn (`eager: true` ở backend) nên KHÔNG cần gọi
 * `GET /authority-groups`.
 */
export type Authority = {
  slug: string
  code: string
  name: string
  authorityGroup: { slug: string; name: string }
}
