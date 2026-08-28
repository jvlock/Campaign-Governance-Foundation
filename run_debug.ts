import { pool } from "./lib/db/src/index.ts";
import app from "./artifacts/api-server/src/app.ts";
import request from "supertest";

(async () => {
  const calIdResult = await pool.query("INSERT INTO fiscal_calendars (stable_key, name) VALUES ('TEST-CAL2', 'Test Calendar') RETURNING id;");
  const calId = calIdResult.rows[0].id;
  
  const res = await request(app).post(`/fiscal-calendars/${calId}/snapshots`).send({
    version: 1,
    rules: {},
    periods: [{ stableKey: "FY30", fiscalYear: "2030", fiscalQuarter: "Q1", fiscalPeriod: "P1", startDate: "2030-01-01", endDate: "2030-01-31" }]
  });
  console.log(res.status, res.body);
  process.exit(0);
})();
