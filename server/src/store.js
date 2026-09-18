import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(root, 'data', 'amz-data.json');
const blank = () => ({ sequences: { users: 0, products: 0, amazonSkus: 0, suppliers: 0, syncRuns: 0 }, users: [], products: [], amazonSkus: [], suppliers: [], syncRuns: [] });
let data;
const now = () => new Date().toISOString();

async function save() {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(temp, file);
}
const nextId = key => ++data.sequences[key];
export async function initializeStore() {
  try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; data = blank(); }
  if (!data.users.some(user => user.email === process.env.ADMIN_EMAIL)) {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
    data.users.push({ id: nextId('users'), email: process.env.ADMIN_EMAIL, password_hash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 12), must_change_password: true, created_at: now() });
    await save();
  }
}
export const store = {
  get users() { return data.users; },
  async save() { await save(); },
  activeProducts() { return data.products.filter(product => !product.deleted_at); },
  product(id) { return data.products.find(product => product.id === Number(id) && !product.deleted_at); },
  async createProduct(input) {
    if (this.activeProducts().some(p => p.marketplace === input.marketplace && p.asin === input.asin)) { const error = new Error('该站点的 ASIN 已存在'); error.code = 'DUPLICATE'; throw error; }
    const product = { id: nextId('products'), marketplace: input.marketplace, asin: input.asin, name: input.name, image_url: input.imageUrl || null, status: input.status, notes: input.notes || null, amazon_inventory: input.amazonInventory, deleted_at: null, created_at: now(), updated_at: now() };
    data.products.push(product); await save(); return product;
  },
  async createProductWithSuppliers(input) {
    const product = await this.createProduct(input);
    try {
      const sku = await this.createSku(product.id, { sku: input.amazonSku, variantName: '', inventory: input.amazonSkuInventory || 0 });
      for (const variant of input.supplierVariants) {
        const supplier = await this.createSupplier(sku.id, { supplierSku: variant.supplierSku, purchaseUrl: input.purchaseUrl, specification: variant.specification, enabled: true });
        supplier.current_price = variant.price;
        supplier.current_stock = variant.stock;
      }
      await save();
      return product;
    } catch (error) {
      const skuIds = data.amazonSkus.filter(item => item.product_id === product.id).map(item => item.id);
      data.products = data.products.filter(item => item.id !== product.id);
      data.amazonSkus = data.amazonSkus.filter(item => item.product_id !== product.id);
      data.suppliers = data.suppliers.filter(item => !skuIds.includes(item.amazon_sku_id));
      await save();
      throw error;
    }
  },
  async updateProduct(id, input) {
    const product = this.product(id); if (!product) return null;
    if (this.activeProducts().some(p => p.id !== product.id && p.marketplace === input.marketplace && p.asin === input.asin)) { const error = new Error('该站点的 ASIN 已存在'); error.code = 'DUPLICATE'; throw error; }
    Object.assign(product, { marketplace: input.marketplace, asin: input.asin, name: input.name, image_url: input.imageUrl || null, status: input.status, notes: input.notes || null, amazon_inventory: input.amazonInventory, updated_at: now() }); await save(); return product;
  },
  async deleteProduct(id) { const product = this.product(id); if (!product) return null; product.deleted_at = now(); product.status = 'inactive'; await save(); return product; },
  productSkus(productId) { return data.amazonSkus.filter(sku => sku.product_id === Number(productId) && !sku.deleted_at); },
  sku(id) { return data.amazonSkus.find(sku => sku.id === Number(id) && !sku.deleted_at); },
  async createSku(productId, input) { if (!this.product(productId)) return null; if (this.productSkus(productId).some(s => s.sku === input.sku)) { const e = new Error('SKU 已存在'); e.code = 'DUPLICATE'; throw e; } const sku = { id: nextId('amazonSkus'), product_id: Number(productId), sku: input.sku, variant_name: input.variantName || null, inventory: input.inventory, deleted_at: null }; data.amazonSkus.push(sku); await save(); return sku; },
  async updateSku(id, input) { const sku = this.sku(id); if (!sku) return null; Object.assign(sku, { sku: input.sku, variant_name: input.variantName || null, inventory: input.inventory }); await save(); return sku; },
  async deleteSku(id) { const sku = this.sku(id); if (!sku) return null; sku.deleted_at = now(); await save(); return sku; },
  suppliersForSku(skuId) { return data.suppliers.filter(s => s.amazon_sku_id === Number(skuId) && !s.deleted_at); },
  supplier(id) { return data.suppliers.find(s => s.id === Number(id) && !s.deleted_at); },
  async createSupplier(skuId, input) { if (!this.sku(skuId)) return null; const supplier = { id: nextId('suppliers'), amazon_sku_id: Number(skuId), supplier_sku: input.supplierSku, purchase_url: input.purchaseUrl, specification: input.specification || null, current_price: null, current_stock: null, enabled: input.enabled, deleted_at: null }; data.suppliers.push(supplier); await save(); return supplier; },
  async updateSupplier(id, input) { const supplier = this.supplier(id); if (!supplier) return null; Object.assign(supplier, { supplier_sku: input.supplierSku, purchase_url: input.purchaseUrl, specification: input.specification || null, enabled: input.enabled }); await save(); return supplier; },
  async deleteSupplier(id) { const supplier = this.supplier(id); if (!supplier) return null; supplier.deleted_at = now(); supplier.enabled = false; await save(); return supplier; },
  async recordSync(supplierId, result) { const supplier = this.supplier(supplierId); if (!supplier) throw new Error('供应商SKU不存在'); if (result.status === 'success') Object.assign(supplier, { current_price: result.price, current_stock: result.stock }); const run = { id: nextId('syncRuns'), supplier_sku_id: supplier.id, ...result, synced_at: now() }; data.syncRuns.push(run); await save(); return run; },
  history(id) { return data.syncRuns.filter(run => run.supplier_sku_id === Number(id)).sort((a,b) => b.id - a.id).slice(0, 100); }
};
