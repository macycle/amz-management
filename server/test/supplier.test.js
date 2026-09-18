import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSupplierSnapshot } from '../src/supplier.js';

test('mock supplier adapter returns a valid stable snapshot', async () => {
  process.env.SUPPLIER_SYNC_MODE = 'mock';
  const first = await fetchSupplierSnapshot({ supplier_sku: 'SUP-RED-M', purchase_url: 'https://detail.1688.com/example' });
  const second = await fetchSupplierSnapshot({ supplier_sku: 'SUP-RED-M', purchase_url: 'https://detail.1688.com/example' });
  assert.equal(first.price, second.price);
  assert.equal(first.stock, second.stock);
  assert.ok(first.price > 0);
  assert.ok(first.stock >= 0);
});
