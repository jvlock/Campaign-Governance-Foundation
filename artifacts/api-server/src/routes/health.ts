import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (req, res): Promise<void> => {
  try {
    await pool.query("select 1");
    res.json(HealthCheckResponse.parse({
      status: "ok",
      application: "reachable",
      database: "reachable",
      checkedAt: new Date().toISOString(),
    }));
  } catch (error) {
    req.log.error({ err: error }, "Database health check failed");
    res.status(503).json(HealthCheckResponse.parse({
      status: "degraded",
      application: "reachable",
      database: "unreachable",
      checkedAt: new Date().toISOString(),
    }));
  }
});

export default router;
