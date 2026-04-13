import cors from "cors";
import express from "express";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { clearRefreshCookie, parseCookies, setRefreshCookie } from "./http/cookies.js";
import { requireAuth } from "./middleware/auth.js";
import { broadcastTripEvent, broadcastTripUpdate } from "./realtime.js";
import { getCollections, getDatabaseConnectionStatus, invalidateCache } from "./db.js";
import { getAllowedRuntimeModes, getRuntimeMode, resolveDbNameForMode, setRuntimeMode } from "./runtime_mode.js";
import {
  createSessionForPhone,
  getIdentityFromAccessToken,
  listSessions,
  logout,
  logoutAllSessions,
  refreshAccessToken,
  revokeSessionById,
  resendOtp,
  sendOtp,
  serializeAuthIdentity,
  verifyOtp
} from "./services/auth.js";
import {
  appendTripEvent,
  calculateFare,
  createBadRequest,
  createBooking,
  createBus,
  createDriver,
  createRoute,
  getAdminSummary,
  getAllBuses,
  getAllDrivers,
  getAllRoutes,
  getBookingById,
  getDriverByPhone,
  getBookingsForUser,
  getDriverAssignment,
  getRouteById,
  getTripTracking,
  getUserById,
  sanitizeRoute,
  updateBookingStatus,
  updateTripLocation,
  updateTripStatus,
  updateTripStop
} from "./services/logistics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(io) {
  const app = express();

  // Required behind reverse proxies so req.ip and secure cookie logic work correctly.
  app.set("trust proxy", 1);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.allowedOrigins === "*" || config.allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin not allowed by CORS"));
      },
      credentials: true
    })
  );
  app.use(express.json());
  app.use(express.static(path.resolve(__dirname, "../public")));

  app.get("/", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "buslogistic-server",
      message: "Server is running.",
      routes: {
        health: "/health",
        admin: "/admin",
        apiRoutes: "/api/routes"
      }
    });
  });

  app.get("/health", asyncHandler(async (_req, res) => {
    const dbStatus = await getDatabaseConnectionStatus();
    res.status(dbStatus.connected ? 200 : 503).json({
      ok: dbStatus.connected,
      service: "buslogistic-server",
      timestamp: new Date().toISOString(),
      database: dbStatus
    });
  }));

  app.get("/api/runtime/mode", (_req, res) => {
    const mode = getRuntimeMode();
    res.json({
      data: {
        mode,
        activeDbName: resolveDbNameForMode(mode)
      }
    });
  });

  app.get("/admin", (_req, res) => {
    res.sendFile(path.resolve(__dirname, "../public/admin/index.html"));
  });

  app.get("/admin/*", (_req, res) => {
    res.sendFile(path.resolve(__dirname, "../public/admin/index.html"));
  });

  // Register customer/driver/admin auth routes with shared handler logic.
  registerAuthRoutes(app, "", "customer");
  registerAuthRoutes(app, "/driver", "driver");
  registerAuthRoutes(app, "/admin", "admin");

  app.get("/api/routes", asyncHandler(async (_req, res) => {
    res.json({ data: await getAllRoutes() });
  }));

  app.get("/api/routes/:routeId", asyncHandler(async (req, res) => {
    const route = await getRouteById(req.params.routeId);
    if (!route) {
      throw createBadRequest("Route not found.");
    }
    res.json({ data: await sanitizeRoute(route) });
  }));

  app.get("/api/driver/:driverId/assignment", asyncHandler(async (req, res) => {
    res.json({ data: await getDriverAssignment(req.params.driverId) });
  }));

  app.get("/api/driver/by-phone/:phoneNumber", asyncHandler(async (req, res) => {
    const driver = await getDriverByPhone(req.params.phoneNumber);
    if (!driver) {
      throw createBadRequest("Driver not found.");
    }
    res.json({ data: driver });
  }));

  app.get("/api/trips/:tripId", asyncHandler(async (req, res) => {
    res.json({ data: await getTripTracking(req.params.tripId) });
  }));

  app.post("/api/trips/:tripId/status", asyncHandler(async (req, res) => {
    const trip = await updateTripStatus(req.params.tripId, req.body.status);
    if (trip.liveLocation) {
      broadcastTripUpdate(io, trip.id, trip.liveLocation);
    }
    broadcastTripEvent(io, trip.id, {
      type: "trip.status",
      message: `Trip marked as ${trip.status}`,
      time: new Date().toISOString()
    });
    res.json({ message: "Trip status updated.", data: trip });
  }));

  app.post("/api/trips/:tripId/stops", asyncHandler(async (req, res) => {
    const trip = await updateTripStop({
      tripId: req.params.tripId,
      currentStopId: req.body.currentStopId,
      nextStopId: req.body.nextStopId,
      message: req.body.message
    });
    broadcastTripEvent(io, trip.id, {
      type: "stop.update",
      message: req.body.message ?? "Stop progress updated",
      time: new Date().toISOString()
    });
    res.json({ message: "Trip stop updated.", data: trip });
  }));

  app.post("/api/trips/:tripId/location", asyncHandler(async (req, res) => {
    const location = await updateTripLocation({
      tripId: req.params.tripId,
      driverId: req.body.driverId,
      lat: req.body.lat,
      lng: req.body.lng,
      speed: req.body.speed,
      heading: req.body.heading,
      label: req.body.label
    });
    await appendTripEvent(req.params.tripId, {
      type: "location.update",
      message: `Location updated at ${location.label}`,
      time: location.updatedAt
    });
    broadcastTripUpdate(io, req.params.tripId, location);
    res.json({ message: "Trip location updated.", data: location });
  }));

  app.post("/api/bookings/:bookingId/passenger-location", asyncHandler(async (req, res) => {
    const { lat, lng, accuracy } = req.body;
    if (!lat || !lng) {
      throw createBadRequest("Latitude and longitude are required.");
    }
    
    const booking = await getBookingById(req.params.bookingId);
    if (!booking) {
      throw createBadRequest("Booking not found.");
    }

    // Store passenger location signal for analytics and backup tracking.
    const signalData = {
      bookingId: req.params.bookingId,
      lat: Number(lat),
      lng: Number(lng),
      accuracy: Number(accuracy ?? 0),
      timestamp: new Date().toISOString()
    };

    // If booking is active with a trip, broadcast an informational event.
    if (booking.slot?.busNumber) {
      broadcastTripEvent(io, booking.id, {
        type: "passenger.signal",
        message: "Passenger location signal received",
        time: new Date().toISOString(),
        data: signalData
      });
    }

    res.json({ 
      message: "Passenger location recorded.", 
      data: signalData 
    });
  }));

  // Everything under /api/admin requires an authenticated admin token.
  app.use("/api/admin", requireAuth("admin"));

  app.get("/api/admin/summary", asyncHandler(async (_req, res) => {
    res.json({ data: await getAdminSummary() });
  }));

  app.get("/api/admin/routes", asyncHandler(async (_req, res) => {
    res.json({ data: await getAllRoutes() });
  }));

  app.post("/api/admin/routes", asyncHandler(async (req, res) => {
    res.status(201).json({
      message: "Route created successfully.",
      data: await createRoute(req.body)
    });
  }));

  app.get("/api/admin/buses", asyncHandler(async (_req, res) => {
    res.json({ data: await getAllBuses() });
  }));

  app.post("/api/admin/buses", asyncHandler(async (req, res) => {
    res.status(201).json({
      message: "Bus created successfully.",
      data: await createBus(req.body)
    });
  }));

  app.get("/api/admin/drivers", asyncHandler(async (_req, res) => {
    res.json({ data: await getAllDrivers() });
  }));

  app.post("/api/admin/drivers", asyncHandler(async (req, res) => {
    res.status(201).json({
      message: "Driver created successfully.",
      data: await createDriver(req.body)
    });
  }));

  app.post("/api/admin/runtime/mode", asyncHandler(async (req, res) => {
    const mode = String(req.body.mode ?? "").toLowerCase();
    if (!getAllowedRuntimeModes().has(mode)) {
      throw createBadRequest("mode must be one of: mock, live");
    }
    const updatedMode = setRuntimeMode(mode);
    invalidateCache();
    res.json({
      message: "Runtime mode updated.",
      data: {
        mode: updatedMode,
        activeDbName: resolveDbNameForMode(updatedMode)
      }
    });
  }));

  app.patch("/api/admin/bookings/:bookingId/status", asyncHandler(async (req, res) => {
    res.json({
      message: "Booking status updated successfully.",
      data: await updateBookingStatus(req.params.bookingId, req.body.status)
    });
  }));

  app.get("/api/users/:userId/profile", asyncHandler(async (req, res) => {
    const user = await getUserById(req.params.userId);
    if (!user) {
      throw createBadRequest("User not found.");
    }
    res.json({ data: user });
  }));

  app.post("/api/fare/quote", asyncHandler(async (req, res) => {
    const {
      routeId,
      pickupStopId,
      dropStopId,
      weightKg = 1,
      quantity = 1,
      fragile = false,
      express = false
    } = req.body;

    const route = await getRouteById(routeId);
    if (!route) {
      throw createBadRequest("Route not found.");
    }

    res.json({
      data: calculateFare({
        route,
        pickupStopId,
        dropStopId,
        weightKg,
        quantity,
        fragile,
        express
      })
    });
  }));

  app.get("/api/routes/:routeId/slots", asyncHandler(async (req, res) => {
    const route = await getRouteById(req.params.routeId);
    if (!route) {
      throw createBadRequest("Route not found.");
    }
    res.json({ data: route.slots });
  }));

  app.post("/api/bookings", asyncHandler(async (req, res) => {
    const booking = await createBooking(req.body);
    res.status(201).json({
      message: "Booking created successfully.",
      data: booking
    });
  }));

  app.get("/api/users/:userId/bookings", asyncHandler(async (req, res) => {
    res.json({ data: await getBookingsForUser(req.params.userId) });
  }));

  app.get("/api/bookings/:bookingId", asyncHandler(async (req, res) => {
    const booking = await getBookingById(req.params.bookingId);
    if (!booking) {
      throw createBadRequest("Booking not found.");
    }
    res.json({ data: booking });
  }));

  app.get("/api/bookings/:bookingId/tracking", asyncHandler(async (req, res) => {
    const booking = await getBookingById(req.params.bookingId);
    if (!booking) {
      throw createBadRequest("Booking not found.");
    }

    const trip = booking.busId ? await getTripTracking(booking.busId) : null;

    res.json({
      data: {
        bookingId: booking.id,
        currentStatus: booking.status,
        route: booking.route,
        busNumber: booking.slot?.busNumber ?? null,
        eta: booking.slot?.arrival ?? null,
        timeline: booking.tracking,
        liveLocation: trip?.liveLocation ?? null
      }
    });
  }));

  app.get("/api/users/:userId/wallet", asyncHandler(async (req, res) => {
    const user = await getUserById(req.params.userId);
    if (!user) {
      throw createBadRequest("User not found.");
    }
    const { payments } = await getCollections();
    const paymentOptions = Array.from(new Set(await payments.distinct("method"))).filter(Boolean).sort();
    res.json({
      data: {
        userId: user.id,
        balance: user.walletBalance,
        paymentOptions
      }
    });
  }));

  app.use((error, _req, res, _next) => {
    const statusCode = error.statusCode ?? 500;
    res.status(statusCode).json({
      error: {
        message: error.message ?? "Internal server error"
      }
    });
  });

  return app;
}

