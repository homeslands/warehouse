> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# Hợp đồng màn hình và luồng — R2

APPROVED FOR DESIGN bởi điều phối theo ủy quyền, 05/11/2026. Đây là baseline để FE implement, không là browser evidence.

## Quy tắc chung

- Dùng Ant Design theoD08, giữ FSD, vi/en và dark/light khi màn hiện tại hỗ trợ. React Query giữ server state; Redux chỉ giữ workflow/session UI, không nhân đôi serverdata.
- Body16px, bảng14px, metadata12px; mobiletouch≥44px; viewport320/390/768/1440. Formmobilemột cột, bảng dài cócard hoặcstickycontext, khônggiấu quantity/actionchính ngoài vùngđọc.
- Loading/empty/error/403/409/offline có mẫu; label liên kếtinput, keyboard/focus, liveannouncement cho lỗi. Nút bị chặn có lý do; ẩn UI không thay backendRBAC.
- Mọi write nghiệp vụ có màn review/confirmation nêu kho, số lượng/tiền và hậuquả; authrefresh/activity và notificationread là cập nhật kỹthuật không bật hộp xácnhận. Doubleclick/retry dùng cùng requestkey, không làm hai phiếu.
- Idlelock che dữliệu, khôngpollinggiữphiên. Logout/userchange purgequery/Redux/draft; chỉ reauth cùnguser mới khôi phục draft còn trong memory.
- Field server-managed chỉreadonly; versionẩn trong request, không ô cho usersửa. 422hiện theo field; 409không tựoverwrite; 401khóa/login; 403/404khônglộ dữliệu ngoàiscope.
- SVG trongwireframes/ là7archetype được duyệt; mỗi màn dùng field/action/state trongJSON. Không dùng ảnh fixture trước đây làm bằngchứng màn đã implement.

## UI-01 · Đăng nhập

Route `/login` · W02 · ADMIN, MANAGER, SUPERVISOR · `auth.svg`

Password toggle, generic error; refresh cookie không hiển thị hoặc lưu localStorage. Không có lựa chọn role/SUPER_ADMIN ở login.

Schema đọc: `Theo từng operation`; schema nhập: `Login`.

| Tác vụ | API | Quyền |
|---|---|---|
| login | POST `/auth/login` | `PUBLIC_AUTH` + scope/state |
| refresh | POST `/auth/refresh` | `PUBLIC_AUTH` + scope/state |

Fieldform: `phoneNumber` *, `password` *. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-02 · Khóa do không hoạt động

Route `/locked` · W02 · ADMIN, MANAGER, SUPERVISOR · `auth.svg`

30phút phía server; polling không giữ phiên. Overlay che dữ liệu, reauth cùnguser mới được phục hồi draft trong memory; đổiuser/logout phải purge toàn bộ cache/draft.

Schema đọc: `Theo từng operation`; schema nhập: `Login`.

| Tác vụ | API | Quyền |
|---|---|---|
| login | POST `/auth/login` | `PUBLIC_AUTH` + scope/state |
| lock | POST `/auth/lock` | `AUTHENTICATED` + scope/state |
| recordInteractiveActivity | POST `/auth/activity` | `AUTHENTICATED` + scope/state |

Fieldform: `phoneNumber` *, `password` *. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-03 · Hồ sơ và mật khẩu

Route `/account` · W02 · ADMIN, MANAGER, SUPERVISOR · `form.svg`

Không sửa role/warehouse từ profile. Passwordchange là dialog riêng theo PasswordChange, xóa trường sau request.

Schema đọc: `User`; schema nhập: `ProfilePatch`.

| Tác vụ | API | Quyền |
|---|---|---|
| getProfile | GET `/auth/me` | `AUTHENTICATED` + scope/state |
| updateProfile | PATCH `/auth/me` | `AUTHENTICATED` + scope/state |
| changeOwnPassword | POST `/auth/change-password` | `AUTHENTICATED` + scope/state |

Fieldform: `version` *, `displayName`, `email`, `dob`, `avatarFileId`, `address`. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-04 · Các phiên đăng nhập

Route `/account/sessions` · W02 · ADMIN, MANAGER, SUPERVISOR · `list.svg`

Chỉ phiên chính mình, IPmasked, không token. Logoutall/revoke cần xác nhận; phiên hiện tại bịrevoke thì clearcache/login.

Schema đọc: `Session`; schema nhập: `Theo từng operation`.

| Tác vụ | API | Quyền |
|---|---|---|
| listOwnSessions | GET `/sessions` | `AUTHENTICATED` + scope/state |
| revokeOwnSession | DELETE `/sessions/{id}` | `AUTHENTICATED` + scope/state |
| logoutall | POST `/auth/logout-all` | `AUTHENTICATED` + scope/state |
| logout | POST `/auth/logout` | `AUTHENTICATED` + scope/state |

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-05 · Quản lý người dùng

Route `/users` · W02 · ADMIN · `list.svg`

Role/membership là tác vụ riêng; modal tạo có email bắtbuộc và password≤72UTF8bytes. Không gán role ngang/cao hơn mình.

