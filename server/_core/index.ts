import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStripeRoutes } from "../stripeRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ✅ ROOT ROUTE (Railway healthcheck padrão)
  app.get("/", (_req, res) => {
    res.status(200).send("Vale o Vinho Backend OK");
  });

  // ✅ HEALTH ROUTE (alternativa)
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  registerOAuthRoutes(app);
  registerStripeRoutes(app as any);

  // ✅ AUTO-MIGRATION: Add missing columns using raw mysql2
  app.get("/api/migrate", async (_req, res) => {
    try {
      const mysql = await import("mysql2/promise");
      const dbUrl = process.env.DATABASE_URL ?? process.env.MYSQL_URL ?? "";
      if (!dbUrl) {
        res.json({ ok: false, error: "No database URL" });
        return;
      }
      const conn = await mysql.createConnection(dbUrl);
      // Check if column already exists
      const [rows] = await conn.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'stripeCustomerId'`
      ) as any;
      if (rows.length === 0) {
        await conn.execute(`ALTER TABLE users ADD COLUMN stripeCustomerId VARCHAR(255) NULL`);
        await conn.end();
        res.json({ ok: true, message: "Migration completed: stripeCustomerId column added" });
      } else {
        await conn.end();
        res.json({ ok: true, message: "Column stripeCustomerId already exists, no migration needed" });
      }
    } catch (error: any) {
      res.json({ ok: false, error: error.message });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // ✅ USA A PORTA DO RAILWAY (não procura outra)
  const port = parseInt(process.env.PORT || "3000");

  // ✅ BIND EM 0.0.0.0 (Railway precisa disso)
  server.listen(port, "0.0.0.0", () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