function asyncHandler(handler) {
  // Central wrapper to preserve async/await style and still route errors to middleware.
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

async function handleSendOtp(req, res, role) {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    throw createBadRequest("phoneNumber is required.");
  }

  res.json({
    message: "OTP sent successfully.",
    data: await sendOtp({ phoneNumber, role })
  });
}

async function handleResendOtp(req, res, role) {
  const { sessionId } = req.body;
  if (!sessionId) {
    throw createBadRequest("sessionId is required.");
  }

  res.json({
    message: "OTP resent successfully.",
    data: await resendOtp({ sessionId, role })
  });
}

async function handleVerifyOtp(req, res, role) {
  const { sessionId, otp } = req.body;
  if (!sessionId || !otp) {
    throw createBadRequest("sessionId and otp are required.");
  }

  const auth = await verifyOtp({ sessionId, otp, role, meta: requestMeta(req) });
  setRefreshCookie(res, auth.refreshToken);
  const me = await getIdentityFromAccessToken(auth.accessToken);

  res.json({
    message: "OTP verified successfully.",
    data: {
      ...auth,
      ...serializeAuthIdentity(me)
    }
  });
}

async function verifyFirebaseIdToken(firebaseIdToken) {
  if (!firebaseIdToken) {
    throw createBadRequest("firebaseIdToken is required.");
  }

  const fileCredentials = await loadFirebaseServiceAccount(config.firebaseServiceAccountPath);
  const credentials = fileCredentials ?? {
    projectId: config.firebaseProjectId,
    clientEmail: config.firebaseClientEmail,
    privateKey: config.firebasePrivateKey
  };
  if (!credentials.projectId || !credentials.clientEmail || !credentials.privateKey) {
    throw createBadRequest("Firebase Admin credentials are not configured on server.");
  }

  let admin;
  try {
    admin = await import("firebase-admin");
  } catch {
    throw createBadRequest("firebase-admin package is missing. Run npm install firebase-admin.");
  }

  const existingApp = admin.apps.find((app) => app.name === "buslogistic-firebase");
  const app = existingApp
    ?? admin.initializeApp(
      {
        credential: admin.cert(credentials)
      },
      "buslogistic-firebase"
    );

  try {
    return await admin.getAuth(app).verifyIdToken(firebaseIdToken);
  } catch {
    throw createBadRequest("Invalid Firebase token.");
  }
}

