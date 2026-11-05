> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# Dữ liệu, transaction và migration — baseline R2

APPROVED FOR DESIGN bởi điều phối theo ủy quyền, 05/11/2026. Căn cứ D24 SDD, D21 và D03–D37. Đây là mô hình đích và kế hoạch migration, **không phải migration đã chạy**.

## Nguồn và kiểu dữ liệu

- `sdd-field-inventory.json` giữ nguyên 339 lần xuất hiện trường trong 29 bảng SDD; `sdd-field-traceability.csv` ghi đích/alias/derived/storage-only/thay thế theo quyết định cho từng locator. Có dòng `files.slug` bị lặp trong nguồn; số339 không phải339cột phân biệt.
- `schemas.json` và OpenAPI là kiểu DTO. Tên bảng dưới đây là tên logic; không tự rename bảng production chỉ để khớp tên tiếng Anh. Entity/migration phải map bảng/column cũ rõ ràng, giữ alias/slug legacy.
- UUID lưu dạngchuỗi36ký tự; FK mới phải có cùng type/length/charset/collation với PK cha. Khi viếtmigration, kiểm metadata cột cha thay vì hardcode một collation khác. Không dùng `synchronize`.
- Quantity `DECIMAL(18,6)`; unit cost `DECIMAL(20,6)`; value/money `DECIMAL(20,4)`; phép tính trung gian Decimalprecision≥38. Ledgerdelta có dấu; quantity tồn và amount thực thu/chi không âm. VNDcashroundHALF_UP theoD09/D36/D37.
- Date nghiệp vụ là DATE theoAsia/Ho_Chi_Minh; created/updated/posted/audit là timestampUTC. Không đổi ngày nghiệp vụ từcreatedAt hoặc đoán ngày sinh từchuỗi mơ hồ.
- Mọi bảng nghiệp vụ cóid,version,created_at,updated_at; soft-delete thìdeleted_at mặcđịnhNULL. FK actor có thểnullableởbootstrap/system, nhưng eventUSERbắt buộcactorId. Password chỉhashbcrypt; refresh chỉhash/tokenfamily, khôngplaintext.

## Bảng và khóa bắt buộc

