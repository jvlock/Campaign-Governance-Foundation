import app from "./app";
import { logger } from "./lib/logger";
import { validateServerEnv } from "./lib/env";

const { port } = validateServerEnv(process.env);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