Schema đọc: `User`; schema nhập: `UserCreate`.

| Tác vụ | API | Quyền |
|---|---|---|
| listUsers | GET `/users` | `USER_READ` + scope/state |
| createUser | POST `/users` | `USER_CREATE` + scope/state |
| getUser | GET `/users/{id}` | `USER_READ` + scope/state |
| updateUser | PATCH `/users/{id}` | `USER_UPDATE` + scope/state |
| deleteUser | DELETE `/users/{id}` | `USER_DELETE` + scope/state |
| changeUserRole | PUT `/users/{id}/role` | `USER_CHANGE_ROLE` + scope/state |
| resetUserPassword | POST `/users/{id}/password` | `USER_CHANGE_PASSWORD` + scope/state |

Fieldform: `phoneNumber` *, `displayName` *, `email` *, `password` *, `roleId` *, `warehouseIds` *, `dob`, `address`. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-06 · Vai trò

Route `/roles` · W02 · ADMIN · `list.svg`

Builtin family/code bấtbiến, không córuntimecreateSUPER_ADMIN; metadata update không bulkgrant quyền.

Schema đọc: `Role`; schema nhập: `RoleWrite`.

| Tác vụ | API | Quyền |
|---|---|---|
| listRoles | GET `/roles` | `ROLE_READ` + scope/state |
| getRole | GET `/roles/{id}` | `ROLE_READ` + scope/state |
| createRole | POST `/roles` | `ROLE_CREATE` + scope/state |
| updateRole | PATCH `/roles/{id}` | `ROLE_UPDATE` + scope/state |
| deleteRole | DELETE `/roles/{id}` | `ROLE_DELETE` + scope/state |

Fieldform: `name` *, `family` *, `level` *, `authorityCodes` *, `description`. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-07 · Ma trận quyền

Route `/permissions` · W02 · ADMIN · `matrix.svg`

Family ceiling và stateinvariants không thể bật. Ô đang request disabled, permissionepoch phải refresh sau save; không lạc quan báoPASS khiAPIlỗi.

Schema đọc: `Authority`; schema nhập: `Theo từng operation`.

| Tác vụ | API | Quyền |
|---|---|---|
| listAuthorities | GET `/authorities` | `MANAGE_PERMISSIONS` + scope/state |
| listAuthorityGroups | GET `/authority-groups` | `MANAGE_PERMISSIONS` + scope/state |
| putRoleAuthority | PUT `/roles/{id}/authorities/{authorityCode}` | `MANAGE_PERMISSIONS` + scope/state |
| deleteRoleAuthority | DELETE `/roles/{id}/authorities/{authorityCode}` | `MANAGE_PERMISSIONS` + scope/state |
| updateAuthorityMetadata | PATCH `/authorities/{id}` | `MANAGE_PERMISSIONS` + scope/state |

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-08 · Tệp đính kèm

Route `dialog:file-attachment` · W02 · ADMIN, MANAGER, SUPERVISOR · `form.svg`

Purpose hiển thị giới hạn/type trước chọnfile; exactsizeinclusive; generic10MiBkhôngđược gắn tài chính>5MiB. Showmãlỗiriêng, retry không uploadnhânđôi.

Schema đọc: `FileMetadata`; schema nhập: `Theo từng operation`.

| Tác vụ | API | Quyền |
|---|---|---|
| uploadFile | POST `/files` | `FILE_CREATE` + scope/state |
| getFileMetadata | GET `/files/{id}` | `FILE_READ` + scope/state |
| getFileAccess | POST `/files/{id}/access` | `FILE_READ` + scope/state |

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-09 · Audit nghiệp vụ

Route `/audit` · W02 · ADMIN, MANAGER · `list.svg`

Filter actor/entity/action/kho/time; before/after đãmask, tiền/quyền theo kho; khôngnútxóa history.

Schema đọc: `AuditEvent`; schema nhập: `Theo từng operation`.

| Tác vụ | API | Quyền |
|---|---|---|
| listAuditEvents | GET `/audit-events` | `AUDIT_READ` + scope/state |

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-10 · Log kỹ thuật

Route `/technical-logs` · W02 · ADMIN · `list.svg`

MứcINFO/WARN/ERROR,traceId; dữliệuđãredact, khôngtoken/secret/bodyfile. Khôngpublicclearlogger.

Schema đọc: `TechnicalLog`; schema nhập: `Theo từng operation`.

| Tác vụ | API | Quyền |
|---|---|---|
| listTechnicalLogs | GET `/technical-logs` | `LOG_READ` + scope/state |

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-11 · Backup và yêu cầu restore

Route `/backups` · W02 · ADMIN · `list.svg`

Chỉtargetallowlist; restore dialognêu target/backup vàconfirmationcode. Nút tạojob không cónghĩa restore đãxong; showQUEUED/RUNNING/FAILED/SUCCEEDED.

Schema đọc: `Job`; schema nhập: `BackupRequest`.

