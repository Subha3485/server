import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { getCollections } from "../db.js";
import { createBadRequest, getDriverById, getDriverByPhone, getUserById, getUserByPhone } from "./logistics.js";
import { generateOtpCode, sendOtpCode } from "./otp_provider.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

export function maskPhoneNumber(phoneNumber) {
  if (!phoneNumber || phoneNumber.length < 4) return phoneNumber;
  return `${"*".repeat(Math.max(0, phoneNumber.length - 4))}${phoneNumber.slice(-4)}`;
}

export async function sendOtp({ phoneNumber, role }) {
  validateRole(role);
  const identity = await resolveIdentityByPhone({ phoneNumber, role });
  const existing = await findLatestOtpSession({ phone: phoneNumber, role });

  if (existing && existing.status === "pending" && Date.now() < new Date(existing.resendAvailableAt).getTime()) {
    return {
      sessionId: existing._id,
      phoneNumber: maskPhoneNumber(phoneNumber),
      expiresInSeconds: Math.max(
        0,
        Math.floor((new Date(existing.expiresAt).getTime() - Date.now()) / 1000)
      ),
      resendInSeconds: Math.max(
        0,
        Math.floor((new Date(existing.resendAvailableAt).getTime() - Date.now()) / 1000)
      ),
      otpPreview: config.otpFixedCode || undefined
    };
  }

  const code = await generateOtpCode();
  const delivery = await sendOtpCode({ phoneNumber, code });
  const { otpSessions } = await getCollections();

  const sessionId = `otp-${crypto.randomUUID()}`;
  const createdAt = new Date();
  const session = {
    _id: sessionId,
    phone: phoneNumber,
    role,
    userId: identity.id,
    otpHash: hashValue(code),
    expiresAt: new Date(createdAt.getTime() + OTP_TTL_MS),
    resendAvailableAt: new Date(createdAt.getTime() + RESEND_COOLDOWN_MS),
    attemptCount: 0,
    maxAttempts: MAX_ATTEMPTS,
    status: "pending",
    provider: delivery.provider,
    createdAt
  };

  await otpSessions.insertOne(session);

  return {
    sessionId,
    phoneNumber: maskPhoneNumber(phoneNumber),
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    resendInSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000),
    otpPreview: delivery.preview ?? undefined
  };
}

export async function resendOtp({ sessionId, role }) {
  const { otpSessions } = await getCollections();
  const session = await otpSessions.findOne({ _id: sessionId });
  if (!session || session.role !== role) {
    throw createBadRequest("OTP session not found.");
  }

  ensurePendingOtpSession(session);

  if (Date.now() < new Date(session.resendAvailableAt).getTime()) {
    throw createBadRequest("OTP resend is cooling down. Try again shortly.");
  }

  const code = await generateOtpCode();
  const delivery = await sendOtpCode({ phoneNumber: session.phone, code });
  const resendAvailableAt = new Date(Date.now() + RESEND_COOLDOWN_MS);

  await otpSessions.updateOne(
    { _id: sessionId },
    {
      $set: {
        otpHash: hashValue(code),
        provider: delivery.provider,
        resendAvailableAt
      }
    }
  );

  return {
    sessionId: session._id,
    phoneNumber: maskPhoneNumber(session.phone),
    resendInSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000),
    otpPreview: delivery.preview ?? undefined
  };
}

export async function verifyOtp({ sessionId, otp, role, meta = {} }) {
  const { otpSessions } = await getCollections();
  const session = await otpSessions.findOne({ _id: sessionId });
  if (!session || session.role !== role) {
    throw createBadRequest("OTP session not found.");
  }

  ensurePendingOtpSession(session);

  const attemptCount = Number(session.attemptCount ?? 0) + 1;
  if (session.otpHash !== hashValue(otp)) {
    await otpSessions.updateOne(
      { _id: sessionId },
      { $set: { attemptCount, status: attemptCount >= MAX_ATTEMPTS ? "locked" : "pending" } }
    );
    if (attemptCount >= MAX_ATTEMPTS) {
      throw createBadRequest("OTP attempts exceeded.");
    }
    throw createBadRequest("Invalid OTP.");
  }

  await otpSessions.updateOne(
    { _id: sessionId },
    { $set: { attemptCount, status: "verified", verifiedAt: new Date() } }
  );

  const identity = await resolveIdentityById({ role, id: session.userId });
  return createTokenBundle({ role, identity, meta });
}

