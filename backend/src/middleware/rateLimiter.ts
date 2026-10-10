import rateLimit from "express-rate-limit";
import { getRedis } from "../config/redis";
import { Request, Response } from "express";
import type { AuthenticatedRequest } from "./authenticate";

const WINDOW_MS = parseInt(process.env.GENERATE_RATE_LIMIT_WINDOW_MS ?? "900000", 10); // 15 min
const MAX_REQUESTS = parseInt(process.env.GENERATE_RATE_LIMIT_MAX ?? "10", 10);

/**
 * Per-user rate limiter for note generation.
 * Key is based on userId (from JWT) so it's tied to the authenticated user,
 * not their IP (which could be a shared NAT).
 */
export const generateRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Use userId as the key so VPN/NAT doesn't affect other users
  keyGenerator: (req: Request): string => {
    const authReq = req as AuthenticatedRequest;
    return authReq.userId ?? req.ip ?? "unknown";
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: "Too many note generation requests",
      message: `You can generate at most ${MAX_REQUESTS} notes per ${WINDOW_MS / 60000} minutes.`,
      retryAfter: WINDOW_MS / 1000,
    });
  },
  // Skip rate-limiting for non-authenticated requests (auth middleware runs first)
  skip: (req: Request) => !(req as AuthenticatedRequest).userId,
});

/**
 * General API rate limiter — apply to all routes as a baseline.
 */
export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});
