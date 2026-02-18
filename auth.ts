import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";
import { prisma } from "../config/prisma.js";

export type AuthRole = "ADMIN" | "TENANT" | "CUSTOMER" | "STAFF";
export type StaffRole = "MANAGER" | "SALES" | "PRODUCTS";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: bigint;
        roles: AuthRole[];
        email: string;
        storeIdsAsOwner: bigint[];
        storeIdsAsStaff: Array<{ storeId: bigint; role: StaffRole }>;
      };
    }
  }
}

function parseAuthHeader(h?: string | null) {
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = parseAuthHeader(req.headers.authorization);
  if (!token) return next(new HttpError(401, "Missing Bearer token"));

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    const userId = BigInt(decoded.sub);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        ownedStores: { select: { id: true } },
        staffLinks: { where: { status: true }, select: { storeId: true, role: true } },
      },
    });
    if (!user) return next(new HttpError(401, "Invalid token user"));

    req.auth = {
      userId,
      email: user.email,
      roles: user.roles.map((r) => r.role.code as AuthRole),
      storeIdsAsOwner: user.ownedStores.map((s) => s.id),
      storeIdsAsStaff: user.staffLinks.map((s) => ({ storeId: s.storeId, role: s.role as StaffRole })),
    };
    return next();
  } catch (e) {
    return next(new HttpError(401, "Invalid token"));
  }
};

export const requireRole = (roles: AuthRole[]): RequestHandler => (req, _res, next) => {
  const userRoles = req.auth?.roles || [];
  const ok = roles.some((r) => userRoles.includes(r));
  if (!ok) return next(new HttpError(403, "Forbidden: role not allowed"));
  next();
};

// Store isolation: verify that current user can access storeId (owner OR staff OR admin)
export const requireStoreAccess = (opts?: { staffRoles?: StaffRole[] }): RequestHandler => (req, _res, next) => {
  const storeIdRaw = (req.params.storeId || req.body.storeId || req.query.storeId) as string | undefined;
  if (!storeIdRaw) return next(new HttpError(400, "storeId is required"));
  const storeId = BigInt(storeIdRaw);

  const roles = req.auth?.roles || [];
  if (roles.includes("ADMIN")) return next();

  const ownerStores = req.auth?.storeIdsAsOwner || [];
  if (ownerStores.some((id) => id === storeId)) return next();

  const staff = req.auth?.storeIdsAsStaff || [];
  const allowedRoles = opts?.staffRoles;
  const link = staff.find((s) => s.storeId === storeId);
  if (!link) return next(new HttpError(403, "Forbidden: no store access"));

  if (!allowedRoles || allowedRoles.includes(link.role)) return next();
  return next(new HttpError(403, "Forbidden: insufficient staff role"));
};