export async function createSessionForPhone({ phoneNumber, role, meta = {} }) {
  validateRole(role);
  const identity = await resolveIdentityByPhone({ phoneNumber, role });
  return createTokenBundle({ role, identity, meta });
}

export async function refreshAccessToken({ refreshToken, role, meta = {} }) {
  validateRole(role);
  const decoded = verifyJwt(refreshToken, config.jwtRefreshSecret, "refresh");
  const { authSessions } = await getCollections();
  const session = await authSessions.findOne({ _id: decoded.sid });

  if (!session || session.role !== role) {
    throw createBadRequest("Refresh session not found.");
  }

  assertActiveSession(session);

  if (session.currentJti !== decoded.jti || session.refreshTokenHash !== hashValue(refreshToken)) {
    await revokeSession(session._id, "Refresh token reuse detected.");
    throw createBadRequest("Invalid refresh token.");
  }

  const identity = await resolveIdentityById({ role, id: session.userId });
  return rotateRefreshSession({ session, identity, meta });
}

export async function logout({ refreshToken, role }) {
  validateRole(role);
  const decoded = verifyJwt(refreshToken, config.jwtRefreshSecret, "refresh");
  const { authSessions } = await getCollections();
  const session = await authSessions.findOne({ _id: decoded.sid, role });

  if (!session) {
    throw createBadRequest("Refresh session not found.");
  }

  await revokeSession(session._id, "User logged out.");
  return { ok: true };
}

export async function logoutAllSessions({ userId, role, exceptSessionId = null }) {
  validateRole(role);
  const { authSessions } = await getCollections();
  const filter = {
    userId,
    role,
    revokedAt: null
  };

  if (exceptSessionId) {
    filter._id = { $ne: exceptSessionId };
  }

  await authSessions.updateMany(
    filter,
    {
      $set: {
        revokedAt: new Date(),
        revokeReason: "Logged out from all devices."
      }
    }
  );

  return { ok: true };
}

export async function listSessions({ userId, role, currentSessionId = null }) {
  validateRole(role);
  const { authSessions } = await getCollections();
  const sessions = await authSessions
    .find({ userId, role })
    .sort({ lastUsedAt: -1, issuedAt: -1 })
    .project({
      _id: 1,
      issuedAt: 1,
      expiresAt: 1,
      revokedAt: 1,
      revokeReason: 1,
      userAgent: 1,
      ipAddress: 1,
      lastUsedAt: 1
    })
    .toArray();

  return sessions.map((session) => ({
    id: session._id,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt ?? null,
    revokeReason: session.revokeReason ?? null,
    userAgent: session.userAgent ?? null,
    ipAddress: session.ipAddress ?? null,
    lastUsedAt: session.lastUsedAt ?? null,
    isCurrent: session._id === currentSessionId
  }));
}

export async function revokeSessionById({ sessionId, userId, role }) {
  validateRole(role);
  const { authSessions } = await getCollections();
  const session = await authSessions.findOne({ _id: sessionId, userId, role });

  if (!session) {
    throw createBadRequest("Session not found.");
  }

  await revokeSession(sessionId, "Revoked by user.");
  return { ok: true };
}

export async function getIdentityFromAccessToken(token) {
  if (!token) {
    throw createBadRequest("Authorization token is required.");
  }

  const payload = verifyJwt(token, config.jwtAccessSecret, "access");
  const identity = await resolveIdentityById({ role: payload.role, id: payload.sub });

  return {
    role: payload.role,
    identity,
    tokenPayload: payload
  };
}