| Tác vụ | API | Quyền |
|---|---|---|
| listBackupRequests | GET `/backup-requests` | `BACKUP_MANAGE` + scope/state |
| createBackupRequest | POST `/backup-requests` | `BACKUP_MANAGE` + scope/state |
| createRestoreRequest | POST `/restore-requests` | `BACKUP_MANAGE` + scope/state |
| getJob | GET `/jobs/{id}` | `JOB_READ` + scope/state |

Fieldform: `targetRef` *, `reason` *. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-12 · Kho và cửa hàng

Route `/warehouses` · W03 · ADMIN, MANAGER, SUPERVISOR · `list.svg`

Manager không sửa managerIds/roleassign bằngformname. Search/sort có thật trongcontract; scopekho độc lập Storefilter.

Schema đọc: `Warehouse`; schema nhập: `WarehouseWrite`.

| Tác vụ | API | Quyền |
|---|---|---|
| listWarehouses_warehouses | GET `/warehouses` | `WAREHOUSE_READ` + scope/state |
| getWarehouse_warehouses | GET `/warehouses/{id}` | `WAREHOUSE_READ` + scope/state |
| createWarehouse_warehouses | POST `/warehouses` | `WAREHOUSE_CREATE` + scope/state |
| updateWarehouse_warehouses | PATCH `/warehouses/{id}` | `WAREHOUSE_UPDATE` + scope/state |
| deleteWarehouse_warehouses | DELETE `/warehouses/{id}` | `WAREHOUSE_DELETE` + scope/state |
| listNamedMasters_stores | GET `/stores` | `STORE_READ` + scope/state |
| getNamedMaster_stores | GET `/stores/{id}` | `STORE_READ` + scope/state |
| createNamedMaster_stores | POST `/stores` | `STORE_CREATE` + scope/state |
| updateNamedMaster_stores | PATCH `/stores/{id}` | `STORE_UPDATE` + scope/state |
| deleteNamedMaster_stores | DELETE `/stores/{id}` | `STORE_DELETE` + scope/state |

Fieldform: `name` *, `storeId`, `managerIds` *, `memberIds` *, `isActive` *. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-13 · Nguyên vật liệu

Route `/materials` · W03 · ADMIN, MANAGER, SUPERVISOR · `list.svg`

PrimaryNCC thuộcsupplierIds, unitgốc, isExpiry, ngưỡng vàpositions; NSX/HSD xemtheolô. Hiểnthịngưỡngdefault/override/source; không gán một HSD cho cảcatalog.

Schema đọc: `Material`; schema nhập: `MaterialWrite`.

| Tác vụ | API | Quyền |
|---|---|---|
| listMaterials_materials | GET `/materials` | `MATERIAL_READ` + scope/state |
| createMaterial_materials | POST `/materials` | `MATERIAL_CREATE` + scope/state |
| updateMaterial_materials | PATCH `/materials/{id}` | `MATERIAL_UPDATE` + scope/state |
| deleteMaterial_materials | DELETE `/materials/{id}` | `MATERIAL_DELETE` + scope/state |
| setConversion | PUT `/materials/{id}/conversion-units` | `MATERIAL_UPDATE` + scope/state |
| setInventoryThresholds | PATCH `/warehouses/{warehouseId}/inventory/{id}/thresholds` | `MATERIAL_UPDATE` + scope/state |
| getMaterial_materials | GET `/materials/{id}` | `MATERIAL_READ` + scope/state |

Fieldform: `name` *, `typeId` *, `baseUnitId` *, `isExpiry` *, `minimumQuantity` *, `maximumQuantity` *, `supplierIds` *, `description`, `isActive` *, `primarySupplierId` *, `positions` *, `attachmentIds`. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-14 · Đơn vị và quy đổi

Route `/units` · W03 · ADMIN, MANAGER · `list.svg`

Symbol/3dimension; factor theoMaterial. Cùng vật tư1baseUnit, khôngtựquyđổi cam→nước/vỏ.

Schema đọc: `Unit`; schema nhập: `UnitWrite`.

| Tác vụ | API | Quyền |
|---|---|---|
| listUnits_units | GET `/units` | `UNIT_READ` + scope/state |
| createUnit_units | POST `/units` | `UNIT_CREATE` + scope/state |
| updateUnit_units | PATCH `/units/{id}` | `UNIT_UPDATE` + scope/state |
| deleteUnit_units | DELETE `/units/{id}` | `UNIT_DELETE` + scope/state |
| setConversion | PUT `/materials/{id}/conversion-units` | `MATERIAL_UPDATE` + scope/state |
| getUnit_units | GET `/units/{id}` | `UNIT_READ` + scope/state |

Fieldform: `name` *, `symbol` *, `dimension` *, `isActive` *. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-15 · Nhà cung cấp

Route `/suppliers` · W03 · ADMIN, MANAGER, SUPERVISOR · `list.svg`

Liênhệ/terms/website đầyđủ; tabtransaction vàcostchỉManager/Admin. Mụcđangdùngkhôngxóa; thôngbáo lỗi409 rõnguyênnhân.

Schema đọc: `Supplier`; schema nhập: `SupplierWrite`.

