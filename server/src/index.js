import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import cron from 'node-cron';
import { z } from 'zod';
import { pool, initializeDatabase } from './db.js';
import { sign, requireAuth } from './auth.js';
import { fetchSupplierSnapshot } from './supplier.js';

const app = express();
app.use(cors()); app.use(express.json());
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const productInput = z.object({ asin:z.string().trim().length(10), name:z.string().trim().min(1), imageUrl:z.string().url().optional().or(z.literal('')), status:z.enum(['active','inactive']).default('active'), notes:z.string().optional(), amazonInventory:z.number().int().min(0).default(0) });
const skuInput = z.object({ sku:z.string().trim().min(1), variantName:z.string().optional(), inventory:z.number().int().min(0).default(0) });
const supplierInput = z.object({ supplierSku:z.string().trim().min(1), purchaseUrl:z.string().url(), specification:z.string().optional(), enabled:z.boolean().default(true) });
function body(schema, req) { return schema.parse(req.body); }

app.get('/api/health', (_,res)=>res.json({ok:true}));
app.post('/api/auth/login', asyncRoute(async(req,res)=>{
  const data=z.object({email:z.string().email(),password:z.string().min(1)}).parse(req.body);
  const q=await pool.query('SELECT * FROM users WHERE email=$1',[data.email]);
  if (!q.rowCount || !await bcrypt.compare(data.password,q.rows[0].password_hash)) return res.status(401).json({error:'账号或密码错误'});
  const user=q.rows[0]; res.json({token:sign(user),user:{email:user.email,mustChangePassword:user.must_change_password}});
}));
app.post('/api/auth/password', requireAuth, asyncRoute(async(req,res)=>{
  const {currentPassword,newPassword}=z.object({currentPassword:z.string(),newPassword:z.string().min(8)}).parse(req.body);
  const q=await pool.query('SELECT * FROM users WHERE id=$1',[req.user.id]);
  if (!q.rowCount || !await bcrypt.compare(currentPassword,q.rows[0].password_hash)) return res.status(400).json({error:'当前密码不正确'});
  await pool.query('UPDATE users SET password_hash=$1,must_change_password=false WHERE id=$2',[await bcrypt.hash(newPassword,12),req.user.id]); res.status(204).end();
}));

