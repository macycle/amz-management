# 亚马逊库存与采购管理系统

## 本地启动（无需 Docker）

1. 安装 Node.js 20 或更高版本。
2. 修改 `.env` 中的 `JWT_SECRET`、`ADMIN_EMAIL` 和 `ADMIN_PASSWORD`。
3. 双击 `start.bat`；首次运行会安装依赖并构建网页。
4. 打开 `http://localhost:8080`，使用管理员账号登录；首次登录必须修改密码。

所有数据保存在 `data/amz-data.json`。备份该文件即可备份业务数据；按 `Ctrl+C` 停止服务。服务启动时会自动初始化管理员，每周一 09:00（Asia/Shanghai）同步已启用的供应商 SKU。

## 1688 接入

`SUPPLIER_SYNC_MODE=mock` 会产生稳定的演示价格与库存，适用于验收。生产环境设为 `api` 并提供 `1688_API_URL`、`1688_APP_KEY`、`1688_APP_SECRET`。适配器会以 JSON POST 提交 `{ supplierSku, purchaseUrl }`，期望响应 `{ price: number, stock: number }`；若您的已授权服务商协议不同，请只调整 `server/src/supplier.js`。

产品以“亚马逊站点 + ASIN”唯一；站点使用大写短代号，例如 `US`、`CA`、`UK`、`DE` 或 `JP`。产品删除为逻辑删除，会保留 SKU、供应商和同步历史。

主要 API：`/api/auth/*`、`/api/dashboard`、`/api/products`、`/api/products/:id/skus`、`/api/amazon-skus/:id/suppliers`、`/api/suppliers/:id/sync` 与 `/api/suppliers/:id/history`。