| Tác vụ | API | Quyền |
|---|---|---|
| listSuppliers_suppliers | GET `/suppliers` | `SUPPLIER_READ` + scope/state |
| createSupplier_suppliers | POST `/suppliers` | `SUPPLIER_CREATE` + scope/state |
| updateSupplier_suppliers | PATCH `/suppliers/{id}` | `SUPPLIER_UPDATE` + scope/state |
| deleteSupplier_suppliers | DELETE `/suppliers/{id}` | `SUPPLIER_DELETE` + scope/state |
| listSupplierTransactions | GET `/suppliers/{id}/transactions` | `FINANCE_READ` + scope/state |
| listPaymentTerms | GET `/payment-terms` | `SUPPLIER_READ` + scope/state |
| createPaymentTerm | POST `/payment-terms` | `PAYMENT_TERM_MANAGE` + scope/state |
| getSupplier_suppliers | GET `/suppliers/{id}` | `SUPPLIER_READ` + scope/state |

Fieldform: `name` *, `phoneNumber`, `email`, `address`, `taxCode`, `paymentTermId`, `materialIds` *, `note`, `isActive` *, `contactPerson`, `website`. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-16 · Vị trí lưu kho

Route `/warehouses/:warehouseId/positions` · W03 · ADMIN, MANAGER, SUPERVISOR · `list.svg`

Location/notes vàmaterialassignment theoWarehouse; không gán vịtrí kho khác bằngsửa ID.

Schema đọc: `Position`; schema nhập: `PositionWrite`.

| Tác vụ | API | Quyền |
|---|---|---|
| listPositions | GET `/warehouses/{warehouseId}/positions` | `MATERIAL_READ` + scope/state |
| createPosition | POST `/warehouses/{warehouseId}/positions` | `MATERIAL_CREATE` + scope/state |
| updatePosition | PATCH `/warehouses/{warehouseId}/positions/{id}` | `MATERIAL_UPDATE` + scope/state |
| deletePosition | DELETE `/warehouses/{warehouseId}/positions/{id}` | `MATERIAL_DELETE` + scope/state |

Fieldform: `name` *, `location`, `isActive` *. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-17 · Tồn kho, lô và truy xuất

Route `/warehouses/:warehouseId/inventory` · W04 · ADMIN, MANAGER, SUPERVISOR · `list.svg`

Quantity/baseUnit/vịtrí/HSD theo lô; Supervisor không thấycost/value. PENDING_RECONCILIATION phải cólabel, khônghiểnthị0đ thaymissingcost; khôngnútPATCHquantity.

Schema đọc: `Inventory`; schema nhập: `Theo từng operation`.

| Tác vụ | API | Quyền |
|---|---|---|
| listInventory | GET `/warehouses/{warehouseId}/inventory` | `INVENTORY_READ` + scope/state |
| listBatches | GET `/warehouses/{warehouseId}/batches` | `INVENTORY_READ` + scope/state |
| listInventoryHistory | GET `/warehouses/{warehouseId}/inventory-history` | `INVENTORY_READ` + scope/state |
| getBatchTrace | GET `/batches/{id}/trace` | `INVENTORY_READ` + scope/state |

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-18 · Phiếu nhập

Route `/warehouses/:warehouseId/import-forms` · W04 · ADMIN, MANAGER, SUPERVISOR · `list.svg`

Đủfilter nghiệpvụ/creator/approver/NCC/vật tư/ngày,status; originPURCHASE/TRANSFER_IN. Số phiếudo servercấp, khôngônhậpmãchínhthức.

Schema đọc: `ImportForm`; schema nhập: `Theo từng operation`.

| Tác vụ | API | Quyền |
|---|---|---|
| listImportForms | GET `/warehouses/{warehouseId}/import-forms` | `IMPORT_FORM_READ` + scope/state |
| getImportForm | GET `/warehouses/{warehouseId}/import-forms/{id}` | `IMPORT_FORM_READ` + scope/state |

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-19 · Lập và duyệt nhập

Route `/warehouses/:warehouseId/import-forms/new` · W04 · ADMIN, MANAGER, SUPERVISOR · `wizard.svg`

Bước1NCC/ngày/PO/VAT; bước2dòng/đơnvị/NSX/HSD/ảnh; bước3review/cảnhbáo/xácnhận. CreatorSupervisor, Managerduyệt; labelnháp/gửi chưa cộngtồn.

Schema đọc: `ImportForm`; schema nhập: `ImportDraft`.

| Tác vụ | API | Quyền |
|---|---|---|
| createImportForm | POST `/warehouses/{warehouseId}/import-forms` | `IMPORT_FORM_CREATE` + scope/state |
| updateImportForm | PATCH `/warehouses/{warehouseId}/import-forms/{id}` | `IMPORT_FORM_UPDATE_DRAFT_OWN` + scope/state |
| submitImportForm | POST `/warehouses/{warehouseId}/import-forms/{id}/submit` | `IMPORT_FORM_SUBMIT_OWN` + scope/state |
| returnImportForm | POST `/warehouses/{warehouseId}/import-forms/{id}/return` | `IMPORT_FORM_CONFIRM` + scope/state |
| confirmImportForm | POST `/warehouses/{warehouseId}/import-forms/{id}/confirm` | `IMPORT_FORM_CONFIRM` + scope/state |
| cancelImportForm | POST `/warehouses/{warehouseId}/import-forms/{id}/cancel` | `IMPORT_FORM_CANCEL_OWN` + scope/state |

