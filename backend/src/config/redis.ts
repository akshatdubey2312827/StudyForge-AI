import "dotenv/config";
import Redis, { type RedisOptions } from "ioredis";

export const redisConnectionOptions: RedisOptions = {
  maxRetriesPerRequest: null, // strictly required by BullMQ
  enableReadyCheck: false,
  keepAlive: 10000,           // 10s TCP keep-alive
  connectTimeout: 10000,
  retryStrategy(times: number) {
    // Exponential backoff capped at 3s — never gives up so transient interruptions recover
    const delay = Math.min(times * 200, 3000);
    console.warn(`[Redis] Connection attempt #${times} failed. Retrying in ${delay}ms...`);
    return delay;
  },
  reconnectOnError(err: Error) {
    const recoverableErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE"];
    const shouldReconnect = recoverableErrors.some((code) => err.message.includes(code));
    if (shouldReconnect) {
      console.warn(`[Redis] Reconnecting due to recoverable error: ${err.message}`);
      return true;
    }
    return false;
  },
};

// Shared connection factory for BullMQ (separate instances for queue/worker as BullMQ recommends)
export function createRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6380";
  const client = new Redis(redisUrl, redisConnectionOptions);

  client.on("connect", () => console.log("[Redis] Connected"));
  client.on("ready", () => console.log("[Redis] Ready to accept commands"));
  client.on("error", (err) => console.error("[Redis] Error:", err.message));
  client.on("reconnecting", () => console.warn("[Redis] Reconnecting..."));
  client.on("close", () => console.warn("[Redis] Connection closed"));

  return client;
}

// Singleton for general-purpose use (rate limiting, session store, etc.)
let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = createRedisClient();
  }
  return _redis;
}
