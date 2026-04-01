import crypto from "crypto";
import { drivers, otpSessions, refreshSessions, users } from "../data.js";
import { createBadRequest, getDriverById, getDriverByPhone, getUserById } from "./logistics.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MOCK_OTP = "123456";

export function maskPhoneNumber(phoneNumber) {
  if (!phoneNumber || phoneNumber.length < 4) return phoneNumber;
  return `${"*".repeat(Math.max(0, phoneNumber.length - 4))}${phoneNumber.slice(-4)}`;
}

export function sendOtp({ phoneNumber, role }) {
  validateRole(role);
  const identity = resolveIdentityByPhone({ phoneNumber, role });
  const existing = findLatestOtpSession({ phoneNumber, role });

  if (existing && existing.status === "pending" && Date.now() - existing.createdAt < RESEND_COOLDOWN_MS) {
    throw createBadRequest("OTP resend is cooling down. Try again shortly.");
  }

  const sessionId = `otp-${crypto.randomUUID()}`;
  const createdAt = Date.now();
  const session = {
    id: sessionId,
    phoneNumber,
    role,
    targetId: identity.id,
    otpHash: hashValue(MOCK_OTP),
    expiresAt: createdAt + OTP_TTL_MS,
    resendAvailableAt: createdAt + RESEND_COOLDOWN_MS,
    attemptCount: 0,
    maxAttempts: MAX_ATTEMPTS,
    status: "pending",
    createdAt
  };

  otpSessions.set(sessionId, session);

  return {
    sessionId,
    phoneNumber: maskPhoneNumber(phoneNumber),
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    resendInSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000),
    otpPreview: MOCK_OTP
  };
}

export function resendOtp({ sessionId, role }) {
  const session = otpSessions.get(sessionId);
  if (!session || session.role !== role) {
    throw createBadRequest("OTP session not found.");
  }

  if (session.status !== "pending") {
    throw createBadRequest("OTP session is no longer active.");
  }

  if (session.expiresAt < Date.now()) {
    session.status = "expired";
    throw createBadRequest("OTP session expired.");
  }

  if (Date.now() < session.resendAvailableAt) {
    throw createBadRequest("OTP resend is cooling down. Try again shortly.");
  }

  session.otpHash = hashValue(MOCK_OTP);
  session.resendAvailableAt = Date.now() + RESEND_COOLDOWN_MS;

  return {
    sessionId: session.id,
    phoneNumber: maskPhoneNumber(session.phoneNumber),
    resendInSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000),
    otpPreview: MOCK_OTP
  };
}

export function verifyOtp({ sessionId, otp, role }) {
  const session = otpSessions.get(sessionId);
  if (!session || session.role !== role) {
    throw createBadRequest("OTP session not found.");
  }

  if (session.status !== "pending") {
    throw createBadRequest("OTP session is no longer active.");
  }

  if (session.expiresAt < Date.now()) {
    session.status = "expired";
    throw createBadRequest("OTP session expired.");
  }

  if (session.attemptCount >= session.maxAttempts) {
    session.status = "locked";
    throw createBadRequest("OTP attempts exceeded.");
  }

  session.attemptCount += 1;
  if (session.otpHash !== hashValue(otp)) {
    if (session.attemptCount >= session.maxAttempts) {
      session.status = "locked";
    }
    throw createBadRequest("Invalid OTP.");
  }

  session.status = "verified";
  const identity = resolveIdentityById({ role, id: session.targetId });
  return createTokenBundle({ role, identity });
}

export function refreshAccessToken({ refreshToken, role }) {
  validateRole(role);
  const session = findRefreshSession(refreshToken);
  if (!session || session.role !== role) {
    throw createBadRequest("Refresh session not found.");
  }

  if (session.revokedAt) {
    throw createBadRequest("Refresh session revoked.");
  }

  if (session.expiresAt < Date.now()) {
    session.revokedAt = Date.now();
    throw createBadRequest("Refresh session expired.");
  }

  const identity = resolveIdentityById({ role, id: session.subjectId });
  const accessToken = createAccessToken({ role, subjectId: identity.id });

  return {
    accessToken,
    accessExpiresAt: new Date(Date.now() + ACCESS_TTL_MS).toISOString(),
    refreshToken
  };
}