Fieldform: `supplierId` *, `businessDate` *, `poNumber`, `invoiceNumber`, `note`, `attachmentIds`, `items` *, `requesterId`, `vatRate`. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-20 · Phiếu xuất

Route `/warehouses/:warehouseId/export-forms` · W04 · ADMIN, MANAGER, SUPERVISOR · `list.svg`

Sáu loại, lọc vật tư/status/ngày/actor. Đánh dấu chứngtừtransferđốiứng và truyết tiền khôngsinhcash.

Schema đọc: `ExportForm`; schema nhập: `Theo từng operation`.

| Tác vụ | API | Quyền |
|---|---|---|
| listExportForms | GET `/warehouses/{warehouseId}/export-forms` | `EXPORT_FORM_READ` + scope/state |
| getExportForm | GET `/warehouses/{warehouseId}/export-forms/{id}` | `EXPORT_FORM_READ` + scope/state |

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-21 · Lập và duyệt xuất

Route `/warehouses/:warehouseId/export-forms/new` · W04 · ADMIN, MANAGER, SUPERVISOR · `wizard.svg`

PreviewFEFOserverkhônggiữchỗ; 409thiếutồn làmreloadpreview. Hủyảnh+lýdo; transferkhođích; >30%Managerconfirm; khôngchochangerole hoặc statebằngfieldform.

Schema đọc: `ExportForm`; schema nhập: `ExportDraft`.

| Tác vụ | API | Quyền |
|---|---|---|
| createExportForm | POST `/warehouses/{warehouseId}/export-forms` | `EXPORT_FORM_CREATE` + scope/state |
| updateExportForm | PATCH `/warehouses/{warehouseId}/export-forms/{id}` | `EXPORT_FORM_UPDATE_DRAFT_OWN` + scope/state |
| previewFefoExport | POST `/warehouses/{warehouseId}/export-preview` | `EXPORT_FORM_CREATE` + scope/state |
| submitExportForm | POST `/warehouses/{warehouseId}/export-forms/{id}/submit` | `EXPORT_FORM_SUBMIT_OWN` + scope/state |
| returnExportForm | POST `/warehouses/{warehouseId}/export-forms/{id}/return` | `EXPORT_FORM_CONFIRM` + scope/state |
| confirmExportForm | POST `/warehouses/{warehouseId}/export-forms/{id}/confirm` | `EXPORT_FORM_CONFIRM` + scope/state |
| cancelExportForm | POST `/warehouses/{warehouseId}/export-forms/{id}/cancel` | `EXPORT_FORM_CANCEL_OWN` + scope/state |

Fieldform: `type` *, `businessDate` *, `destinationWarehouseId`, `reason`, `attachmentIds`, `items` *, `note`, `requesterId`, `poNumber`, `receiverId`. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-22 · Kiểm kho

Route `/warehouses/:warehouseId/stocktakes` · W05 · ADMIN, MANAGER, SUPERVISOR · `list.svg`

NgườilậpkếhoạchManager/Admin,≥2Supervisorassigned; Draftchưa khóa, STARTmớikhóa.

Schema đọc: `Stocktake`; schema nhập: `StocktakeDraft`.

| Tác vụ | API | Quyền |
|---|---|---|
| listStocktakes | GET `/warehouses/{warehouseId}/stocktakes` | `BALANCE_FORM_READ|BALANCE_FORM_READ_ASSIGNED` + scope/state |
| createStocktake | POST `/warehouses/{warehouseId}/stocktakes` | `BALANCE_FORM_CREATE` + scope/state |
| getStocktake | GET `/warehouses/{warehouseId}/stocktakes/{id}` | `BALANCE_FORM_READ|BALANCE_FORM_READ_ASSIGNED` + scope/state |
| listEligibleCounters | GET `/warehouses/{warehouseId}/eligible-count-users` | `BALANCE_FORM_ASSIGN` + scope/state |

Fieldform: `type` *, `scope` *, `materialIds`, `assignedUserIds` *, `businessDate` *, `note`. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-23 · Workspace kiểm đếm

Route `/warehouses/:warehouseId/stocktakes/:id` · W05 · ADMIN, MANAGER, SUPERVISOR · `stocktake.svg`

Bảng sổ/thựctế/delta/%/reason/photo; từnguserackserver; >5%giảitrình,>10%điềutra. Bannerkhóakhohiệncảformnhập/xuất. Managerkháccreatorapprove đểdelta+mởkhóa.

Schema đọc: `Stocktake`; schema nhập: `StocktakeCount`.

