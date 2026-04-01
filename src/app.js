import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { routes } from "./data.js";
import { requireAuth } from "./middleware/auth.js";
import { broadcastTripEvent, broadcastTripUpdate } from "./realtime.js";
import {
  getIdentityFromAccessToken,
  logout,
  refreshAccessToken,
  resendOtp,
  sendOtp,
  serializeAuthIdentity,
  verifyOtp
} from "./services/auth.js";
import {
  appendTripEvent,
  calculateFare,
  createBus,
  createBadRequest,
  createBooking,
  createDriver,
  createRoute,
  getAllBuses,
  getAllDrivers,
  getAllRoutes,
  getAdminSummary,
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

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.resolve(__dirname, "../public")));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "buslogistic-server", timestamp: new Date().toISOString() });
  });

  app.get("/admin", (_req, res) => {
    res.sendFile(path.resolve(__dirname, "../public/admin/index.html"));
  });

  app.post("/api/auth/send-otp", (req, res, next) => handleSendOtp(req, res, next, "customer"));
  app.post("/api/auth/resend-otp", (req, res, next) => handleResendOtp(req, res, next, "customer"));
  app.post("/api/auth/verify-otp", (req, res, next) => handleVerifyOtp(req, res, next, "customer"));
  app.post("/api/auth/refresh", (req, res, next) => handleRefresh(req, res, next, "customer"));
  app.post("/api/auth/logout", (req, res, next) => handleLogout(req, res, next, "customer"));
  app.get("/api/auth/me", requireAuth("customer"), (req, res) => {
    res.json({ data: serializeAuthIdentity(req.auth) });
  });

  app.post("/api/driver/auth/send-otp", (req, res, next) => handleSendOtp(req, res, next, "driver"));
  app.post("/api/driver/auth/resend-otp", (req, res, next) => handleResendOtp(req, res, next, "driver"));
  app.post("/api/driver/auth/verify-otp", (req, res, next) => handleVerifyOtp(req, res, next, "driver"));
  app.post("/api/driver/auth/refresh", (req, res, next) => handleRefresh(req, res, next, "driver"));
  app.post("/api/driver/auth/logout", (req, res, next) => handleLogout(req, res, next, "driver"));
  app.get("/api/driver/auth/me", requireAuth("driver"), (req, res) => {
    res.json({ data: serializeAuthIdentity(req.auth) });
  });

  app.get("/api/routes", (_req, res) => {
    res.json({ data: routes.map(sanitizeRoute) });
  });

  app.get("/api/routes/:routeId", (req, res, next) => {
    try {
      const route = getRouteById(req.params.routeId);
      if (!route) {
        throw createBadRequest("Route not found.");
      }
      res.json({ data: sanitizeRoute(route) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/driver/:driverId/assignment", (req, res, next) => {
    try {
      res.json({ data: getDriverAssignment(req.params.driverId) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/trips/:tripId", (req, res, next) => {
    try {
      res.json({ data: getTripTracking(req.params.tripId) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/trips/:tripId/status", (req, res, next) => {
    try {
      const trip = updateTripStatus(req.params.tripId, req.body.status);
      if (trip.liveLocation) {
        broadcastTripUpdate(io, trip.id, trip.liveLocation);
      }
      broadcastTripEvent(io, trip.id, {
        type: "trip.status",
        message: `Trip marked as ${trip.status}`,
        time: new Date().toISOString()
      });
      res.json({ message: "Trip status updated.", data: trip });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/trips/:tripId/stops", (req, res, next) => {
    try {
      const trip = updateTripStop({
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
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/trips/:tripId/location", (req, res, next) => {
    try {
      const location = updateTripLocation({
        tripId: req.params.tripId,
        driverId: req.body.driverId,
        lat: req.body.lat,
        lng: req.body.lng,
        speed: req.body.speed,
        heading: req.body.heading,
        label: req.body.label
      });
      appendTripEvent(req.params.tripId, {
        type: "location.update",
        message: `Location updated at ${location.label}`,
        time: location.updatedAt
      });
      broadcastTripUpdate(io, req.params.tripId, location);
      res.json({ message: "Trip location updated.", data: location });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/summary", (_req, res, next) => {
    try {
      res.json({ data: getAdminSummary() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/routes", (_req, res, next) => {
    try {
      res.json({ data: getAllRoutes() });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/routes", (req, res, next) => {
    try {
      res.status(201).json({
        message: "Route created successfully.",
        data: createRoute(req.body)
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/buses", (_req, res, next) => {
    try {
      res.json({ data: getAllBuses() });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/buses", (req, res, next) => {
    try {
      res.status(201).json({
        message: "Bus created successfully.",
        data: createBus(req.body)
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/drivers", (_req, res, next) => {
    try {
      res.json({ data: getAllDrivers() });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/drivers", (req, res, next) => {
    try {
      res.status(201).json({
        message: "Driver created successfully.",
        data: createDriver(req.body)
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/bookings/:bookingId/status", (req, res, next) => {
    try {
      res.json({
        message: "Booking status updated successfully.",
        data: updateBookingStatus(req.params.bookingId, req.body.status)
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/users/:userId/profile", (req, res, next) => {
    try {
      const user = getUserById(req.params.userId);
      if (!user) {
        throw createBadRequest("User not found.");
      }
      res.json({ data: user });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/fare/quote", (req, res, next) => {
    try {
      const {
        routeId,
        pickupStopId,
        dropStopId,
        weightKg = 1,
        quantity = 1,
        fragile = false,
        express = false
      } = req.body;

      const route = getRouteById(routeId);
      if (!route) {
        throw createBadRequest("Route not found.");
      }

      const quote = calculateFare({
        route,
        pickupStopId,
        dropStopId,
        weightKg,
        quantity,
        fragile,
        express
      });

      res.json({ data: quote });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/routes/:routeId/slots", (req, res, next) => {
    try {
      const route = getRouteById(req.params.routeId);
      if (!route) {
        throw createBadRequest("Route not found.");
      }
      res.json({ data: route.slots });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/bookings", (req, res, next) => {
    try {
      const booking = createBooking(req.body);
      res.status(201).json({
        message: "Booking created successfully.",
        data: booking
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/users/:userId/bookings", (req, res, next) => {
    try {
      res.json({ data: getBookingsForUser(req.params.userId) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/bookings/:bookingId", (req, res, next) => {
    try {
      const booking = getBookingById(req.params.bookingId);
      if (!booking) {
        throw createBadRequest("Booking not found.");
      }
      res.json({ data: booking });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/bookings/:bookingId/tracking", (req, res, next) => {
    try {
      const booking = getBookingById(req.params.bookingId);
      if (!booking) {
        throw createBadRequest("Booking not found.");
      }

      const trip = booking.id === "BK-240301" ? getTripTracking("trip-001") : null;

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
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/users/:userId/wallet", (req, res, next) => {
    try {
      const user = getUserById(req.params.userId);
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
    } catch (error) {
      next(error);
    }
  });

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

function handleSendOtp(req, res, next, role) {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      throw createBadRequest("phoneNumber is required.");
    }

    res.json({
      message: "OTP sent successfully.",
      data: sendOtp({ phoneNumber, role })
    });
  } catch (error) {
    next(error);
  }
}

function handleResendOtp(req, res, next, role) {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      throw createBadRequest("sessionId is required.");
    }

    res.json({
      message: "OTP resent successfully.",
      data: resendOtp({ sessionId, role })
    });
  } catch (error) {
    next(error);
  }
}

function handleVerifyOtp(req, res, next, role) {
  try {
    const { sessionId, otp } = req.body;
    if (!sessionId || !otp) {
      throw createBadRequest("sessionId and otp are required.");
    }

    const auth = verifyOtp({ sessionId, otp, role });
    const me = getIdentityFromAccessToken(auth.accessToken);

    res.json({
      message: "OTP verified successfully.",
      data: {
        ...auth,
        ...serializeAuthIdentity(me)
      }
    });
  } catch (error) {
    next(error);
  }
}

function handleRefresh(req, res, next, role) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw createBadRequest("refreshToken is required.");
    }

    res.json({
      message: "Access token refreshed successfully.",
      data: refreshAccessToken({ refreshToken, role })
    });
  } catch (error) {
    next(error);
  }
}

function handleLogout(req, res, next, role) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw createBadRequest("refreshToken is required.");
    }

    res.json({
      message: "Logged out successfully.",
      data: logout({ refreshToken, role })
    });
  } catch (error) {
    next(error);
  }
}