| Nhóm | Bảng logic / liên kết | Khóa, ràng buộc và index |
|---|---|---|
| Identity | users,roles,authorities,authority_groups,role_authorities | users.phone/email unique; roles.name unique kể cảđãxóa; authorities.code unique bấtbiến; role_authorities unique(role_id,authority_id), FKhaiđầu; rolefamily thuộc3giátrị |
| Scope | stores,warehouses,warehouse_managers,warehouse_members | manager/memberunique(warehouse_id,user_id); FKactiveuser/store; index user_id+warehouse_id; kiểmfamily/quyền ởservice, khôngclientgánrolebằngmemberfield |
| Session | sessions,refresh_token_families,refresh_token_hashes | unique tokenhash; session.user_idFK; family/sessionlinked; revoked/idle/tokenexpiry táchbiệt; chỉ1tokenhiệnhành/family; cacheepochkhônglà nguồn cấp quyền |
| Catalog | material_types,units,materials,suppliers,payment_terms | codeunique; units.symbol/dimension; materials.base_unit_idFK; primary_supplier_id thuộcmaterial_suppliers; paymenttermcodeunique vàsnapshot ởphiếu |
| Catalog links | material_suppliers,material_unit_conversions,positions,material_positions | unique(material_id,supplier_id); unique(material_id,unit_id),factor>0; positionunique(warehouse_id,code); material_positionunique(material_id,position_id), giữlocation_note |
| Inventory | inventory,batches,inventory_ledger | inventoryidPK+unique(warehouse_id,material_id); quantity≥0; batchsourceimportitemunique hoặc transferlineageunique; ledgerposting_keyunique; indexwarehouse/material/date; signedquantity/valuebefore/delta/after |
| Nhập | import_forms,import_items | codeunique; originPURCHASE/TRANSFER_IN; PURCHASEsupplierFKbắtbuộc, TRANSFER_INsource_export_idunique/NCCnull; itemform/material/unitFK; quantity/unitprice>0 chođơnmua; expiryconditionalD05 |
| Xuất | export_forms,export_items,export_batch_allocations | sáuloạiD13; destinationchỉTRANSFER; allocationFKexportitem/batch,unique(export_item_id,batch_id); Σallocationqty=itemqty; valueallocatedexacttheoD37 |
| Kiểm kho | stocktake_forms,stocktake_assignments,stocktake_acknowledgements,stocktake_counts,stocktake_locks | assignedunique(form,user); ackunique(form,user) vàphảiassigned; countunique(form,material,batch); lockunique(warehouse,material) hoặcwarehousefull-lock; khôngphối hợp bằngbooleanUI |
| Product/recipe | products,variants,recipe_versions,recipe_items,product_sync_cursors | unique(vendor,external_id) khicóvendor; variant.productFK; recipeversionunique(variant_id,version_no); itemunique(recipe_version_id,material_id,unit_id),qty>0; khôngxóaversionđãthamchiếu |
| Chi | expense_forms,expense_items,expense_sources,expense_settlements,payable_obligations | sourcePurchaseImportunique; expense_items lưuquantity/unitprice/net snapshot, khôngghi tồn; sourceFKnhiềunhập; settlement.expense_idunique, amount=fullremaining; obligationpostingunique theoD36 |
| Thu | revenue_forms,revenue_items,revenue_sources,revenue_refund_groups | sources import/exporttypedFK,XORtheotype; refundinstallmentunique(group_id,installment_no); groupkhôngpostcash; Σconfirmed≤expected; period/due/partnerindexes |
| Finance ledger | finance_ledger | posting_keyunique, source_id/type+postingkind, typedFK; cash/AP/ARtáchđại lượng, currencyVND; purchaseimport vàautoexpensedùngcùngobligationkhôngnhânnợ |
| File | file_objects,typed_file_attachment_links | objectkey/checksum/size/MIME/owner/purpose; liênkết cótypedFKđếnphiếu/material/user, CHECKđúng1entity; unique(file_id,entitylink); khônglưubase64/binary vàoMySQL |
| Audit/outbox | audit_logs,outbox_events,outbox_deliveries,request_idempotency | auditcùngtransactionbusiness; unique(command_id,entity_type,entity_id,action); outboxeventidPK; deliveryunique(event_id,recipient,channel); idempotencyunique(principal,operation,key),payloadhash bấtbiến |
| Alert/report | alerts,alert_recipients,notification_deliveries,report_definitions,report_schedules,report_schedule_recipients,summary_watermarks | recipientunique(alert,user); readstateperrecipient; deliverydedupe; reportdefinitionallowlist khôngSQL; watermark/orderconsumernhấtquán |
| Excel/job | excel_import_jobs,excel_import_rows,backup_jobs,archive_jobs | jobsourceidempotencyunique; rowunique(job_id,row_no); payload/filechecksumvàtemplateversion; jobtargetRefallowlist; chỉjobconfirmedmớighibusinessdata |
| Technical log | technical_logs hoặc sinklogđượcduyệt | LevelINFO/WARN/ERROR,traceId,index timestamp; redactsecret; retention30ngày, khôngápcleanup này lênbusinessaudit |

## Quy tắc persisted/derived quan trọng

- Tồnqty=Σbatchqty. CanonicalstockValue=Σledgerdelta; averagecost làratio hiểnthị, khôngnguồn đểtái tạo sổ. `receiptUnitCost`bấtbiến của lô khác `valuationUnitCost`derived. Legacythiếuvalue/phụcthuộcmơhồ phảiPENDING_RECONCILIATION, khôngzero-fill.
- Material.inventorytrongSDDlàprojectiontheokho, khôngcộttổngtoànhệthống được phép PATCH. NSX/HSD ởbatch/dòngnhập, Material.isExpiry làpolicy.
- Headernet/VAT/gross/dueDate/stocktakeTotalDifference tínhserver. Expenseitems củaPURCHASEsnapshot cácdòng nhập; phíkhác códòngphânbổquantity1 vàunitprice=allocatednet, khôngnhânmộtamountvàosổhainơi.
- Receipt/expenseattachments phânbiệt uploadprofilevà attachmentpurpose. Reuseobject hợp lệ bằngtypedlink saukiểmquyền/type/size, khôngcầnuploadlại hoặc đổiobjectkey.
- Auditbefore/afterđãmaskởDTO; IPđầyđủ cóthểgiữ ởstoragehạnchếđểtrace, APItrảipMasked. user_id/actorIdcũ mâu thuẫn phảiđốisoát, khôngtựchọn mộtgiátrị. Systemactor cóserviceidentity, khôngusergiả.
- Bankref ởDEBTchưathanh toán làoptional; bắtbuộc ởsettlementBANK_TRANSFER. Confirmedheaderbấtbiến; settlementappend-only làquan hệriêng, khôngsửaamountnguồn hoặc giả tiềnđãtrả.

## Transaction/locking mẫu bắt buộc

### Confirm nhập mua