| Tác vụ | API | Quyền |
|---|---|---|
| getStocktake | GET `/warehouses/{warehouseId}/stocktakes/{id}` | `BALANCE_FORM_READ|BALANCE_FORM_READ_ASSIGNED` + scope/state |
| startStocktake | POST `/warehouses/{warehouseId}/stocktakes/{id}/start` | `BALANCE_FORM_CREATE` + scope/state |
| acknowledgementsStocktake | POST `/warehouses/{warehouseId}/stocktakes/{id}/acknowledgements` | `BALANCE_FORM_RECORD_COUNT_ASSIGNED` + scope/state |
| countsStocktake | POST `/warehouses/{warehouseId}/stocktakes/{id}/counts` | `BALANCE_FORM_RECORD_COUNT_ASSIGNED` + scope/state |
| submitStocktake | POST `/warehouses/{warehouseId}/stocktakes/{id}/submit` | `BALANCE_FORM_COMPLETE_ASSIGNED` + scope/state |
| confirmStocktake | POST `/warehouses/{warehouseId}/stocktakes/{id}/confirm` | `BALANCE_FORM_APPROVE` + scope/state |
| cancelStocktake | POST `/warehouses/{warehouseId}/stocktakes/{id}/cancel` | `BALANCE_FORM_CANCEL` + scope/state |

Fieldform: `version` *, `materialId` *, `batchId` *, `actualQuantity` *, `reasonCode`, `explanation`, `photoIds`. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-24 · Sản phẩm và nguồn POS

Route `/products` · W06 · ADMIN, MANAGER, SUPERVISOR · `list.svg`

Chưa nguồnPOS: empty/statebanner rõ, syncdisabled hoặc409DEPENDENCY_NOT_READY. KhôngcómanualproductCRUDthaytíchhợp, khôngfake dữliệu nhưPOSthật.

Schema đọc: `Product`; schema nhập: `Theo từng operation`.

| Tác vụ | API | Quyền |
|---|---|---|
| listProducts | GET `/products` | `PRODUCT_READ` + scope/state |
| getProduct | GET `/products/{id}` | `PRODUCT_READ` + scope/state |
| requestProductSync | POST `/products/sync` | `PRODUCT_SYNC` + scope/state |

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-25 · Định mức và giá cost

Route `/variants/:id/recipe` · W06 · ADMIN, MANAGER · `form.svg`

≥1NVL/qty>0; manualcost/estimated/source vàSYNC/MANUALgiábántáchbiệt. Missingpricekhôngtínhtỷlệ40%; copyselected/history/archivekiểmđangdùng.

Schema đọc: `Recipe`; schema nhập: `RecipeWrite`.

| Tác vụ | API | Quyền |
|---|---|---|
| getVariant | GET `/variants/{id}` | `PRODUCT_READ` + scope/state |
| setVariantPricing | PATCH `/variants/{id}/pricing` | `RECIPE_UPDATE` + scope/state |
| getRecipe | GET `/variants/{id}/recipe` | `RECIPE_READ` + scope/state |
| replaceRecipe | PUT `/variants/{id}/recipe` | `RECIPE_UPDATE` + scope/state |
| copyRecipe | POST `/variants/{id}/recipe/copy` | `RECIPE_CREATE` + scope/state |
| archiveRecipe | POST `/variants/{id}/recipe/archive` | `RECIPE_DELETE` + scope/state |
| listRecipeHistory | GET `/variants/{id}/recipe/history` | `RECIPE_READ` + scope/state |

Fieldform: `version` *, `items` *, `manualCost`, `reason` *. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-26 · Phiếu chi và công nợ

Route `/warehouses/:warehouseId/expenses` · W07 · ADMIN, MANAGER, SUPERVISOR · `list.svg`

PURCHASEautoDRAFT/sourceamountreadonly; phíkhác≥1nhập. CODconfirmghi1settlement; DEBTconfirmedchưatrả, nútghi nhận thanh toánđủmộtlần. Hiệnphảitrả/đãtrả/cònnợ/tới hạn riêng.

Schema đọc: `FinanceForm`; schema nhập: `ExpenseDraft`.

| Tác vụ | API | Quyền |
|---|---|---|
| listExpenseForms | GET `/warehouses/{warehouseId}/expenses` | `WAREHOUSE_PAYMENT_READ|WAREHOUSE_PAYMENT_READ_OWN` + scope/state |
| getExpenseForm | GET `/warehouses/{warehouseId}/expenses/{id}` | `WAREHOUSE_PAYMENT_READ|WAREHOUSE_PAYMENT_READ_OWN` + scope/state |
| createExpenseForm | POST `/warehouses/{warehouseId}/expenses` | `WAREHOUSE_PAYMENT_CREATE` + scope/state |
| updateExpenseForm | PATCH `/warehouses/{warehouseId}/expenses/{id}` | `WAREHOUSE_PAYMENT_UPDATE_DRAFT_OWN` + scope/state |
| submitExpenseForm | POST `/warehouses/{warehouseId}/expenses/{id}/submit` | `WAREHOUSE_PAYMENT_SUBMIT_OWN` + scope/state |
| returnExpenseForm | POST `/warehouses/{warehouseId}/expenses/{id}/return` | `WAREHOUSE_PAYMENT_APPROVE` + scope/state |
| confirmExpenseForm | POST `/warehouses/{warehouseId}/expenses/{id}/confirm` | `WAREHOUSE_PAYMENT_APPROVE` + scope/state |
| cancelExpenseForm | POST `/warehouses/{warehouseId}/expenses/{id}/cancel` | `WAREHOUSE_PAYMENT_CANCEL_OWN` + scope/state |
| settleExpense | POST `/warehouses/{warehouseId}/expenses/{id}/settlement` | `WAREHOUSE_PAYMENT_APPROVE` + scope/state |

