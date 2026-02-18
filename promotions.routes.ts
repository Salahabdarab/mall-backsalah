import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth, requireRole, requireStoreAccess } from "../../middleware/auth.js";

export const promotionsRouter = Router();

promotionsRouter.use(requireAuth);
promotionsRouter.use(requireRole(["ADMIN","TENANT","STAFF"]));

promotionsRouter.get("/stores/:storeId/promotions", requireStoreAccess(), asyncHandler(async (req, res) => {
  const storeId = BigInt(req.params.storeId);
  const promos = await prisma.promotion.findMany({
    where: { storeId },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });
  res.json(promos.map(p => ({ ...p, id: p.id.toString(), storeId: p.storeId.toString(), createdById: p.createdById.toString(), approvedById: p.approvedById?.toString() })));
}));

const createSchema = z.object({
  title: z.string().min(2),
  type: z.enum(["PERCENT","AMOUNT","FREESHIP","COUPON"]),
  value: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().default("0"),
  couponCode: z.string().optional().nullable(),
  priority: z.number().int().min(0).optional().default(0),
});

promotionsRouter.post("/stores/:storeId/promotions", requireStoreAccess({ staffRoles: ["MANAGER"] }), asyncHandler(async (req, res) => {
  const storeId = BigInt(req.params.storeId);
  const input = createSchema.parse(req.body);

  const promo = await prisma.promotion.create({
    data: {
      storeId,
      title: input.title,
      type: input.type as any,
      value: input.value,
      couponCode: input.type === "COUPON" ? (input.couponCode ?? null) : null,
      status: "PENDING",
      createdById: req.auth!.userId,
      priority: input.priority,
    },
  });

  res.status(201).json({ id: promo.id.toString(), status: promo.status });
}));
