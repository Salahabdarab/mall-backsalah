import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { HttpError } from "../../utils/httpError.js";

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireRole(["ADMIN"]));

// List promos
adminRouter.get("/promotions", asyncHandler(async (_req, res) => {
  const promos = await prisma.promotion.findMany({
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    include: { store: { select: { name: true, slug: true } }, createdBy: { select: { email: true } } },
    take: 200,
  });

  res.json(promos.map(p => ({
    id: p.id.toString(),
    store: p.store,
    title: p.title,
    type: p.type,
    value: p.value.toString(),
    status: p.status,
    createdBy: p.createdBy.email,
    createdAt: p.createdAt,
    rejectReason: p.rejectReason,
  })));
}));

const decisionSchema = z.object({
  status: z.enum(["ACTIVE","REJECTED","STOPPED"]),
  rejectReason: z.string().optional().nullable(),
});

adminRouter.post("/promotions/:id/decision", asyncHandler(async (req, res) => {
  const id = BigInt(req.params.id);
  const input = decisionSchema.parse(req.body);

  const promo = await prisma.promotion.findUnique({ where: { id } });
  if (!promo) throw new HttpError(404, "Promotion not found");

  const updated = await prisma.promotion.update({
    where: { id },
    data: {
      status: input.status as any,
      approvedById: req.auth!.userId,
      rejectReason: input.status === "REJECTED" ? (input.rejectReason ?? "No reason provided") : null,
    },
  });

  res.json({ id: updated.id.toString(), status: updated.status });
}));
