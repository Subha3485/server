import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { clearRefreshCookie, parseCookies, setRefreshCookie } from "./http/cookies.js";
import { requireAuth } from "./middleware/auth.js";
import { broadcastTripEvent, broadcastTripUpdate } from "./realtime.js";
import {
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

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "buslogistic-server", timestamp: new Date().toISOString() });
  });

  app.get("/admin", (_req, res) => {
    res.sendFile(path.resolve(__dirname, "../public/admin/index.html"));
  });

  registerAuthRoutes(app, "", "customer");
  registerAuthRoutes(app, "/driver", "driver");
  registerAuthRoutes(app, "/admin", "admin");

  app.get("/api/routes", asyncHandler(async (_req, res) => {
    res.json({ data: (await getAllRoutes()).map(sanitizeRoute) });
  }));

  app.get("/api/routes/:routeId", asyncHandler(async (req, res) => {
    const route = await getRouteById(req.params.routeId);
    if (!route) {
      throw createBadRequest("Route not found.");
    }
    res.json({ data: sanitizeRoute(route) });
  }));

  app.get("/api/driver/:driverId/assignment", asyncHandler(async (req, res) => {
    res.json({ data: await getDriverAssignment(req.params.driverId) });
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

    const trip = booking.id === "BK-240301" ? await getTripTracking("trip-001") : null;

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
    res.json({
      data: {
        userId: user.id,
        balance: user.walletBalance,
        paymentOptions: ["UPI", "Wallet", "Cash at pickup"]
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
  if (req.body?.refreshToken) {
    return req.body.refreshToken;
  }

  const cookies = parseCookies(req);
  return cookies[config.refreshCookieName] ?? null;
}

function registerAuthRoutes(app, prefix, role) {
  const base = `/api${prefix}/auth`;

  app.post(`${base}/send-otp`, asyncHandler((req, res) => handleSendOtp(req, res, role)));
  app.post(`${base}/resend-otp`, asyncHandler((req, res) => handleResendOtp(req, res, role)));
  app.post(`${base}/verify-otp`, asyncHandler((req, res) => handleVerifyOtp(req, res, role)));
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
