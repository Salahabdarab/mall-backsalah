import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth, requireRole, requireStoreAccess } from "../../middleware/auth.js";
import { HttpError } from "../../utils/httpError.js";

export const tenantRouter = Router();

// All tenant routes require auth and role (TENANT or STAFF or ADMIN)
tenantRouter.use(requireAuth);
tenantRouter.use(requireRole(["ADMIN","TENANT","STAFF"]));

// Sections CRUD (MANAGER or PRODUCTS can manage)
tenantRouter.get("/stores/:storeId/sections", requireStoreAccess(), asyncHandler(async (req, res) => {
  const storeId = BigInt(req.params.storeId);
  const sections = await prisma.storeSection.findMany({ where: { storeId }, orderBy: { sortOrder: "asc" } });
  res.json(sections.map(s => ({ ...s, id: s.id.toString(), storeId: s.storeId.toString() })));
}));

const sectionCreateSchema = z.object({ name: z.string().min(2), sortOrder: z.number().int().min(0).optional() });

tenantRouter.post("/stores/:storeId/sections", requireStoreAccess({ staffRoles: ["MANAGER","PRODUCTS"] }), asyncHandler(async (req, res) => {
  const storeId = BigInt(req.params.storeId);
  const input = sectionCreateSchema.parse(req.body);
  const created = await prisma.storeSection.create({ data: { storeId, name: input.name, sortOrder: input.sortOrder ?? 0, status: true } });
  res.status(201).json({ ...created, id: created.id.toString(), storeId: created.storeId.toString() });
}));

// Product create/update (PRODUCTS or MANAGER)
const productCreateSchema = z.object({
  sectionId: z.string().optional().nullable(),
  name: z.string().min(2),
  description: z.string().optional().nullable(),
  basePrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.enum(["YER","SAR","USD"]).optional(),
});

tenantRouter.post("/stores/:storeId/products", requireStoreAccess({ staffRoles: ["MANAGER","PRODUCTS"] }), asyncHandler(async (req, res) => {
  const storeId = BigInt(req.params.storeId);
  const input = productCreateSchema.parse(req.body);
  const sectionId = input.sectionId ? BigInt(input.sectionId) : null;

  const created = await prisma.product.create({
    data: {
      storeId,
      sectionId,
      name: input.name,
      description: input.description ?? null,
      basePrice: input.basePrice,
      currency: (input.currency as any) ?? "YER",
      status: true,
    },
  });
  res.status(201).json({ id: created.id.toString() });
}));

// Variant add + inventory (PRODUCTS or MANAGER)
const variantSchema = z.object({
  productId: z.string(),
  sku: z.string().optional().nullable(),
  priceOverride: z.string().optional().nullable(), // numeric string
  attributes: z.array(z.object({ name: z.string().min(1), value: z.string().min(1) })).default([]),
  stockQty: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
});

tenantRouter.post("/stores/:storeId/variants", requireStoreAccess({ staffRoles: ["MANAGER","PRODUCTS"] }), asyncHandler(async (req, res) => {
  const storeId = BigInt(req.params.storeId);
  const input = variantSchema.parse(req.body);
  const productId = BigInt(input.productId);

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { storeId: true } });
  if (!product || product.storeId !== storeId) throw new HttpError(404, "Product not found in this store");

  const created = await prisma.productVariant.create({
    data: {
      productId,
      sku: input.sku ?? null,
      priceOverride: input.priceOverride ?? null,
      status: true,
      attributes: { create: input.attributes.map(a => ({ attributeName: a.name, attributeValue: a.value })) },
      inventory: { create: { stockQty: input.stockQty, lowStockThreshold: input.lowStockThreshold } },
    },
  });

  res.status(201).json({ id: created.id.toString() });
}));

// Staff management (OWNER or MANAGER) - Admin can always.
const staffCreateSchema = z.object({
  userEmail: z.string().email(),
  role: z.enum(["MANAGER","SALES","PRODUCTS"]),
});

tenantRouter.post("/stores/:storeId/staff", requireStoreAccess({ staffRoles: ["MANAGER"] }), asyncHandler(async (req, res) => {
  const storeId = BigInt(req.params.storeId);
  const input = staffCreateSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: input.userEmail } });
  if (!user) throw new HttpError(404, "User not found");

  // Ensure STAFF role exists for that user
  const staffRole = await prisma.role.findUnique({ where: { code: "STAFF" } });
  if (!staffRole) throw new HttpError(500, "Role seed missing: STAFF");
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: staffRole.id } },
    update: {},
    create: { userId: user.id, roleId: staffRole.id },
  });

  const link = await prisma.storeStaff.upsert({
    where: { storeId_userId: { storeId, userId: user.id } },
    update: { role: input.role, status: true },
    create: { storeId, userId: user.id, role: input.role, status: true },
  });

  res.status(201).json({ id: link.id.toString() });
}));

// Orders for store (SALES or MANAGER)
tenantRouter.get("/stores/:storeId/orders", requireStoreAccess({ staffRoles: ["MANAGER","SALES"] }), asyncHandler(async (req, res) => {
  const storeId = BigInt(req.params.storeId);
  const orders = await prisma.order.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    include: { items: true },
    take: 50,
  });

  res.json(orders.map(o => ({
    id: o.id.toString(),
    status: o.status,
    paymentStatus: o.paymentStatus,
    currency: o.currency,
    total: o.total.toString(),
    itemsCount: o.items.reduce((a, it) => a + it.qty, 0),
    createdAt: o.createdAt,
  })));
}));