Fieldform: `businessDate` *, `partnerId`, `netAmount` *, `vatRate`, `paymentMethod` *, `reason`, `attachmentIds`, `sources` *, `note`, `type` *, `paymentTermId` *, `bankReference`, `requesterId`, `payerId`, `invoiceStatus`. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-27 · Phiếu thu và các đợt hoàn

Route `/warehouses/:warehouseId/revenues` · W07 · ADMIN, MANAGER, SUPERVISOR · `list.svg`

Mỗiđợt1phiếu,sumconfirmed≤groupExpected; Hoàn/Bồi/Thanh lý phảiđúngsource. KhôngtựbùtrừAP/AR hoặcđổitồn từPhiếuThu.

Schema đọc: `FinanceForm`; schema nhập: `RevenueDraft`.

| Tác vụ | API | Quyền |
|---|---|---|
| listRevenueForms | GET `/warehouses/{warehouseId}/revenues` | `REVENUE_FORM_READ|REVENUE_FORM_READ_OWN` + scope/state |
| getRevenueForm | GET `/warehouses/{warehouseId}/revenues/{id}` | `REVENUE_FORM_READ|REVENUE_FORM_READ_OWN` + scope/state |
| createRevenueForm | POST `/warehouses/{warehouseId}/revenues` | `REVENUE_FORM_CREATE` + scope/state |
| updateRevenueForm | PATCH `/warehouses/{warehouseId}/revenues/{id}` | `REVENUE_FORM_UPDATE_DRAFT_OWN` + scope/state |
| submitRevenueForm | POST `/warehouses/{warehouseId}/revenues/{id}/submit` | `REVENUE_FORM_SUBMIT_OWN` + scope/state |
| returnRevenueForm | POST `/warehouses/{warehouseId}/revenues/{id}/return` | `REVENUE_FORM_APPROVE` + scope/state |
| confirmRevenueForm | POST `/warehouses/{warehouseId}/revenues/{id}/confirm` | `REVENUE_FORM_APPROVE` + scope/state |
| cancelRevenueForm | POST `/warehouses/{warehouseId}/revenues/{id}/cancel` | `REVENUE_FORM_CANCEL_OWN` + scope/state |
| createRefundGroup | POST `/warehouses/{warehouseId}/refund-groups` | `REVENUE_FORM_CREATE` + scope/state |
| getRefundGroup | GET `/warehouses/{warehouseId}/refund-groups/{id}` | `REVENUE_FORM_READ|REVENUE_FORM_READ_OWN` + scope/state |

Fieldform: `businessDate` *, `partnerId`, `netAmount` *, `vatRate`, `paymentMethod` *, `reason` *, `attachmentIds`, `sources`, `note`, `type` *, `bankReference`, `refundGroupId`, `installmentNo`, `plannedInstallments`, `requesterId`. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-28 · Cảnh báo và thông báo

Route `/warehouses/:warehouseId/alerts` · W08 · ADMIN, MANAGER, SUPERVISOR · `list.svg`

INFO/WARNING/CRITICAL; in-app/email, khôngSMSphasehiệntại. Drilldownscoped, lịch sửdelivery/retrykhôngẩn; readstatecủangườinhận, khôngcoi toastERRORlàstatusphiếu.

Schema đọc: `Alert`; schema nhập: `Theo từng operation`.

| Tác vụ | API | Quyền |
|---|---|---|
| listAlerts | GET `/warehouses/{warehouseId}/alerts` | `ALERT_READ` + scope/state |
| markAlertRead | POST `/warehouses/{warehouseId}/alerts/{id}/read` | `ALERT_READ` + scope/state |
| setAlertSettings | PUT `/warehouses/{warehouseId}/alert-settings` | `ALERT_CONFIGURE` + scope/state |

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-29 · Dashboard và báo cáo

Route `/warehouses/:warehouseId/reports` · W09 · ADMIN, MANAGER · `dashboard.svg`

CutoffVN/from-to, watermark vàFULL/PARTIALrõ; chart+table+drilldowncùngfilter. Customreportallowlist, Excel/PDF/CSVbản thật. ScheduledemailkhôngbậtjobthậttrongDEVLOCAL.

Schema đọc: `Report`; schema nhập: `CustomReport`.

