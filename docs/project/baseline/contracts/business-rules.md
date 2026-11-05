> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# Quy tắc contract cần thực thi — không suy ra từ schema shape

APPROVED FOR DESIGN, WH-DEC-20261105-R2. Các kiểm tra sau là bắt buộc tại Storage Service, kể cả gọi trực tiếp RPC. OpenAPI/protobuf hợp lệ chưa chứng minh các luật này đã được code hoặc test trên API.

## Protocol chung

- `/api/v1` dùng UUID; slug legacy chỉ qua adapter đã ghi mapping. Không cho client sửa id/code/creator/approver/status/postedAt/tổng tiền tính toán.
- Tạo phiếu và action ghi sổ có `Idempotency-Key`16–128ký tự. Unique `(principalId,operationId,key)`; cùng key+cùng normalized payload trả kết quả trước, cùng key+payload khác trả409. Giữ bản ghi≥7ngày; bút toán có unique business source vĩnh viễn trong thời hạn lưu, không dựa TTL để chống ghi trùng.
- Update/action có version chính xác; check lại version/state **bên trong transaction đã khóa**, không chỉ check trước transaction. Không giữ transaction DB qua một HTTP/gRPC call ra bên ngoài.
- `PATCH` chỉ các field hiện diện; `null` chỉ được clear field được schema cho nullable; mảng nếu hiện diện là thay thế toàn bộ và validate đủ từng phần tử. Payload chỉ có version không phải update hợp lệ.
- `PUT` thay toàn bộ representation được cho phép (recipe/conversion/settings), thiếu trường required bị422. Header/body/path không được mâu thuẫn warehouseId/entityId.
- API list: page1..,pageSize1..100, sortBy whitelist, q tối đa200ký tự. Không SQL từ client. Text chuẩn hóaNFC, tìm không phân biệt dấu; highlight index là UTF-16offset trên chuỗiNFC trả về, range[start,end). Không highlight sai do string đã normalize khác chuỗi hiển thị.
- Domain-specific filters: phiếu hỗ trợcode/status/type/ngàynghiệpvụ/ngày tạo/creator/approver/NCC/vật tư; batch hỗ trợmaterial/HSD/quantity; finance hỗ trợtype/partner/date/status/amount/due/linked source; mọi filter vẫn bị scope server giao nhau. Có thể truyền các filter này qua query đã khai báo trong API tương ứng, không nhận JSON SQL hoặc arbitrary field name.
- Form display và server phải dùng cùng decimal rounding/currency/timezone. Quantity,unitPrice,cost là decimal string; numeric JSON chỉ dùng count,rate,version. Kiểm UTF-8password tối đa72byte khi tạo/đổi để không bị bcrypt truncation; min12ký tự. Legacy account password yếu có quy trình reset, không tự đổi hash khi chưa xác thực.

## Auth/RBAC

- Access15phút; refresh≤7ngày, rotation/reuse-revoke; server idle30phút. Polling/refresh không gia hạn idle. Interactive activity endpoint chỉ caller session, rate limit; UI không gọi từ timer làm giả activity.
- Login lỗi dùng thông điệp chung, không tiết lộ account tồn tại; giới hạn20lần/phút theoIP+identifier, refresh30lần/phút/session; abuse vẫn không tạo token. CookieSecure/HttpOnly/SameSite=Lax/Path=/api/v1/auth; Originallowlist+CSRF ởrefresh, không wildcardCORScredentials.
- Custom role vẫn thuộc3family; không tạo runtimeSUPER_ADMIN. Admin chỉ tạo/gán role cấp dưới mình; role family/builtIn/code bất biến sau tạo. Thay quyền qua endpoint MANAGE_PERMISSIONS; ROLE_UPDATE metadata không được bulk grant để bypass.
- `x-authority` có dấu`|` là **OR trên mã quyền**, sau đó vẫn AND với family ceiling, warehouse scope và row policy. Không diễn giải dấu`|` là một authority literal mới; migration chỉ seed từng mã trong `authority-registry.json`.
- Permission thiếu annotation ở targetv1 là deny trừ authpublic cụ thể; không giữ default-authenticated cho route mới. Không có code để sửa/xóa confirmed; state invariant không thể bật lại qua role API.
- Supervisor xem/sửa own/assigned documents; được xem tiền trên chứng từ tài chính mình tạo/được giao, nhưng không được báo cáo tổng tài chính, công nợ toàn kho hoặc giá trị tồn. Giá trị/cost field phải bị **omit**, không gán0 để giả có giá trị.
- Manager không tạo nhập/xuất/thu/chi; Admin không mặc định vận hành. Manager có thể ghi metadata kho mình quản lý nhưng không đổi managerIds/role family hoặc cấp quyền hệ thống; quản lý membership chỉ từ usereligible đã có cùng store/scope. Candidate lookup cho kiểm kho không trả thông tin usernhạy cảm.

