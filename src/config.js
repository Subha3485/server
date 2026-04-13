const rawAllowedOrigins = process.env.ALLOWED_ORIGINS ?? "*";
const cookieSecure = process.env.COOKIE_SECURE ?? "false";

export const config = {
  serverMode: process.env.SERVER_MODE ?? "test",
  runtimeDataMode: process.env.RUNTIME_DATA_MODE ?? "live",
  port: Number.parseInt(process.env.PORT ?? "4000", 10),
  host: process.env.HOST ?? "0.0.0.0",
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL ??
    `http://${process.env.HOST ?? "0.0.0.0"}:${process.env.PORT ?? "4000"}`,
  mongodbUri: process.env.MONGODB_URI ?? "",
  mongodbDbName: process.env.MONGODB_DB_NAME ?? "buslogistic",
  mongodbDbNameLive: process.env.MONGODB_DB_NAME_LIVE ?? process.env.MONGODB_DB_NAME ?? "buslogistic_live",
  mongodbDbNameMock: process.env.MONGODB_DB_NAME_MOCK ?? process.env.MONGODB_DB_NAME ?? "buslogistic_mock",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? "replace-this-access-secret",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? "replace-this-refresh-secret",
  jwtIssuer: process.env.JWT_ISSUER ?? "buslogistic-server",
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? "30d",
  refreshCookieName: process.env.REFRESH_COOKIE_NAME ?? "buslogistics_refresh",
  cookieSecure: cookieSecure === "true",
  cookieSameSite: process.env.COOKIE_SAMESITE ?? "lax",
  cookieDomain: process.env.COOKIE_DOMAIN ?? "",
  otpProvider: process.env.OTP_PROVIDER ?? "mock",
  otpFrom: process.env.OTP_FROM ?? "",
  otpFixedCode: process.env.OTP_FIXED_CODE ?? "",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioVerifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID ?? "",
  fast2smsApiKey: process.env.FAST2SMS_API_KEY ?? "",
  fast2smsRoute: process.env.FAST2SMS_ROUTE ?? "q",
  msg91AuthKey: process.env.MSG91_AUTH_KEY ?? "",
  msg91TemplateId: process.env.MSG91_TEMPLATE_ID ?? "",
  msg91SenderId: process.env.MSG91_SENDER_ID ?? "",
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "",
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
  firebasePrivateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  allowedOrigins:
    rawAllowedOrigins.trim() === "*"
      ? "*"
      : rawAllowedOrigins
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
};
