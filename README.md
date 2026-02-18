# Mall Backend (Node.js + TypeScript + PostgreSQL + Prisma)

هذا Backend أساسي (APIs) لمنصة مول متعددة المتاجر (Multi‑Vendor).

## التشغيل السريع

1) انسخ ملف البيئة:
```bash
cp .env.example .env
```

2) ثبّت الحزم:
```bash
npm install
```

3) جهّز قاعدة البيانات و Prisma:
```bash
npm run prisma:migrate
npm run seed
```

4) شغّل السيرفر:
```bash
npm run dev
```

سيعمل على:
- `http://localhost:4000/api`

## حسابات تجريبية (Seed)
- Admin: `admin@mall.com` / `123456`
- Tenant: `tenant@mall.com` / `123456`
- Staff (Sales): `sales@mall.com` / `123456`
- Customer: `customer@mall.com` / `123456`

## أهم APIs
### Auth
- POST `/api/auth/login`
- POST `/api/auth/register`
- GET  `/api/auth/me`

### Catalog (Public)
- GET `/api/catalog/wings`
- GET `/api/catalog/wings/:wingSlug/stores`
- GET `/api/catalog/stores/:storeSlug`
- GET `/api/catalog/stores/:storeSlug/products`
- GET `/api/catalog/products/:productId`

### Tenant (Protected)
- GET/POST `/api/tenant/stores/:storeId/sections`
- POST `/api/tenant/stores/:storeId/products`
- POST `/api/tenant/stores/:storeId/variants`
- POST `/api/tenant/stores/:storeId/staff`
- GET  `/api/tenant/stores/:storeId/orders`

### Checkout (Customer)
- POST `/api/checkout/cart/items`
- GET  `/api/checkout/cart`
- POST `/api/checkout/checkout`  (Option B split orders per store)

### Promotions
- POST `/api/promotions/stores/:storeId/promotions`  (Tenant creates -> PENDING)
- GET  `/api/promotions/stores/:storeId/promotions`  (Tenant view)

### Admin
- GET  `/api/admin/promotions`
- POST `/api/admin/promotions/:id/decision`  (ACTIVE / REJECTED / STOPPED)

## ملاحظات
- هذا الإصدار يركز على APIs الأساسية + العزل عبر Middleware.
- RLS Policies التي جهزناها سابقاً تُفعّل داخل PostgreSQL عند الانتقال للإنتاج.