async function loadFirebaseServiceAccount(serviceAccountPath) {
  if (!serviceAccountPath) {
    return null;
  }

  let content;
  try {
    content = await readFile(serviceAccountPath, "utf8");
  } catch {
    throw createBadRequest("Unable to read Firebase service account file.");
  }

  let json;
  try {
    json = JSON.parse(content);
  } catch {
    throw createBadRequest("Firebase service account file must be valid JSON.");
  }

  const projectId = String(json.project_id ?? "").trim();
  const clientEmail = String(json.client_email ?? "").trim();
  const privateKey = String(json.private_key ?? "").replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw createBadRequest(
      "Firebase service account file must include project_id, client_email, and private_key."
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey
  };
}

async function handleFirebaseLogin(req, res, role) {
  const { firebaseIdToken, phoneNumber } = req.body;
  if (!phoneNumber) {
    throw createBadRequest("phoneNumber is required.");
  }

  const decoded = await verifyFirebaseIdToken(firebaseIdToken);
  const tokenPhone = String(decoded.phone_number ?? "").replace(/^\+91/, "");
  const requestedPhone = String(phoneNumber).replace(/^\+91/, "");
  if (!tokenPhone || tokenPhone != requestedPhone) {
    throw createBadRequest("Firebase token phone number does not match request.");
  }

  const session = await createSessionForPhone({
    phoneNumber: requestedPhone,
    role,
    meta: readRequestMeta(req)
  });
  setRefreshCookie(res, session.refreshToken);
  res.json({
    message: "Logged in successfully.",
    data: {
      ...session,
      provider: "firebase"
    }
  });
}

