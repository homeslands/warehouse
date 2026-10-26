/**
 * Dữ liệu worst-case cho sheet phiếu nhập (skill `break-ui`): giá trị THẬT có thể gặp hoặc đúng giới hạn backend —
 * tên NCC / vật tư / kho `varchar(255)`, mã ≤ 32 ký tự (`BUSINESS_CODE_REGEX`), số hoá đơn ≤ 64, số lượng / tiền chạm
 * trần `DECIMAL(18,6)` / `DECIMAL(18,2)`. Giữ lại làm bộ hồi quy: `ImportFormSheet.break-ui.test.tsx`.
 */
import type { AvailableMaterial, ImportForm } from '@/entities/import-form'
import type { Supplier } from '@/entities/supplier'

const stamp = { createdAt: '', updatedAt: '' }

export const WORST_WAREHOUSE_NAME =
  'Kho nguyên vật liệu Chi nhánh Bình Dương — Khu công nghiệp VSIP II-A, Thủ Dầu Một'

export const WORST_SUPPLIERS: Supplier[] = [
  {
    slug: 's-long',
    code: 'NCC-HCM-2026-000123',
    name: 'Công ty TNHH Thương mại Dịch vụ Xuất nhập khẩu Vật tư Ngọc Minh Phát Đạt',
    ...stamp,
  },
  {
    slug: 's-env',
    code: 'NCC06',
    name: 'Công ty Cổ phần Đầu tư và Phát triển Công nghệ Môi trường Sài Gòn Xanh',
    ...stamp,
  },
  { slug: 's-an', code: 'AN', name: 'An', ...stamp },
]

export const WORST_MATERIALS: AvailableMaterial[] = [
  {
    slug: 'm-steel',
    code: 'MAT-THEP-CUON-CB300V-D10',
    name: 'Thép cuộn cán nóng CB300-V phi 10 mạ kẽm nhúng nóng tiêu chuẩn TCVN 1651-2:2018 (cuộn 2 tấn)',
    baseUnitSlug: 'u-kg',
    quantity: 1_234_567.123456,
    suppliers: [
      { slug: 's-long', code: 'NCC-HCM-2026-000123', name: WORST_SUPPLIERS[0].name },
      { slug: 's-env', code: 'NCC06', name: WORST_SUPPLIERS[1].name },
    ],
    units: [
      {
        unitSlug: 'u-kg',
        unitCode: 'KG',
        unitName: 'Kilogram',
        conversionRate: 1,
        isBaseUnit: true,
      },
      {
        unitSlug: 'u-coil',
        unitCode: 'CUON-2T-TC',
        unitName: 'Cuộn 2 tấn tiêu chuẩn nhà máy',
        conversionRate: 2000,
        isBaseUnit: false,
      },
    ],
  },
  {
    slug: 'm-da',
    code: 'DA',
    name: 'Đá',
    baseUnitSlug: 'u-m3',
    quantity: 0,
    suppliers: [],
    units: [
      {
        unitSlug: 'u-m3',
        unitCode: 'M3',
        unitName: 'Mét khối',
        conversionRate: 1,
        isBaseUnit: true,
      },
    ],
  },
  {
    slug: 'm-cement',
    code: 'XM-PCB40-HATIEN-50KG',
    name: 'Xi măng Hà Tiên PCB40 đa dụng bao 50kg',
    baseUnitSlug: 'u-bag',
    quantity: 3,
    suppliers: [{ slug: 's-env', code: 'NCC06', name: WORST_SUPPLIERS[1].name }],
    units: [
      {
        unitSlug: 'u-bag',
        unitCode: 'BAO',
        unitName: 'Bao 50kg',
        conversionRate: 1,
        isBaseUnit: true,
      },
    ],
  },
]

type Item = NonNullable<ImportForm['items']>[number]

const item = (over: Partial<Item>): Item => ({
  slug: 'it',
  ...stamp,
  lineNo: 1,
  materialSlug: '',
  materialCode: '',
  materialName: '',
  unitSlug: '',
  unitCode: '',
  unitName: '',
  supplierSlug: null,
  supplierCode: null,
  supplierName: null,
  supplierTaxCode: null,
  supplierAddress: null,
  quantity: 1,
  conversionRate: 1,
  baseQuantity: 1,
  unitPrice: 0,
  amount: 0,
  expiryDate: null,
  note: null,
  ...over,
})