## Danh mục, đơn vị và giá trị

- min≥0,max>min; xóa material/unit/supplier đã được sử dụng bị409, soft delete không thay lịch sử. BaseUnit đã phát sinh không đổi bằngPATCH, cần migration riêng.
- Conversionfactor>0, cùng material, không vòng/cùng unit; basequantity=quantity×factor, unitcostbase=unitprice/factor. Không coi cam→nước/vỏ là unit conversion.
- Importmỗi phiếu1NCC, quantity/unitprice>0,≥1item; POoptional. isExpiry=true cầnHSD trướcsubmit/confirm, HSD>ngày nhập; NSX≤ngày nhậpvà<HSDnếu có. Vật tưkhôngHSDcho phépnull, không dựng ngàygiả.
- Tồn/price theo kho; averagecostmovingweighted từ net trướcVAT. Nhập10×100rồi10×200:Q20,C150,V3000; xuất5:Q15,C150,V2250. Không updatecostkhi sửa recipe hoặc trả công nợ.
- VAT0..20,default0; netΣ(qty×unitprice), headerVATroundHALF_UP(net×VAT/100), grossround(net)+VAT; VNDchốtđồng, phân bổ sai số theo largestremainder/tieID. Không float, không roundtrung gianconversion.

## Nhập/xuất/lô/kiểm kho

- DRAFT/SUBMITTED không đổi tồn, không giữchỗ. Confirmkhóa warehouse/material/batch/header theo thứ tự deterministic `(warehouseId,materialId,batchId)` để giảm deadlock; retrydeadlock cùng key chỉ khi kết quảchưapost, không đổi idempotencykey.
- Exportcreate/update/submit/confirm đềuchecksumquantity từngmaterial khôngvượt on_hand; luônchecklại trongtransactionconfirm. Khôngtồnâm; nhiều nháp hợp lệ riêng không giữchỗ, nháp còn lại có thể thiếu khi confirm.
- FEFOserver chọn lô đủđiềukiện: expiry tăng, nullcuối, nhập tăng, batchIdtie. UIpreviewkhôngkhóatồn hoặc overridebatchorder. Không nhận allocationclient như dữkiện đãđúng; nếu contracttương lai cho override cầnCRriêng, hiệnkhông bật.
- Lô quáhạn khôngPRODUCTION/SALE; hủy/thanh lý theoD13+Manager/ảnh/lýdo. Xuất>30%tồn của vật tư tại confirm cần Manager xácnhậnngưỡng; đúng30%khôngvào ngưỡng. DISPOSALcần quyềnriêng.
- TRANSFERchỉ2kho khácnhau, Managerquyềncả2, mộttransactiontrừnguồn/cộngđích/carrycost/lineage; lỗi bấtkỳ rollbackcả2. Trongcùngkho là đổiPositionkhôngphảixuất/nhậpđốiứng.
- Tồn tổng=Σlô; allocationxuất=qtyxuất; sổgiá trị=Σbúttoán. Check cảbefore/after và decimal precision. Batchlegacythiếuprovenancekhôngđược hiểnthịnguồngiả.
- Kiểmkho khóaFULLtoànkho hoặcPARTIALmaterialsetbấtbiến khiSTART, giữquaSUBMITTED. Confirmphiếu khácvàstartlock phải tươngtranh cùnggate, không check-then-write ngoài transaction.
- ≥2assignedSupervisor và ≥2ackcủauserthật, không tin clientgửi danh sáchack. Mộtbộcounttổnghợp; mỗi lầnwritecount cóversion. >5%giảitrình,>10%điềutra/Managerack, sổ0/thực≠0làmứcđỏ; khôngchia0. Ảnhthựctếbắtbuộc trướcsubmit.
- Managerkháccreatorapprovestocktake→COMPLETED,deltađúngmộtlầnvàmởkhóa; canceltrướccompletekhôngdelta/mởkhóa. PATCHquantitydirectbịdeny, khôngnúpquyềnMATERIAL_UPDATEđểbỏquaquytrình.