| Tác vụ | API | Quyền |
|---|---|---|
| report_dashboard | GET `/warehouses/{warehouseId}/reports/dashboard` | `REPORT_READ` + scope/state |
| report_inventory_movement | GET `/warehouses/{warehouseId}/reports/inventory-movement` | `REPORT_READ` + scope/state |
| report_stock_value | GET `/warehouses/{warehouseId}/reports/stock-value` | `REPORT_READ` + scope/state |
| report_imports | GET `/warehouses/{warehouseId}/reports/imports` | `REPORT_READ` + scope/state |
| report_exports | GET `/warehouses/{warehouseId}/reports/exports` | `REPORT_READ` + scope/state |
| report_stocktakes | GET `/warehouses/{warehouseId}/reports/stocktakes` | `REPORT_READ` + scope/state |
| report_supplier_performance | GET `/warehouses/{warehouseId}/reports/supplier-performance` | `REPORT_READ` + scope/state |
| report_expiry | GET `/warehouses/{warehouseId}/reports/expiry` | `REPORT_READ` + scope/state |
| report_expense_revenue | GET `/warehouses/{warehouseId}/reports/expense-revenue` | `REPORT_READ` + scope/state |
| report_debt | GET `/warehouses/{warehouseId}/reports/debt` | `REPORT_READ` + scope/state |
| report_wastage | GET `/warehouses/{warehouseId}/reports/wastage` | `REPORT_READ` + scope/state |
| runCustomReport | POST `/warehouses/{warehouseId}/reports/custom` | `REPORT_CUSTOM` + scope/state |
| exportReport | POST `/warehouses/{warehouseId}/report-exports` | `REPORT_EXPORT` + scope/state |
| setReportSchedule | PUT `/warehouses/{warehouseId}/report-schedules` | `REPORT_SCHEDULE` + scope/state |

Fieldform: `name` *, `dimensions` *, `measures` *, `fromDate` *, `toDate` *. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-30 · Nhập Excel

Route `/warehouses/:warehouseId/excel-imports` · W10 · ADMIN, MANAGER, SUPERVISOR · `wizard.svg`

Templatev1,≤1000dòng/5MiB, previewrowerror, ATOMIC_CREATE_ONLY. Vật tưAdmin/Manager; phiếunhậpSupervisor. CreateDRAFTkhôngconfirmtồn. Một dònglỗi thìjobkhôngghidòngnào.

Schema đọc: `ExcelPreview`; schema nhập: `ExcelJobCreate`.

| Tác vụ | API | Quyền |
|---|---|---|
| getExcelTemplate | GET `/excel-templates/{templateId}` | `EXCEL_IMPORT` + scope/state |
| previewExcelImport | POST `/warehouses/{warehouseId}/excel-imports` | `EXCEL_IMPORT` + scope/state |
| getExcelImportPreview | GET `/warehouses/{warehouseId}/excel-imports/{id}` | `EXCEL_IMPORT` + scope/state |
| confirmExcelImport | POST `/warehouses/{warehouseId}/excel-imports/{id}/confirm` | `EXCEL_IMPORT` + scope/state |

Fieldform: `fileId` *, `templateVersion` *, `target` *, `mode` *. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-31 · Lưu trữ và khôi phục

Route `/archives` · W11 · ADMIN · `form.svg`

Chỉtargetallowlist, thời hạn≥2năm, requestjob/manifest/restoređốisoát; khôngclientDBconnection hoặcactiveproductiontarget.

Schema đọc: `Job`; schema nhập: `Theo từng operation`.

| Tác vụ | API | Quyền |
|---|---|---|
| requestArchive | POST `/archives/requests` | `ARCHIVE_MANAGE` + scope/state |
| createRestoreRequest | POST `/restore-requests` | `BACKUP_MANAGE` + scope/state |
| getJob | GET `/jobs/{id}` | `JOB_READ` + scope/state |

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.

## UI-32 · Loại nguyên vật liệu

Route `/material-types` · W03 · ADMIN, MANAGER, SUPERVISOR · `list.svg`

Dùng quyềnMATERIALcùngmigration hiệncó; khôngtạoMATERIAL_TYPEcodegiả nếu chưa cóseed. Categoryđangđượcmaterialdùngkhôngxóa.

Schema đọc: `NamedMaster`; schema nhập: `NamedMasterWrite`.

| Tác vụ | API | Quyền |
|---|---|---|
| listNamedMasters_material_types | GET `/material-types` | `MATERIAL_READ` + scope/state |
| createNamedMaster_material_types | POST `/material-types` | `MATERIAL_CREATE` + scope/state |
| getNamedMaster_material_types | GET `/material-types/{id}` | `MATERIAL_READ` + scope/state |
| updateNamedMaster_material_types | PATCH `/material-types/{id}` | `MATERIAL_UPDATE` + scope/state |
| deleteNamedMaster_material_types | DELETE `/material-types/{id}` | `MATERIAL_DELETE` + scope/state |

Fieldform: `name` *, `description`, `isActive` *. Field và boundary chi tiết theoOpenAPI/schema, không viết rule khác ởFE.

422 gắn lỗi vào field + focus đầu lỗi; 409 nêu nguyên nhân/reload và không ghi đè; 401 lock/login; 403 ẩn thao tác và giải thích; 404 không lộ đối tượng ngoài scope; offline không tự gửi lại giao dịch bằng key mới.
