> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# Quyết định hiệu lực R2 — 37/37 APPROVED

Điều phối phê duyệt theo ủy quyền người dùng, 05/11/2026. POS thật và SMS phase sau theo D11/D22; không giả runtime PASS. R1 giữ nguyên để truy vết.

- [D01 — Tự sinh phiếu chi/thu và liên kết chứng từ](../baseline/approvals/r2/D01.md): Xác nhận nhập tự sinh đúng một phiếu chi NHÁP mua NVL; thu được lập thủ công theo loại.
- [D02 — Ma trận vai trò/quyền, phạm vi kho–cửa hàng và phân công kiểm kho](../baseline/approvals/r2/D02.md): Ba vai trò nghiệp vụ Admin, Manager, Supervisor; dữ liệu nghiệp vụ có phạm vi kho; tách người tạo và duyệt.
- [D03 — Kiến trúc đích và ERD/API chủ](../baseline/approvals/r2/D03.md): Giữ kiến trúc đích trong ADR-001: React → REST Gateway → NestJS Storage Service qua gRPC → MySQL.
- [D04 — Trạng thái phiếu, thời điểm ghi tồn và giữ chỗ](../baseline/approvals/r2/D04.md): Tồn và sổ tiền chỉ thay đổi tại duyệt cuối; nháp/gửi duyệt không giữ chỗ tồn.
- [D05 — Giá nhập, NSX/HSD, biên cảnh báo và min/max](../baseline/approvals/r2/D05.md): Giá nhập >0, HSD theo chính sách vật tư, max>min; biên cảnh báo được định nghĩa thống nhất.
- [D06 — Lưu file, kích thước và quyền truy cập](../baseline/approvals/r2/D06.md): Tệp nằm trong private S3-compatible storage; MySQL lưu metadata; chứng từ tối đa 5MiB/tệp.
- [D07 — Visual, màn hình và hợp đồng API còn thiếu](../baseline/approvals/r2/D07.md): Chốt chuẩn hồ sơ API/UI và quy tắc giao diện; không lấy tài liệu trống làm căn cứ code.
- [D08 — Stack FE và chuẩn coding áp dụng từng app](../baseline/approvals/r2/D08.md): Chọn React/TypeScript + Ant Design + Redux Toolkit cho client state; React Query cho server cache.
- [D09 — Schema phiếu và đơn vị tiền/giá trị tồn](../baseline/approvals/r2/D09.md): Một NCC cho mỗi phiếu nhập; PO tùy chọn; tiền VND và giá trị tồn tính nhất quán theo đơn vị gốc.
- [D10 — Khóa kho, điều chỉnh, hủy, luân chuyển và ngưỡng kiểm kho](../baseline/approvals/r2/D10.md): Khóa kiểm kho bắt buộc khi bắt đầu; luân chuyển hai kho một bước nguyên tử; xuất hủy có lý do/ảnh.
- [D11 — POS vendor và contract bên ngoài](../baseline/approvals/r2/D11.md): Chốt POS khác sẽ tích hợp sau; phase hiện tại hoàn thiện ba API nội bộ và adapter port, không triển khai kết nối POS thật.
- [D12 — Cost, giá trị tồn và KPI/báo cáo](../baseline/approvals/r2/D12.md): Tách cost định mức khỏi giá vốn tồn; chốt sổ nguồn và công thức báo cáo.
- [D13 — Loại xuất kho, thanh lý và phiếu thu](../baseline/approvals/r2/D13.md): Sáu loại xuất riêng: PRODUCTION, SALE, DISPOSAL, TRANSFER, LIQUIDATION, OTHER.
- [D14 — Nghiệm thu bảo mật, audit, log và phục hồi](../baseline/approvals/r2/D14.md): Chốt session30phút, audit cùng transaction, backup30ngày và lưu nghiệp vụ≥2năm.
- [D15 — Phạm vi và protocol NFR/email/import/báo cáo](../baseline/approvals/r2/D15.md): Chốt protocol NFR, Excel import nguyên tử và email báo cáo; chưa tuyên bố đã đạt.
- [D16 — [Quản trị, không phải mâu thuẫn tài liệu] Tách nghiệm thu local và vận hành/CI/CD](../baseline/approvals/r2/D16.md): Phê duyệt DEV LOCAL; gate vận hành/CI/CD được hoãn có kiểm soát, không bỏ khỏi phạm vi.
- [D17 — Phạm vi toàn bộ, yêu cầu chưa có mã và tài liệu chưa có nội dung](../baseline/approvals/r2/D17.md): Giữ toàn bộ phạm vi BRD/SRS/UC/ADR; không thu gọn thành MVP hoặc chỉ44dòng function list.
- [D18 — [Quản trị/nguồn lực, không phải mâu thuẫn tài liệu] Nhân lực, DB test, T0 và deadline](../baseline/approvals/r2/D18.md): Dùng capacity lập kế hoạch1BE+1FE+1Tester toàn thời gian,5ngày/tuần; T0 theo gate, chưa áp deadline giả.
- [D19 — Liên kết phiếu nhập cho chi phí không phải mua NVL](../baseline/approvals/r2/D19.md): Mọi chi phí kho không phải mua NVL cũng phải liên kết≥1phiếu nhập.
- [D20 — Chứng từ của phiếu chi tạo từ phiếu nhập](../baseline/approvals/r2/D20.md): Chứng từ tài chính bắt buộc trước submit/confirm; draft có thể còn thiếu.
- [D21 — Xuất khi không đủ tồn: chặn hay cảnh báo](../baseline/approvals/r2/D21.md): Không cho lưu một phiếu xuất hợp lệ vượt tồn hiện tại; confirm luôn kiểm lại trong transaction.
- [D22 — Kênh, mức độ và thời điểm cảnh báo](../baseline/approvals/r2/D22.md): Phase hiện tại dùng in-app và email; SMS không triển khai trong phase hiện tại, giữ yêu cầu gốc ở FUT-SMS.
- [D23 — Điều khoản và phương thức thanh toán](../baseline/approvals/r2/D23.md): Admin cấu hình điều khoản thanh toán; seed COD/NET7/NET15/NET30; phương thức thu và chi tách danh mục.
- [D24 — Ngữ nghĩa xóa định mức/công thức](../baseline/approvals/r2/D24.md): Cho xóa dòng NVL và lưu phiên bản; xóa cả công thức là archive có kiểm tham chiếu.
- [D25 — Thiết kế phiếu thu thiếu trong SDD](../baseline/approvals/r2/D25.md): ExpenseForm/ExpenseItem cho chi, RevenueForm/RevenueItem cho thu; không tái dùng Transaction chung làm chứng từ tài chính.
- [D26 — Nguồn giá bán và chế độ cost](../baseline/approvals/r2/D26.md): Giá bán gốc lấy từ POS khi có; mode đồng bộ giá gốc không được ghi đè cost thủ công.
- [D27 — Nguyên liệu tách ra nhiều thành phần đầu ra](../baseline/approvals/r2/D27.md): Biểu diễn nước cam/vỏ cam bằng NVL riêng và công thức tham chiếu; không tự sinh sản lượng hoặc tồn kho từ việc đổi đơn vị.
- [D28 — Truy xuất nguồn gốc khi nhập nhiều lần](../baseline/approvals/r2/D28.md): Truy xuất theo batch bất biến từ dòng nhập, không dùng phiếu nhập gần nhất để đoán nguồn.
- [D29 — Vệ sinh tài liệu thiết kế](../baseline/approvals/r2/D29.md): Chuẩn hóa mã bằng alias có truy vết; không suy diễn chức năng còn thiếu từ số UC/BR nhảy.
- [D30 — Upload tổng quát, chứng từ tài chính và biên kích thước](../baseline/approvals/r2/D30.md): Generic upload≤10MiB với9loại; chứng từ tài chính≤5MiB/PDF-JPG-PNG; giới hạn là inclusive và kiểm theo purpose khi liên kết.
- [D31 — Gate trước implement và gate kiểm chứng sau implement](../baseline/approvals/r2/D31.md): Chốt riêng decision/design-entry, môi trường thực thi, QA và release; phê duyệt phase hiện tại không biến gate runtime tương lai thành PASS.
- [D32 — Cấp môi trường test local mới và ranh giới dữ liệu](../baseline/approvals/r2/D32.md): Cấp MySQL/Redis test riêng cho task; chỉ probe và dữ liệu test đã định nghĩa, không truy cập môi trường/credential hiện hữu.
- [D33 — Đủ trường danh mục, đơn vị và vị trí trước implement](../baseline/approvals/r2/D33.md): Unit có ký hiệu và3nhóm; Material có NCC chính thuộc danh sách NCC; vị trí/HSD trình bày theo kho/lô, không ghép một ngày HSD giả vào catalog.
- [D34 — Luân chuyển không sinh chi mua NVL hoặc làm tăng giá trị toàn hệ thống](../baseline/approvals/r2/D34.md): ImportphânbiệtPURCHASEvàTRANSFER_IN; chỉPURCHASEconfirmed tựtạo chi, transfer cóphiếunhậpđốiứng vàgiátrị nguồn, khôngphátsinhcash.
- [D35 — Ngữ nghĩa trường SDD, actor và field chuyển đổi](../baseline/approvals/r2/D35.md): Giữ đủ trường SDD bằng mapping có nguồn; không dùng default lỗi hoặc tên tương tự để gộp mất nghĩa.
- [D36 — Công nợ, đã trả tiền và đối soát chi từ nhập](../baseline/approvals/r2/D36.md): Tách nghĩa vụ phải trả khỏi dòng tiền; chi côngnợconfirmed chưa phảiđãtrả, chỉsettlementghi nhận tiền thực chi.
- [D37 — Giá gốc của lô, bình quân và làm tròn sổ giá trị](../baseline/approvals/r2/D37.md): Số lượng theo lô và định giá bình quân là hai chiều khác nhau; canonicalstockValue từledger, không tính lại từgiágốclô hoặc đơn giáđãlàm tròn.
