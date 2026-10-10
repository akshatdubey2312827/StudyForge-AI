import { Router, Request, Response } from "express";
import axios from "axios";
import { User } from "../models/User";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
} from "../middleware/authenticate";

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL!;
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

// ─── GET /api/auth/google ─────────────────────────────────────────────────────
// Redirect browser to Google's OAuth consent screen (or auto dev-login if keys are placeholders)
router.get("/google", async (_req: Request, res: Response): Promise<void> => {
  // If in development and Google OAuth credentials are not yet configured with real Google Cloud keys:
  if (
    process.env.NODE_ENV !== "production" &&
    (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.startsWith("your_google") || GOOGLE_CLIENT_ID.includes("placeholder"))
  ) {
    console.log("[Auth] Development mode: Placeholder Google keys detected. Auto-authenticating Atlas dev user...");
    const devEmail = "akshat.dubey@studyforge.ai";
    let user = await User.findOne({
      $or: [{ email: devEmail }, { googleId: "google_dev_test_user_001" }],
    });
    if (!user) {
      user = await User.create({
        email: devEmail,
        name: "Akshat Dubey",
        googleId: "google_dev_test_user_001",
        avatarUrl: "https://api.dicebear.com/8.x/avataaars/svg?seed=akshatdubey",
      });
      // Seed starter credits if new
      const { CreditLedger } = await import("../models/CreditLedger");
      await CreditLedger.create({
        userId: user._id,
        delta: 50,
        reason: "purchase",
        relatedId: "dev_initial_pack",
      });
    } else if (user.name !== "Akshat Dubey" || user.email !== devEmail) {
      user.name = "Akshat Dubey";
      user.email = devEmail;
      user.avatarUrl = "https://api.dicebear.com/8.x/avataaars/svg?seed=akshatdubey";
      await user.save();
    }

    const userId = user._id.toString();
    const accessToken = signAccessToken(userId, user.email);
    const refreshToken = signRefreshToken(userId);

    user.refreshTokenHash = refreshToken;
    await user.save();

    setAuthCookies(res, accessToken, refreshToken);
    res.redirect(`${FRONTEND_URL}/dashboard`);
    return;
  }

  const state = Math.random().toString(36).slice(2); // CSRF token
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_CALLBACK_URL,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// ─── GET /api/auth/google/callback ───────────────────────────────────────────
// Exchange code → tokens → upsert user → set httpOnly cookies → redirect
router.get("/google/callback", async (req: Request, res: Response): Promise<void> => {
  const { code } = req.query as { code?: string };

  if (!code) {
    res.redirect(`${FRONTEND_URL}/login?error=missing_code`);
    return;
  }

  try {
    // 1. Exchange code for Google tokens
    const tokenRes = await axios.post<{
      access_token: string;
      id_token: string;
    }>("https://oauth2.googleapis.com/token", {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_CALLBACK_URL,
      grant_type: "authorization_code",
    });

    const { access_token: googleAccessToken } = tokenRes.data;

    // 2. Fetch user profile from Google
    const profileRes = await axios.get<{
      id: string;
      email: string;
      name: string;
      picture?: string;
    }>("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });

    const { id: googleId, email, name, picture } = profileRes.data;

    // 3. Upsert user in MongoDB
    const user = await User.findOneAndUpdate(
      { googleId },
      {
        $set: {
          email: email.toLowerCase(),
          name,
          avatarUrl: picture,
        },
        $setOnInsert: { googleId },
      },
      { upsert: true, new: true, runValidators: true },
    );

    const userId = user._id.toString();

    // 4. Issue tokens
    const accessToken = signAccessToken(userId, user.email);
    const refreshToken = signRefreshToken(userId);

    // 5. Store refresh token hash on user (for rotation / revocation)
    // In production use bcrypt — for simplicity we store the raw token here
    // and swap to bcrypt in a follow-up hardening pass
    user.refreshTokenHash = refreshToken;
    await user.save();

    // 6. Set httpOnly cookies and redirect to frontend dashboard
    setAuthCookies(res, accessToken, refreshToken);
    res.redirect(`${FRONTEND_URL}/dashboard`);
  } catch (err) {
    console.error("[Auth] Google callback error:", err);
    res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
// Use refresh token cookie to issue new access token
router.post("/refresh", async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.refresh_token as string | undefined;

  if (!refreshToken) {
    res.status(401).json({ error: "No refresh token" });
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.sub).select("email refreshTokenHash");

    if (!user || user.refreshTokenHash !== refreshToken) {
      // Token has been rotated or revoked
      clearAuthCookies(res);
      res.status(401).json({ error: "Refresh token revoked" });
      return;
    }

    // Rotate: issue new access + refresh tokens
    const newAccess = signAccessToken(user._id.toString(), user.email);
    const newRefresh = signRefreshToken(user._id.toString());

    user.refreshTokenHash = newRefresh;
    await user.save();

    setAuthCookies(res, newAccess, newRefresh);
    res.json({ message: "Tokens refreshed" });
  } catch {
    clearAuthCookies(res);
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post("/logout", async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.refresh_token as string | undefined;

  if (refreshToken) {
    // Revoke by clearing the stored hash
    try {
      const payload = verifyRefreshToken(refreshToken);
      await User.findByIdAndUpdate(payload.sub, { $unset: { refreshTokenHash: 1 } });
    } catch {
      // Token may already be invalid — still clear cookies
    }
  }

  clearAuthCookies(res);
  res.json({ message: "Logged out" });
});

// ─── GET /api/auth/session ────────────────────────────────────────────────────
// Returns current user if access token is valid
router.get("/session", async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.access_token as string | undefined;

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const jwt = await import("jsonwebtoken");
    const payload = jwt.default.verify(token, process.env.JWT_ACCESS_SECRET!) as {
      sub: string;
      email: string;
    };

    const user = await User.findById(payload.sub).select("email name avatarUrl createdAt");
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        avatar_url: user.avatarUrl,
        created_at: user.createdAt,
      },
    });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

export default router;