app.use('/api', requireAuth);
app.get('/api/dashboard', asyncRoute(async(_,res)=>{
  const q=await pool.query(`SELECT (SELECT count(*)::int FROM products WHERE deleted_at IS NULL) products,
    (SELECT count(*)::int FROM products WHERE deleted_at IS NULL AND amazon_inventory=0) out_of_stock,
    (SELECT count(*)::int FROM supplier_skus s WHERE s.deleted_at IS NULL AND s.enabled AND (s.current_stock IS NULL OR s.current_stock=0)) supplier_risk,
    (SELECT count(*)::int FROM sync_runs WHERE status='failed' AND synced_at > now()-interval '7 days') failures,
    (SELECT count(*)::int FROM sync_runs r WHERE r.status='success' AND r.price > (SELECT r2.price FROM sync_runs r2 WHERE r2.supplier_sku_id=r.supplier_sku_id AND r2.status='success' AND r2.id<r.id ORDER BY r2.id DESC LIMIT 1) AND r.synced_at > now()-interval '7 days') price_rises`);
  res.json(q.rows[0]);
}));
app.get('/api/products', asyncRoute(async(req,res)=>{
  const page=Math.max(1,Number(req.query.page)||1), size=Math.min(100,Math.max(1,Number(req.query.size)||20)), search=`%${req.query.search||''}%`;
  const data=await pool.query(`SELECT p.*, count(DISTINCT a.id)::int sku_count FROM products p LEFT JOIN amazon_skus a ON a.product_id=p.id AND a.deleted_at IS NULL WHERE p.deleted_at IS NULL AND (p.asin ILIKE $1 OR p.name ILIKE $1) GROUP BY p.id ORDER BY p.updated_at DESC LIMIT $2 OFFSET $3`,[search,size,(page-1)*size]);
  const total=await pool.query(`SELECT count(*)::int FROM products WHERE deleted_at IS NULL AND (asin ILIKE $1 OR name ILIKE $1)`,[search]); res.json({items:data.rows,total:total.rows[0].count,page,size});
}));
app.post('/api/products', asyncRoute(async(req,res)=>{ const d=body(productInput,req); const q=await pool.query('INSERT INTO products(asin,name,image_url,status,notes,amazon_inventory) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[d.asin,d.name,d.imageUrl||null,d.status,d.notes||null,d.amazonInventory]);res.status(201).json(q.rows[0]); }));
app.get('/api/products/:id', asyncRoute(async(req,res)=>{ const p=await pool.query('SELECT * FROM products WHERE id=$1 AND deleted_at IS NULL',[req.params.id]); if(!p.rowCount)return res.status(404).json({error:'产品不存在'}); const skus=await pool.query(`SELECT a.*, coalesce(json_agg(json_build_object('id',s.id,'supplier_sku',s.supplier_sku,'purchase_url',s.purchase_url,'specification',s.specification,'current_price',s.current_price,'current_stock',s.current_stock,'enabled',s.enabled) ORDER BY s.id) FILTER(WHERE s.id IS NOT NULL),'[]') suppliers FROM amazon_skus a LEFT JOIN supplier_skus s ON s.amazon_sku_id=a.id AND s.deleted_at IS NULL WHERE a.product_id=$1 AND a.deleted_at IS NULL GROUP BY a.id ORDER BY a.id`,[req.params.id]);res.json({...p.rows[0],skus:skus.rows}); }));
app.put('/api/products/:id', asyncRoute(async(req,res)=>{const d=body(productInput,req);const q=await pool.query('UPDATE products SET asin=$1,name=$2,image_url=$3,status=$4,notes=$5,amazon_inventory=$6,updated_at=now() WHERE id=$7 AND deleted_at IS NULL RETURNING *',[d.asin,d.name,d.imageUrl||null,d.status,d.notes||null,d.amazonInventory,req.params.id]); if(!q.rowCount)return res.status(404).json({error:'产品不存在'});res.json(q.rows[0]);}));
app.delete('/api/products/:id',asyncRoute(async(req,res)=>{const q=await pool.query('UPDATE products SET deleted_at=now(),status=\'inactive\' WHERE id=$1 AND deleted_at IS NULL RETURNING id',[req.params.id]);if(!q.rowCount)return res.status(404).json({error:'产品不存在'});res.status(204).end();}));
app.post('/api/products/:id/skus',asyncRoute(async(req,res)=>{const d=body(skuInput,req);const q=await pool.query('INSERT INTO amazon_skus(product_id,sku,variant_name,inventory) VALUES($1,$2,$3,$4) RETURNING *',[req.params.id,d.sku,d.variantName||null,d.inventory]);res.status(201).json(q.rows[0]);}));
app.put('/api/amazon-skus/:id',asyncRoute(async(req,res)=>{const d=body(skuInput,req);const q=await pool.query('UPDATE amazon_skus SET sku=$1,variant_name=$2,inventory=$3 WHERE id=$4 AND deleted_at IS NULL RETURNING *',[d.sku,d.variantName||null,d.inventory,req.params.id]);if(!q.rowCount)return res.status(404).json({error:'SKU不存在'});res.json(q.rows[0]);}));
app.delete('/api/amazon-skus/:id',asyncRoute(async(req,res)=>{const q=await pool.query('UPDATE amazon_skus SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id',[req.params.id]);if(!q.rowCount)return res.status(404).json({error:'SKU不存在'});res.status(204).end();}));
app.post('/api/amazon-skus/:id/suppliers',asyncRoute(async(req,res)=>{const d=body(supplierInput,req);const q=await pool.query('INSERT INTO supplier_skus(amazon_sku_id,supplier_sku,purchase_url,specification,enabled) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.params.id,d.supplierSku,d.purchaseUrl,d.specification||null,d.enabled]);res.status(201).json(q.rows[0]);}));
app.put('/api/suppliers/:id',asyncRoute(async(req,res)=>{const d=body(supplierInput,req);const q=await pool.query('UPDATE supplier_skus SET supplier_sku=$1,purchase_url=$2,specification=$3,enabled=$4 WHERE id=$5 AND deleted_at IS NULL RETURNING *',[d.supplierSku,d.purchaseUrl,d.specification||null,d.enabled,req.params.id]);if(!q.rowCount)return res.status(404).json({error:'供应商SKU不存在'});res.json(q.rows[0]);}));
app.delete('/api/suppliers/:id',asyncRoute(async(req,res)=>{const q=await pool.query('UPDATE supplier_skus SET deleted_at=now(),enabled=false WHERE id=$1 AND deleted_at IS NULL RETURNING id',[req.params.id]);if(!q.rowCount)return res.status(404).json({error:'供应商SKU不存在'});res.status(204).end();}));
async function syncOne(id) { const q=await pool.query('SELECT * FROM supplier_skus WHERE id=$1 AND deleted_at IS NULL',[id]);if(!q.rowCount)throw new Error('供应商SKU不存在');const s=q.rows[0];try {const r=await fetchSupplierSnapshot(s);await pool.query('UPDATE supplier_skus SET current_price=$1,current_stock=$2 WHERE id=$3',[r.price,r.stock,id]);await pool.query('INSERT INTO sync_runs(supplier_sku_id,status,price,stock,message) VALUES($1,\'success\',$2,$3,$4)',[id,r.price,r.stock,r.message]);return r;} catch(e) {await pool.query('INSERT INTO sync_runs(supplier_sku_id,status,message) VALUES($1,\'failed\',$2)',[id,e.message]);throw e;} }
app.post('/api/suppliers/:id/sync',asyncRoute(async(req,res)=>res.json(await syncOne(req.params.id))));
app.get('/api/suppliers/:id/history',asyncRoute(async(req,res)=>{const q=await pool.query('SELECT * FROM sync_runs WHERE supplier_sku_id=$1 ORDER BY synced_at DESC LIMIT 100',[req.params.id]);res.json(q.rows);}));
app.post('/api/sync/all',asyncRoute(async(_,res)=>{const all=await pool.query('SELECT id FROM supplier_skus WHERE enabled AND deleted_at IS NULL');const results=await Promise.allSettled(all.rows.map(x=>syncOne(x.id)));res.json({total:results.length,success:results.filter(x=>x.status==='fulfilled').length,failed:results.filter(x=>x.status==='rejected').length});}));
app.use((err,req,res,next)=>{console.error(err);res.status(err instanceof z.ZodError?400:500).json({error:err instanceof z.ZodError?'提交的数据无效':err.message||'服务器错误'});});

await initializeDatabase();
cron.schedule('0 9 * * 1', async()=>{const q=await pool.query('SELECT id FROM supplier_skus WHERE enabled AND deleted_at IS NULL');await Promise.allSettled(q.rows.map(x=>syncOne(x.id)));}, {timezone:'Asia/Shanghai'});
app.listen(process.env.PORT||3000,()=>console.log(`API listening on ${process.env.PORT||3000}`));