/** Nháp: số HĐ 64 ký tự, mã phiếu 32, dòng 1 chạm trần số, dòng 2 giá 0 + tên 2 ký tự, dòng 3 đổi bên bán riêng. */
export const WORST_DRAFT: ImportForm = {
  slug: 'if-worst',
  ...stamp,
  version: 1,
  code: 'PN-20261019-BDVSIP-KHO-NVL-00001',
  purchaseOrder: 'PO-2026-10-000012345-BD',
  invoiceCode: 'HD-2026/10/BD-VSIP-00012345-KM-THANG10-DOT2-PHU-LUC-HD-0001-BS',
  requesterSlug: 'u-1',
  requesterName: 'Nguyễn Thị Phương Thảo',
  approverSlug: null,
  approverName: null,
  date: '2026-10-19',
  total: 9_876_543_210_123.45,
  file: 'Hoa-don-GTGT-so-0012345-Cong-ty-TNHH-Ngoc-Minh-Phat-Dat-thang-10-2026-ban-scan-1760000000000.pdf',
  note: 'Giao làm hai đợt; đợt 2 giao tại cổng số 3, liên hệ anh Bartholomew trước 30 phút. Kiểm đếm cùng thủ kho.',
  status: 'DRAFT',
  warehouseSlug: 'w-a',
  items: [
    item({
      slug: 'it-1',
      lineNo: 1,
      materialSlug: 'm-steel',
      materialCode: WORST_MATERIALS[0].code,
      materialName: WORST_MATERIALS[0].name,
      unitSlug: 'u-coil',
      unitCode: 'CUON-2T-TC',
      unitName: 'Cuộn 2 tấn tiêu chuẩn nhà máy',
      supplierSlug: 's-long',
      supplierCode: WORST_SUPPLIERS[0].code,
      supplierName: WORST_SUPPLIERS[0].name,
      quantity: 999_999.123456,
      conversionRate: 2000,
      baseQuantity: 1_999_998_246.912,
      unitPrice: 9_876_543.21,
      amount: 9_876_541_990_123.45,
    }),
    item({
      slug: 'it-2',
      lineNo: 2,
      materialSlug: 'm-da',
      materialCode: 'DA',
      materialName: 'Đá',
      unitSlug: 'u-m3',
      unitCode: 'M3',
      unitName: 'Mét khối',
      supplierSlug: 's-long',
      supplierCode: WORST_SUPPLIERS[0].code,
      supplierName: WORST_SUPPLIERS[0].name,
      quantity: 1,
      unitPrice: 0,
      amount: 0,
    }),
    item({
      slug: 'it-3',
      lineNo: 3,
      materialSlug: 'm-cement',
      materialCode: WORST_MATERIALS[2].code,
      materialName: WORST_MATERIALS[2].name,
      unitSlug: 'u-bag',
      unitCode: 'BAO',
      unitName: 'Bao 50kg',
      supplierSlug: 's-env',
      supplierCode: WORST_SUPPLIERS[1].code,
      supplierName: WORST_SUPPLIERS[1].name,
      quantity: 12_000,
      unitPrice: 95_000,
      amount: 1_140_000_000,
      expiryDate: '2099-12-31',
      note: 'Bao rách phải đổi lại, ghi biên bản riêng',
    }),
  ],
}

/** Bản "demo" — dữ liệu đẹp như lúc thiết kế, để so cạnh worst-case. */
export const DEMO_SUPPLIERS: Supplier[] = [
  { slug: 's-1', code: 'NCC-01', name: 'NCC Bột', ...stamp },
]
export const DEMO_MATERIALS: AvailableMaterial[] = [
  {
    slug: 'm-flour',
    code: 'VT-01',
    name: 'Bột mì',
    baseUnitSlug: 'u-kg',
    quantity: 120,
    suppliers: [{ slug: 's-1', code: 'NCC-01', name: 'NCC Bột' }],
    units: [
      {
        unitSlug: 'u-kg',
        unitCode: 'KG',
        unitName: 'Kilogram',
        conversionRate: 1,
        isBaseUnit: true,
      },
    ],
  },
]
export const DEMO_DRAFT: ImportForm = {
  ...WORST_DRAFT,
  slug: 'if-demo',
  code: 'PN-0001',
  purchaseOrder: 'PO-12',
  invoiceCode: 'HD-123',
  total: 1_200_000,
  file: null,
  note: 'Giao buổi sáng',
  items: [
    item({
      slug: 'it-d',
      materialSlug: 'm-flour',
      materialCode: 'VT-01',
      materialName: 'Bột mì',
      unitSlug: 'u-kg',
      unitCode: 'KG',
      unitName: 'Kilogram',
      supplierSlug: 's-1',
      supplierCode: 'NCC-01',
      supplierName: 'NCC Bột',
      quantity: 100,
      unitPrice: 12_000,
      amount: 1_200_000,
    }),
  ],
}

/** Tên đúng 100 ký tự, mã 32 ký tự, 3 NCC (NameList "+1"), 3 đơn vị, tồn có 6 số lẻ — cho ô xổ vật tư và hộp "Chọn vật tư". */
export const WORST_LONG_MATERIAL: AvailableMaterial = {
  slug: 'm-pipe',
  code: 'ONG-THEP-DUC-SCH40-DN150-6M-A106',
  name: 'Ống thép đúc mạ kẽm nhúng nóng SCH40 DN150 (phi 168,3 x 7,11 mm) dài 6 m, tiêu chuẩn ASTM A106 Gr. B',
  baseUnitSlug: 'u-cay',
  quantity: 98_765_432.123456,
  suppliers: WORST_SUPPLIERS.map(({ slug, code, name }) => ({ slug, code, name })),
  units: [
    {
      unitSlug: 'u-cay',
      unitCode: 'CAY-6M',
      unitName: 'Cây 6 mét',
      conversionRate: 1,
      isBaseUnit: true,
    },
    {
      unitSlug: 'u-met',
      unitCode: 'MET',
      unitName: 'Mét',
      conversionRate: 1 / 6,
      isBaseUnit: false,
    },
    {
      unitSlug: 'u-bo',
      unitCode: 'BO-10-CAY-TC',
      unitName: 'Bó 10 cây tiêu chuẩn',
      conversionRate: 10,
      isBaseUnit: false,
    },
  ],
}

/** Vật tư chưa có đơn vị gốc: hộp "Chọn vật tư" khoá ô tick + câu "chưa có đơn vị gốc". */
export const WORST_NO_BASE_MATERIAL: AvailableMaterial = {
  slug: 'm-nobase',
  code: 'GACH-80X80-BC',
  name: 'Gạch ốp lát bóng kiếng 80x80 (chưa khai báo đơn vị)',
  baseUnitSlug: null,
  quantity: 0,
  suppliers: [],
  units: [],
}

/** Danh sách vật tư của kho cho ô xổ dòng cuối và hộp chọn nhiều (thép trong WORST_DRAFT → "đã có"). */
export const WORST_PICKER_MATERIALS: AvailableMaterial[] = [
  WORST_LONG_MATERIAL,
  ...WORST_MATERIALS,
  WORST_NO_BASE_MATERIAL,
]
