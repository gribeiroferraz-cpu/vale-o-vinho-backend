export const ENV = {
  appId: process.env.APP_ID ?? process.env.VITE_APP_ID ?? "vale-o-vinho",
  cookieSecret: process.env.JWT_SECRET ?? "fallback-secret-change-in-production",
  databaseUrl: process.env.DATABASE_URL ?? process.env.MYSQL_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Admin email override
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  // Frontend URL for redirects after OAuth
  frontendUrl: process.env.FRONTEND_URL ?? "https://vale-o-vinho-site.vercel.app",
  // Backend URL (self)
  backendUrl: process.env.BACKEND_URL ?? "https://serene-tranquility-production-2085.up.railway.app",
};
