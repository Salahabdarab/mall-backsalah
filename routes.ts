import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { tenantRouter } from "./modules/tenant/tenant.routes.js";
import { checkoutRouter } from "./modules/checkout/checkout.routes.js";
import { promotionsRouter } from "./modules/promotions/promotions.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";

export const routes = Router();

routes.get("/health", (_req, res) => res.json({ ok: true }));

routes.use("/auth", authRouter);
routes.use("/catalog", catalogRouter);

// Protected app routes
routes.use("/tenant", tenantRouter);
routes.use("/checkout", checkoutRouter);
routes.use("/promotions", promotionsRouter);
routes.use("/admin", adminRouter);
