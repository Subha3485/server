import { Server } from "socket.io";
import {
  appendTripEvent,
  createBadRequest,
  getTripTracking,
  updateTripLocation
} from "./services/logistics.js";

export function createRealtimeServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*"
    }
  });

  io.on("connection", (socket) => {
    socket.on("tracking:subscribe", ({ tripId }) => {
      try {
        if (!tripId) {
          throw createBadRequest("tripId is required.");
        }

        socket.join(`trip:${tripId}`);
        socket.emit("tracking:snapshot", getTripTracking(tripId));
      } catch (error) {
        socket.emit("tracking:error", { message: error.message });
      }
    });

    socket.on("admin:subscribe", () => {
      socket.join("admin:fleet");
    });

    socket.on("driver:location:update", (payload) => {
      try {
        const location = updateTripLocation(payload);
        io.to(`trip:${location.tripId}`).emit("tracking:update", location);
        io.to("admin:fleet").emit("admin:fleet:update", location);
      } catch (error) {
        socket.emit("tracking:error", { message: error.message });
      }
    });

    socket.on("driver:trip:event", ({ tripId, type, message }) => {
      try {
        if (!tripId) {
          throw createBadRequest("tripId is required.");
        }

        const event = {
          type: type ?? "trip.event",
          message: message ?? "Trip event received",
          time: new Date().toISOString()
        };

        appendTripEvent(tripId, event);
        io.to(`trip:${tripId}`).emit("tracking:event", { tripId, event });
        io.to("admin:fleet").emit("admin:trip:event", { tripId, event });
      } catch (error) {
        socket.emit("tracking:error", { message: error.message });
      }
    });
  });

  return io;
}

export function broadcastTripUpdate(io, tripId, payload) {
  io.to(`trip:${tripId}`).emit("tracking:update", payload);
  io.to("admin:fleet").emit("admin:fleet:update", payload);
}

export function broadcastTripEvent(io, tripId, event) {
  io.to(`trip:${tripId}`).emit("tracking:event", { tripId, event });
  io.to("admin:fleet").emit("admin:trip:event", { tripId, event });
}
