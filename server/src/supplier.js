import axios from 'axios';

export async function fetchSupplierSnapshot({ supplier_sku, purchase_url }) {
  if (process.env.SUPPLIER_SYNC_MODE !== 'api') {
    let n = [...supplier_sku].reduce((sum, c) => sum + c.charCodeAt(0), 0);
    return { price: Number((5 + (n % 300) / 10).toFixed(2)), stock: 20 + (n % 500), message: '模拟数据' };
  }
  const url = process.env['1688_API_URL'];
  if (!url) throw new Error('1688_API_URL is not configured');
  const response = await axios.post(url, { supplierSku: supplier_sku, purchaseUrl: purchase_url }, {
    timeout: 15000,
    headers: { 'X-App-Key': process.env['1688_APP_KEY'] || '', 'X-App-Secret': process.env['1688_APP_SECRET'] || '' }
  });
  const { price, stock } = response.data || {};
  if (!Number.isFinite(Number(price)) || !Number.isInteger(Number(stock))) throw new Error('1688 API response must contain numeric price and integer stock');
  return { price: Number(price), stock: Number(stock), message: '同步成功' };
}