export function serializeAuthIdentity({ role, identity }) {
  if (role === "customer") {
    return { role, user: identity };
  }

  if (role === "driver") {
    return { role, driver: identity };
  }

  if (role === "admin") {
    return { role, admin: identity };
  }

  throw createBadRequest("Unsupported auth role.");
}

async function createTokenBundle({ role, identity, meta }) {
  const { authSessions } = await getCollections();
  const sessionId = `session-${crypto.randomUUID()}`;
  const refreshJti = crypto.randomUUID();
  const refreshToken = signRefreshToken({ userId: identity.id, role, sessionId, jti: refreshJti });
  const accessToken = signAccessToken({ userId: identity.id, role, sessionId });
  const now = new Date();
  const refreshExpiresAt = getTokenExpirationDate(refreshToken);

  await authSessions.insertOne({
    _id: sessionId,
    userId: identity.id,
    role,
    currentJti: refreshJti,
    refreshTokenHash: hashValue(refreshToken),
    issuedAt: now,
    expiresAt: refreshExpiresAt,
    revokedAt: null,
    revokeReason: null,
    userAgent: meta.userAgent ?? null,
    ipAddress: meta.ipAddress ?? null,
    lastUsedAt: now
  });

  return {
    accessToken,
    refreshToken,
    accessExpiresAt: getTokenExpirationDate(accessToken).toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    sessionId,
    ...serializeAuthIdentity({ role, identity })
  };
}

async function rotateRefreshSession({ session, identity, meta }) {
  const { authSessions } = await getCollections();
  const nextJti = crypto.randomUUID();
  const refreshToken = signRefreshToken({
    userId: identity.id,
    role: session.role,
    sessionId: session._id,
    jti: nextJti
  });
  const accessToken = signAccessToken({ userId: identity.id, role: session.role, sessionId: session._id });
  const refreshExpiresAt = getTokenExpirationDate(refreshToken);

  await authSessions.updateOne(
    { _id: session._id },
    {
      $set: {
        currentJti: nextJti,
        refreshTokenHash: hashValue(refreshToken),
        expiresAt: refreshExpiresAt,
        lastUsedAt: new Date(),
        userAgent: meta.userAgent ?? session.userAgent ?? null,
        ipAddress: meta.ipAddress ?? session.ipAddress ?? null
      }
    }
  );

  return {
    accessToken,
    refreshToken,
    accessExpiresAt: getTokenExpirationDate(accessToken).toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    sessionId: session._id
  };
}

function signAccessToken({ userId, role, sessionId }) {
  return jwt.sign(
    { role, type: "access", sid: sessionId },
    config.jwtAccessSecret,
    {
      issuer: config.jwtIssuer,
      subject: userId,
      expiresIn: config.accessTokenTtl
    }
  );
}

function signRefreshToken({ userId, role, sessionId, jti }) {
  return jwt.sign(
    { role, type: "refresh", sid: sessionId },
    config.jwtRefreshSecret,
    {
      issuer: config.jwtIssuer,
      subject: userId,
      jwtid: jti,
      expiresIn: config.refreshTokenTtl
    }
  );
}

function verifyJwt(token, secret, expectedType) {
  let decoded;
  try {
    decoded = jwt.verify(token, secret, { issuer: config.jwtIssuer });
  } catch {
    throw createBadRequest("Admin session expired. Please sign in again.");
  }

  if (decoded.type !== expectedType) {
    throw createBadRequest("Invalid token type.");
  }

  return {
    sub: decoded.sub,
    role: decoded.role,
    sid: decoded.sid,
    jti: decoded.jti ?? decoded.jwtid,
    exp: decoded.exp,
    iat: decoded.iat,
    type: decoded.type
  };
}