export function logout({ refreshToken, role }) {
  validateRole(role);
  const session = findRefreshSession(refreshToken);
  if (!session || session.role !== role) {
    throw createBadRequest("Refresh session not found.");
  }

  session.revokedAt = Date.now();
  return { ok: true };
}

export function getIdentityFromAccessToken(token) {
  if (!token) {
    throw createBadRequest("Authorization token is required.");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw createBadRequest("Invalid access token.");
  }

  if (payload.exp < Date.now()) {
    throw createBadRequest("Access token expired.");
  }

  const identity = resolveIdentityById({ role: payload.role, id: payload.sub });
  return {
    role: payload.role,
    identity,
    tokenPayload: payload
  };
}

export function serializeAuthIdentity({ role, identity }) {
  if (role === "customer") {
    return {
      role,
      user: identity
    };
  }

  if (role === "driver") {
    return {
      role,
      driver: identity
    };
  }

  throw createBadRequest("Unsupported auth role.");
}

function createTokenBundle({ role, identity }) {
  const refreshToken = crypto.randomUUID();
  const accessToken = createAccessToken({ role, subjectId: identity.id });
  const refreshId = `refresh-${crypto.randomUUID()}`;

  refreshSessions.set(refreshId, {
    id: refreshId,
    role,
    subjectId: identity.id,
    refreshTokenHash: hashValue(refreshToken),
    createdAt: Date.now(),
    expiresAt: Date.now() + REFRESH_TTL_MS,
    revokedAt: null
  });

  return {
    accessToken,
    refreshToken,
    accessExpiresAt: new Date(Date.now() + ACCESS_TTL_MS).toISOString(),
    refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
    ...serializeAuthIdentity({ role, identity })
  };
}

function createAccessToken({ role, subjectId }) {
  return Buffer.from(
    JSON.stringify({
      sub: subjectId,
      role,
      exp: Date.now() + ACCESS_TTL_MS
    }),
    "utf8"
  ).toString("base64url");
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function findLatestOtpSession({ phoneNumber, role }) {
  return [...otpSessions.values()]
    .filter((session) => session.phoneNumber === phoneNumber && session.role === role)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

function findRefreshSession(refreshToken) {
  const tokenHash = hashValue(refreshToken);
  return [...refreshSessions.values()].find((session) => session.refreshTokenHash === tokenHash);
}

function resolveIdentityByPhone({ phoneNumber, role }) {
  if (role === "customer") {
    const user = users.find((item) => item.phoneNumber === phoneNumber);
    if (user) return user;

    const newUser = {
      id: `user-${String(users.length + 1).padStart(3, "0")}`,
      phoneNumber,
      name: "New User",
      email: "",
      usage: "Personal",
      language: "English",
      walletBalance: 0,
      gstNumber: "",
      savedRouteIds: [],
      savedStopIds: []
    };
    users.push(newUser);
    return newUser;
  }

  if (role === "driver") {
    const driver = getDriverByPhone(phoneNumber);
    if (!driver) {
      throw createBadRequest("Driver not found.");
    }
    return driver;
  }

  throw createBadRequest("Unsupported auth role.");
}

function resolveIdentityById({ role, id }) {
  if (role === "customer") {
    const user = getUserById(id);
    if (!user) {
      throw createBadRequest("User not found.");
    }
    return user;
  }

  if (role === "driver") {
    const driver = getDriverById(id);
    if (!driver) {
      throw createBadRequest("Driver not found.");
    }
    return driver;
  }

  throw createBadRequest("Unsupported auth role.");
}

function validateRole(role) {
  if (!["customer", "driver"].includes(role)) {
    throw createBadRequest("Unsupported auth role.");
  }
}
