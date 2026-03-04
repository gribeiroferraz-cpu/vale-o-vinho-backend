import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { getUserByOpenId, upsertUser } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { SignJWT, jwtVerify } from "jose";
import axios from "axios";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function getSessionSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

async function createSessionToken(openId: string, name: string): Promise<string> {
  const issuedAt = Date.now();
  const expiresInMs = ONE_YEAR_MS;
  const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
  const secretKey = getSessionSecret();

  return new SignJWT({
    openId,
    appId: ENV.appId,
    name,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}

async function verifySessionToken(token: string) {
  try {
    const secretKey = getSessionSecret();
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    const { openId, appId, name } = payload as Record<string, unknown>;
    if (typeof openId !== "string" || typeof appId !== "string" || typeof name !== "string") {
      return null;
    }
    return { openId, appId, name };
  } catch {
    return null;
  }
}

async function syncUser(userInfo: {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
}) {
  const lastSignedIn = new Date();
  await upsertUser({
    openId: userInfo.openId,
    name: userInfo.name || null,
    email: userInfo.email ?? null,
    loginMethod: userInfo.loginMethod ?? null,
    lastSignedIn,
  });
  const saved = await getUserByOpenId(userInfo.openId);
  return (
    saved ?? {
      openId: userInfo.openId,
      name: userInfo.name,
      email: userInfo.email,
      loginMethod: userInfo.loginMethod ?? null,
      lastSignedIn,
    }
  );
}

function buildUserResponse(user: any) {
  return {
    id: user?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    loginMethod: user?.loginMethod ?? null,
    role: user?.role ?? "user",
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

export function registerOAuthRoutes(app: Express) {
  // ─── GOOGLE OAUTH: Step 1 - Redirect to Google ───────────────────────────
  app.get("/api/oauth/google", (_req: Request, res: Response) => {
    if (!ENV.googleClientId) {
      res.status(500).json({ error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID." });
      return;
    }

    const redirectUri = `${ENV.backendUrl}/api/oauth/callback`;
    const scope = "openid email profile";

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", ENV.googleClientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scope);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "select_account");

    console.log("[OAuth] Redirecting to Google:", url.toString());
    res.redirect(302, url.toString());
  });

  // ─── GOOGLE OAUTH: Step 2 - Handle callback from Google ──────────────────
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const error = getQueryParam(req, "error");

    if (error) {
      console.error("[OAuth] Google returned error:", error);
      res.redirect(302, `${ENV.frontendUrl}?error=oauth_denied`);
      return;
    }

    if (!code) {
      res.status(400).json({ error: "Authorization code is required" });
      return;
    }

    try {
      const redirectUri = `${ENV.backendUrl}/api/oauth/callback`;

      // Exchange code for tokens with Google
      const tokenResponse = await axios.post(
        "https://oauth2.googleapis.com/token",
        {
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const { access_token } = tokenResponse.data;

      // Get user info from Google
      const userInfoResponse = await axios.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${access_token}` } }
      );

      const googleUser = userInfoResponse.data;
      const openId = `google_${googleUser.id}`;

      // Sync user to database
      const user = await syncUser({
        openId,
        name: googleUser.name,
        email: googleUser.email,
        loginMethod: "google",
      });

      // Create session token (JWT)
      const sessionToken = await createSessionToken(openId, googleUser.name || "");

      // Set cookie on the backend domain
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      console.log("[OAuth] Login successful for:", googleUser.email);

      // Build user data for frontend
      const userB64 = Buffer.from(JSON.stringify(buildUserResponse(user))).toString("base64");

      // Redirect to frontend with session token in URL so frontend can store it
      // This is needed because the cookie domain may differ from the frontend domain
      const frontendRedirect = new URL(ENV.frontendUrl);
      frontendRedirect.searchParams.set("sessionToken", sessionToken);
      frontendRedirect.searchParams.set("user", userB64);

      res.redirect(302, frontendRedirect.toString());
    } catch (err: any) {
      console.error("[OAuth] Callback failed:", err?.response?.data || err.message);
      res.redirect(302, `${ENV.frontendUrl}?error=oauth_failed`);
    }
  });

  // ─── LOGOUT ───────────────────────────────────────────────────────────────
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // ─── GET CURRENT USER ─────────────────────────────────────────────────────
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      // Try cookie first
      const { parse: parseCookies } = await import("cookie");
      const cookies = parseCookies(req.headers.cookie || "");
      const sessionCookie = cookies[COOKIE_NAME];

      // Try Bearer token
      const authHeader = req.headers.authorization;
      const bearerToken =
        typeof authHeader === "string" && authHeader.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : undefined;

      const token = bearerToken || sessionCookie;
      if (!token) {
        res.status(401).json({ error: "Not authenticated", user: null });
        return;
      }

      const session = await verifySessionToken(token);
      if (!session) {
        res.status(401).json({ error: "Invalid session", user: null });
        return;
      }

      const user = await getUserByOpenId(session.openId);
      if (!user) {
        res.status(401).json({ error: "User not found", user: null });
        return;
      }

      // Update last signed in
      await upsertUser({ openId: user.openId, lastSignedIn: new Date() });

      res.json({ user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/me failed:", error);
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  // ─── SESSION FROM BEARER TOKEN ────────────────────────────────────────────
  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        res.status(400).json({ error: "Bearer token required" });
        return;
      }
      const token = authHeader.slice(7).trim();

      const session = await verifySessionToken(token);
      if (!session) {
        res.status(401).json({ error: "Invalid token" });
        return;
      }

      const user = await getUserByOpenId(session.openId);
      if (!user) {
        res.status(401).json({ error: "User not found" });
        return;
      }

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/session failed:", error);
      res.status(401).json({ error: "Invalid token" });
    }
  });
}