function getTokenExpirationDate(token) {
  const decoded = jwt.decode(token);
  if (!decoded?.exp) {
    throw new Error("Token expiration missing.");
  }
  return new Date(decoded.exp * 1000);
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

async function findLatestOtpSession({ phone, role }) {
  const { otpSessions } = await getCollections();
  return otpSessions.findOne({ phone, role }, { sort: { createdAt: -1 } });
}

async function resolveIdentityByPhone({ phoneNumber, role }) {
  if (role === "customer") {
    const user = await getUserByPhone(phoneNumber);
    if (user) return user;

    const { users } = await getCollections();
    const nextId = await createUserId(users, "user-");
    const now = new Date().toISOString();
    const newUser = {
      _id: nextId,
      name: "New User",
      phone: phoneNumber,
      email: "",
      role: "customer",
      rating: 0,
      createdAt: now,
      usage: "Personal",
      language: "English",
      walletBalance: 0,
      gstNumber: "",
      savedRouteIds: [],
      savedStopIds: []
    };
    await users.insertOne(newUser);
    return formatIdentity(newUser);
  }

  if (role === "driver") {
    const driver = await getDriverByPhone(phoneNumber);
    if (!driver) {
      throw createBadRequest("Driver not found.");
    }
    return driver;
  }

  if (role === "admin") {
    const admin = await getUserByPhone(phoneNumber);
    if (!admin || admin.role !== "admin") {
      throw createBadRequest("Admin not found.");
    }
    return admin;
  }

  throw createBadRequest("Unsupported auth role.");
}

async function resolveIdentityById({ role, id }) {
  if (role === "customer") {
    const user = await getUserById(id);
    if (!user || user.role !== "customer") {
      throw createBadRequest("User not found.");
    }
    return user;
  }

  if (role === "driver") {
    const driver = await getDriverById(id);
    if (!driver) {
      throw createBadRequest("Driver not found.");
    }
    return driver;
  }

  if (role === "admin") {
    const admin = await getUserById(id);
    if (!admin || admin.role !== "admin") {
      throw createBadRequest("Admin not found.");
    }
    return admin;
  }

  throw createBadRequest("Unsupported auth role.");
}

function validateRole(role) {
  if (!["customer", "driver", "admin"].includes(role)) {
    throw createBadRequest("Unsupported auth role.");
  }
}

function ensurePendingOtpSession(session) {
  if (session.status !== "pending") {
    throw createBadRequest("OTP session is no longer active.");
  }

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    throw createBadRequest("OTP session expired.");
  }

  if (Number(session.attemptCount ?? 0) >= Number(session.maxAttempts ?? MAX_ATTEMPTS)) {
    throw createBadRequest("OTP attempts exceeded.");
  }
}

function assertActiveSession(session) {
  if (session.revokedAt) {
    throw createBadRequest("Refresh session revoked.");
  }

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    throw createBadRequest("Refresh session expired.");
  }
}

async function revokeSession(sessionId, reason) {
  const { authSessions } = await getCollections();
  await authSessions.updateOne(
    { _id: sessionId },
    {
      $set: {
        revokedAt: new Date(),
        revokeReason: reason
      }
    }
  );
}

async function createUserId(collection, prefix) {
  const latest = await collection
    .find({ _id: { $regex: `^${prefix}` } }, { projection: { _id: 1 } })
    .sort({ _id: -1 })
    .limit(1)
    .toArray();

  const current = Number.parseInt(latest[0]?._id?.replace(prefix, "") ?? "0", 10);
  return `${prefix}${String(Number.isNaN(current) ? 1 : current + 1).padStart(3, "0")}`;
}

function formatIdentity(user) {
  return {
    id: user._id,
    name: user.name,
    phone: user.phone,
    phoneNumber: user.phone,
    email: user.email ?? "",
    role: user.role,
    rating: user.rating ?? 0,
    createdAt: user.createdAt,
    badgeNumber: user.badgeNumber ?? null,
    status: user.status ?? null,
    usage: user.usage ?? "Personal",
    language: user.language ?? "English",
    walletBalance: user.walletBalance ?? 0,
    gstNumber: user.gstNumber ?? ""
  };
}
