// Chặn chạy test / check bằng Node cũ: app cần Node theo `.nvmrc` (test dùng API mảng mới, Expo SDK 58).
// npm chạy script ở thư mục gốc app nên đọc `.nvmrc` theo `process.cwd()`.
const fs = require('fs')
const path = require('path')

const want = Number(fs.readFileSync(path.join(process.cwd(), '.nvmrc'), 'utf8').trim())
const have = Number(process.versions.node.split('.')[0])
if (have < want) {
  console.error(
    `\n✖ Đang dùng Node ${process.versions.node}, app cần Node ${want} (.nvmrc).\n` +
      `  Chạy:  nvm use   (trong app/warehouse-mobile)   rồi chạy lại.\n` +
      `  Hoặc đặt mặc định:  nvm alias default ${want}\n`,
  )
  process.exit(1)
}
