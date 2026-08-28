export type ServerEnv = {
  port: number;
  databaseUrl: string;
  nodeEnv: "development" | "test" | "production";
};

export function validateServerEnv(env: NodeJS.ProcessEnv): ServerEnv {
  const rawPort = env.PORT;
  if (!rawPort || !Number.isInteger(Number(rawPort)) || Number(rawPort) <= 0) {
    throw new Error("PORT must be a positive integer.");
  }
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }
  const nodeEnv = env.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test, or production.");
  }
  return {
    port: Number(rawPort),
    databaseUrl: env.DATABASE_URL,
    nodeEnv: nodeEnv as ServerEnv["nodeEnv"],
  };
}