1. Resolveprincipal/session/authority/scope; tạo/đọcidempotencyrow theooperation/key.
2. BEGIN; lockheader, kiểmversion/DRAFT→SUBMITTED→CONFIRMEDđúngaction; lockwarehousestocktakegate rồi inventoryrowtheosortedkey.
3. ValidateNCC,unit/factor,HSD/price/VAT, sourcecost/reconciliation; cấpcode/batchID; updateqty/value, insertledger/batch/audit/payableobligation vàoutboxautoExpense/alert.
4. MarkheaderCONFIRMED/version++; persistidempotencyresult; COMMIT. Outboxdispatcherchạysaucommit. Lỗibấtkỳ→ROLLBACK, khôngcộngtồn hoặc gửiemailmộtphần.

### Confirm xuất/transfer

Khóaheader/gatekho/stockrows/batches theo thứtự `(warehouseId,materialId,batchId)`. Checklạiđủtồn/quyềncả2kho/ảnh/ngưỡng, serverFEFO, postvalueD37. Transfercùngtransaction tạo nhậpđốiứng vàcộngđích; khôngsinhchi/thu. Deadlockretry dùngcùngkey; kếtquảtimeoutphảitra key, khôngđoánrollback.

### Complete kiểm kho

Lockform+scope+inventory/batches; kiểm≥2ackthật, ảnh/giảitrình/ngưỡng, Managerkháccreator. Ghideltaqty/value/ledger/audit, COMPLETED vàrelease locktrongcùngtransaction; crashkhôngđượcchỉ mởkhóa hoặcchỉpostdelta. Canceltrướccomplete khôngpostdelta.

## Kế hoạch migration/backfill/rollback

1. **Kiểm kê targettest:** SHA/diff, migrationhistory, PK/FK/collation/index vàrowscount. TargetchỉWH-TEST-ENV-20261105đãcấp; khôngđọc.envhoặcchạyvàoDBcósẵn. Scriptsetup trongtasknàykhôngchạymigrationứngdụng.
2. **Reserve ID:** migration047do`be-file-upload-auth-20261105`sởhữu; không dùnglại. Khi workerbắtđầu, đọclại maxmigration vàreservation trongtask; khôngrename/backdate cácmigrationđãchạy hoặc đồngthờitạoIDtrùng. SDDkhôngphảimigrationallowlist.
3. **Expand:** thêmcolumnnullable/table/index mới; schemađọcđược dữliệucũ, APIv1chưakíchhoạt. Unique/FKchỉthêm khiđã córeportduplicate/missingparent.
4. **Backfill:** ánhxạ339fieldvàalias; parseDatesrõràng, gánNCCchínhdoownerxácnhận, đối soátquantity/value/lot/receipt. CácphiếunhiềuNCC, thiếuvalue, sourceunknown, enumkhôngphânbiệt phải ởreconciliationlist. KhôngtựgánNCCđầu,giá0,ngàygiả hoặc nguồnnhậpgầnnhất.
5. **State/reservation:** PENDING→SUBMITTED, giải phóngreserved chỉởtransactioncóđốisoát; on_handkhôngđổi. Khôngxóareservedquantitybulk trước khi migratephiếuliênquan. Confirmedhistorykhôngviếtlạibằngv1enum màmấtorigin.
6. **Validate rồi constrain:** so before/afterqty/value/FK/count/checksum; khôngâm,Σlô=tổng, ledgerkhớp. ChỉsauđómớithêmNOTNULL/capabilityswitch/codeseed+cacheepochinvalidate. Mỗi@RequireAuthoritymớikèmcodevàmigrationcùngtask.
7. **Cutover:** W02chỉfoundation; W03catalog; W04transactions;W07finance; từngcapabilitycóparitytestvàrollback. LegacyAuthkhôngđượccoi đãđạtsecuritygate nếuvẫnlưu refreshtokenlocalStorage; chuyểnFEauthvàrevokeoldsessioncùngmốc. Legacybusinessaliaschỉgiữqualớpquyềnhợp lệ,khôngpublicdirectStorageHTTP.
8. **Rollback test:** ghiup/downkèmimpact. Nếuđãcóv1transaction, khôngdropcolumn/ledger đểrollback; dừngwritecapability, giữsnapshot vàdùngforward-fix/reconciliation. Revert DBhiệnhữu cầnquyềnriêng, khôngsuy từtasknày.

## Bằng chứng sau implement còn phải có

Migrationup/down trênDBtestriêng, rowscount/checksum, authority/cacherolesngườithật, race/rollback/idempotency, restoreDB+tệp vàprovenance. Shapevalidation339field khôngthaythế cácbằngchứng đó; trước code cácgate này cóprotocol, trạngtháiNOT_RUNđúngphase.
