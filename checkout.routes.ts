import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { HttpError } from "../../utils/httpError.js";

export const checkoutRouter = Router();

checkoutRouter.use(requireAuth);
checkoutRouter.use(requireRole(["CUSTOMER","ADMIN"]));

async function getActiveCart(customerId: bigint) {
  let cart = await prisma.cart.findFirst({ where: { customerId, status: true } });
  if (!cart) cart = await prisma.cart.create({ data: { customerId, status: true } });
  return cart;
}

// Add to cart
const addSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional().nullable(),
  qty: z.number().int().min(1),
});

checkoutRouter.post("/cart/items", asyncHandler(async (req, res) => {
  const customerId = req.auth!.userId;
  const cart = await getActiveCart(customerId);
  const input = addSchema.parse(req.body);

  const productId = BigInt(input.productId);
  const variantId = input.variantId ? BigInt(input.variantId) : null;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { store: true, variants: variantId ? { where: { id: variantId }, include: { inventory: true } } : false },
  });
  if (!product || !product.status || product.store.status !== "ACTIVE") throw new HttpError(404, "Product not found");

  let unitPrice = product.basePrice;
  if (variantId) {
    const v = (product as any).variants?.[0];
    if (!v) throw new HttpError(404, "Variant not found");
    const stock = v.inventory?.stockQty ?? 0;
    if (stock < input.qty) throw new HttpError(400, "Insufficient stock for variant");
    unitPrice = v.priceOverride ?? product.basePrice;
  }

  const created = await prisma.cartItem.create({
    data: {
      cartId: cart.id,
      storeId: product.storeId,
      productId: product.id,
      variantId,
      qty: input.qty,
      unitPriceSnapshot: unitPrice,
      currencySnapshot: product.currency,
    },
  });

  res.status(201).json({ id: created.id.toString() });
}));

// View cart
checkoutRouter.get("/cart", asyncHandler(async (req, res) => {
  const customerId = req.auth!.userId;
  const cart = await getActiveCart(customerId);
  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: { product: { select: { name: true } }, store: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });

  const groups: Record<string, any> = {};
  for (const it of items) {
    const sid = it.storeId.toString();
    if (!groups[sid]) groups[sid] = { storeId: sid, storeName: it.store.name, storeSlug: it.store.slug, currency: it.currencySnapshot, items: [], subtotal: 0 };
    groups[sid].items.push({
      id: it.id.toString(),
      productId: it.productId.toString(),
      variantId: it.variantId?.toString() ?? null,
      name: it.product.name,
      qty: it.qty,
      unitPrice: it.unitPriceSnapshot.toString(),
    });
    groups[sid].subtotal += Number(it.unitPriceSnapshot) * it.qty;
  }

  res.json({ cartId: cart.id.toString(), groups: Object.values(groups).map(g => ({ ...g, subtotal: g.subtotal.toFixed(2) })) });
}));

// Checkout (Option B): split cart into orders per store
const checkoutSchema = z.object({
  // In production you also pass shipping address, city, payment method, etc.
  shippingFeePerStore: z.record(z.string(), z.string().regex(/^\d+(\.\d{1,2})?$/)).optional().default({}),
});

checkoutRouter.post("/checkout", asyncHandler(async (req, res) => {
  const customerId = req.auth!.userId;
  const cart = await getActiveCart(customerId);
  const input = checkoutSchema.parse(req.body);

  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: {
      product: { select: { storeId: true, currency: true, basePrice: true } },
      variant: { include: { inventory: true } },
    },
  });
  if (!items.length) throw new HttpError(400, "Cart is empty");

  // Group by store
  const byStore = new Map<bigint, typeof items>();
  for (const it of items) {
    const arr = byStore.get(it.storeId) ?? [];
    arr.push(it);
    byStore.set(it.storeId, arr);
  }

  const createdOrders: any[] = [];

  // Transaction: create orders + decrement inventory (simple)
  await prisma.$transaction(async (tx) => {
    for (const [storeId, group] of byStore.entries()) {
      const currency = group[0].currencySnapshot;
      let subtotal = 0;
      for (const it of group) subtotal += Number(it.unitPriceSnapshot) * it.qty;

      const shippingFee = input.shippingFeePerStore[storeId.toString()] ? Number(input.shippingFeePerStore[storeId.toString()]) : 0;
      const total = subtotal + shippingFee;

      const order = await tx.order.create({
        data: {
          storeId,
          customerId,
          currency,
          subtotal: subtotal.toFixed(2),
          shippingFee: shippingFee.toFixed(2),
          total: total.toFixed(2),
          status: "PENDING",
          paymentStatus: "UNPAID",
          items: {
            create: group.map((it) => ({
              productId: it.productId,
              variantId: it.variantId,
              qty: it.qty,
              unitPrice: it.unitPriceSnapshot,
              snapshotJson: { productName: "snapshot", unitPrice: it.unitPriceSnapshot.toString() },
            })),
          },
        },
      });

      // Inventory decrement for variant items
      for (const it of group) {
        if (it.variantId) {
          const inv = it.variant?.inventory;
          if (!inv) throw new HttpError(400, "Inventory missing for variant");
          if (inv.stockQty < it.qty) throw new HttpError(400, "Insufficient stock during checkout");
          await tx.inventory.update({
            where: { variantId: it.variantId },
            data: { stockQty: inv.stockQty - it.qty },
          });
        }
      }

      createdOrders.push({ id: order.id.toString(), storeId: storeId.toString(), total: order.total.toString(), currency: order.currency });
    }

    // Clear cart
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
  });

  res.json({ orders: createdOrders });
}));
