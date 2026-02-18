import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { routes } from "./routes.js";
import { errorMiddleware } from "./middleware/error.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.use("/api", routes);

app.use(errorMiddleware);

app.listen(env.PORT, () => {
  console.log(`Mall API running on http://localhost:${env.PORT}/api`);
});
