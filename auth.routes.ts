import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/httpError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

authRouter.post("/register", asyncHandler(async (req, res) => {
  const input = registerSchema.parse(req.body);
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw new HttpError(409, "Email already exists");

  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, passwordHash },
  });

  // default role = CUSTOMER
  const customerRole = await prisma.role.findUnique({ where: { code: "CUSTOMER" } });
  if (!customerRole) throw new HttpError(500, "Role seed missing: CUSTOMER");
  await prisma.userRole.create({ data: { userId: user.id, roleId: customerRole.id } });

  const token = jwt.sign({ sub: user.id.toString() }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
  res.json({ token, user: { id: user.id.toString(), name: user.name, email: user.email, roles: ["CUSTOMER"] } });
}));

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

authRouter.post("/login", asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw new HttpError(401, "Invalid credentials");

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw new HttpError(401, "Invalid credentials");

  const roles = user.roles.map((r) => r.role.code);
  const token = jwt.sign({ sub: user.id.toString() }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

  res.json({ token, user: { id: user.id.toString(), name: user.name, email: user.email, roles } });
}));

authRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.auth!.userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: true } },
      ownedStores: { select: { id: true, name: true, slug: true, status: true } },
      staffLinks: { where: { status: true }, select: { storeId: true, role: true, store: { select: { name: true, slug: true } } } },
    },
  });
  if (!user) throw new HttpError(404, "User not found");

  res.json({
    id: user.id.toString(),
    name: user.name,
    email: user.email,
    roles: user.roles.map((r) => r.role.code),
    ownedStores: user.ownedStores.map((s) => ({ ...s, id: s.id.toString() })),
    staffStores: user.staffLinks.map((s) => ({ storeId: s.storeId.toString(), role: s.role, store: s.store })),
  });
}));