async function handleRefresh(req, res, role) {
  const refreshToken = getRefreshToken(req);
  if (!refreshToken) {
    throw createBadRequest("refreshToken is required.");
  }

  const data = await refreshAccessToken({ refreshToken, role, meta: requestMeta(req) });
  setRefreshCookie(res, data.refreshToken);
  res.json({
    message: "Access token refreshed successfully.",
    data
  });
}

async function handleLogout(req, res, role) {
  const refreshToken = getRefreshToken(req);
  if (!refreshToken) {
    throw createBadRequest("refreshToken is required.");
  }

  clearRefreshCookie(res);
  res.json({
    message: "Logged out successfully.",
    data: await logout({ refreshToken, role })
  });
}

async function handleListSessions(req, res) {
  res.json({
    data: await listSessions({
      userId: req.auth.identity.id,
      role: req.auth.role,
      currentSessionId: req.auth.tokenPayload.sid ?? null
    })
  });
}

async function handleRevokeSession(req, res) {
  const { sessionId } = req.params;
  const currentSessionId = req.auth.tokenPayload.sid ?? null;

  await revokeSessionById({
    sessionId,
    userId: req.auth.identity.id,
    role: req.auth.role
  });

  if (sessionId === currentSessionId) {
    clearRefreshCookie(res);
  }

  res.json({ message: "Session revoked.", data: { ok: true } });
}

async function handleLogoutAllSessions(req, res) {
  await logoutAllSessions({
    userId: req.auth.identity.id,
    role: req.auth.role,
    exceptSessionId: req.auth.tokenPayload.sid ?? null
  });

  res.json({ message: "Other sessions logged out.", data: { ok: true } });
}

function requestMeta(req) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent") ?? null
  };
}

function getRefreshToken(req) {
  // Body token is accepted for native apps; cookies support browser sessions.
  if (req.body?.refreshToken) {
    return req.body.refreshToken;
  }

  const cookies = parseCookies(req);
  return cookies[config.refreshCookieName] ?? null;
}

function registerAuthRoutes(app, prefix, role) {
  // Role-aware endpoint registration avoids route copy-paste across user types.
  const base = `/api${prefix}/auth`;

  app.post(`${base}/send-otp`, asyncHandler((req, res) => handleSendOtp(req, res, role)));
  app.post(`${base}/resend-otp`, asyncHandler((req, res) => handleResendOtp(req, res, role)));
  app.post(`${base}/verify-otp`, asyncHandler((req, res) => handleVerifyOtp(req, res, role)));
  app.post(`${base}/firebase-login`, asyncHandler((req, res) => handleFirebaseLogin(req, res, role)));
  app.post(`${base}/refresh`, asyncHandler((req, res) => handleRefresh(req, res, role)));
  app.post(`${base}/logout`, asyncHandler((req, res) => handleLogout(req, res, role)));
  app.post(`${base}/logout-all`, requireAuth(role), asyncHandler(handleLogoutAllSessions));
  app.get(
    `${base}/me`,
    requireAuth(role),
    asyncHandler(async (req, res) => {
      res.json({ data: serializeAuthIdentity(req.auth) });
    })
  );
  app.get(`${base}/sessions`, requireAuth(role), asyncHandler(handleListSessions));
  app.delete(`${base}/sessions/:sessionId`, requireAuth(role), asyncHandler(handleRevokeSession));
}