## Finance/recipe/alert/report/import

- ExpensePURCHASEtựtạoDRAFTmộtlần khiimportconfirmed; khôngpostpaid. Chi phí khác bắtbuộc≥1confirmedimportcùngkho. Supplier/term/VAT đượcsnapshot, khôngsửaphiếucũtheodanhmụcmới.
- ThuHoàn/Bồi→import; Thanh lý→exportLIQUIDATIONconfirmed; Phếliệu/Khác cóthểkhôngsource. SourceAllocation phải cóchínhxác1loạiFK, không cả2/khôngcả2. Chứngtừtài chính≥1filepurposeFINANCIAL trướcsubmit/confirm.
- Mỗi đợthoànlàRevenueFormriêng; groupkhôngpostcash. Tổng100:đợt40confirmed→remaining60;đợt60confirmed→remaining0. Retrykhôngthành140; khôngchoΣconfirmed>target. FirstconfirmedkhóatotalExpected/plannedCountcủagroup, thayđổi cầnCRđốisoát.
- Recipe≥1NVL/địnhmức>0;copykhôngcopyidentity,audit hoặc versionnguồn;phiếu giữsnapshotversion. Archivechặnđangdùng vàkhôngxóahistory; khôngthêmmoduleyieldngầm.
- effectivecost=manualhợplệ nếuđãnhập, nếu chưa thìestimated; thiếuestimated thìMISSING_DATA. ModegiáSYNC/MANUALkhôngghiđèmanualcost. sellingprice≤0/thiếu→khôngtínhtỷlệ, không0%giả. >40%warn,=40%không.
- Alert min/maxdùng≤/≥;gầnhạn<30ngày,=30không;giáchênhabs>20%,=20không. Transactionrollbackkhônggửiin-app/email; event+recipient+channelunique, max5retry/deadletter. SMSdeferreduser, khôngđợiSMSprovider đểcodecore.
- Reportchỉconfirmed/stocktakecompleted, cutoffngàynghiệpvụVN[from00:00,to+1ngày00:00);drilldown/export/filterdùngcùngwatermark. Customreport chỉ whitelistdimensions/measures, max5dimensions, period≤2năm; khôngrawSQL.
- ExcelATOMIC_CREATE_ONLY≤1000dòng/5MiB,previewkhôngghibusinessdata; hàngtrùng báoerror chứkhôngupdateẩn. Một dòngfail thìtoànjobkhôngghi; applykeyunique. Importphiếu chỉtạoDRAFT, khôngtựconfirmđổitồn. MaterialsimportAdmin/Manager, importformsSupervisor; EXCEL_IMPORTkhôngbypassquyềnđối tượng.
- FilepurposeD30cósizeinclusive/type/contentchecks; generic≤10MiBkhôngbypassfinancial≤5MiB. CSVtextcóprefix=,+,-,@ phảiđượcescape; tiềnnumeric doexporterkiểmtype, khônggắntext nguyhiểm thànhformula.
- Backup/restoretargetrefchỉallowlistcủaenvironmentgrant; khôngnhậnarbitraryhost/passwordtừrequest. RuntimejobrequestkhôngcấpphépghiDBhiệnhữu. Archive≥2nămvàrestorekiểmchecksum/lineage; khôngdeletebusinessdataquacronlog.

Các đoạn chữ dính số chỉ là cách viết tắt trong contract; giá trị và toán tử so sánh là chuẩn. `field-map`/case data mới là nguồn mapping, không dùng regex trên message để xác định rule.
