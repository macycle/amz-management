# 亚马逊库存与采购管理系统

## 启动

1. 复制 `.env.example` 为 `.env`，并修改 `JWT_SECRET` 与管理员密码。
2. 在安装 Docker Desktop 的环境中运行 `docker compose up --build`。
3. 打开 `http://localhost:8080`，使用 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 登录；首次登录必须修改密码。

前端经由 Nginx 反向代理访问 API。服务启动时自动执行 `server/sql/init.sql` 并初始化管理员。每周一 09:00（Asia/Shanghai）同步已启用的供应商 SKU。

## 1688 接入

`SUPPLIER_SYNC_MODE=mock` 会产生稳定的演示价格与库存，适用于验收。生产环境设为 `api` 并提供 `1688_API_URL`、`1688_APP_KEY`、`1688_APP_SECRET`。适配器会以 JSON POST 提交 `{ supplierSku, purchaseUrl }`，期望响应 `{ price: number, stock: number }`；若您的已授权服务商协议不同，请只调整 `server/src/supplier.js`。

主要 API：`/api/auth/*`、`/api/dashboard`、`/api/products`、`/api/products/:id/skus`、`/api/amazon-skus/:id/suppliers`、`/api/suppliers/:id/sync` 与 `/api/suppliers/:id/history`。
