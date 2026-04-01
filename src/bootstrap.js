import {
  seedBookings,
  seedBuses,
  seedLiveLocations,
  seedPayments,
  seedReviews,
  seedRoutes,
  seedStops,
  seedSubscriptions,
  seedUsers,
  seedWarehouses
} from "./data.js";
import { getCollections } from "./db.js";

export async function initializeDatabase() {
  const collections = await getCollections();

  await Promise.all([
    ensureSeeded(collections.users, seedUsers),
    ensureSeeded(collections.routes, seedRoutes),
    ensureSeeded(collections.stops, seedStops),
    ensureSeeded(collections.buses, seedBuses),
    ensureSeeded(collections.bookings, seedBookings),
    ensureSeeded(collections.payments, seedPayments),
    ensureSeeded(collections.reviews, seedReviews),
    ensureSeeded(collections.liveLocations, seedLiveLocations),
    ensureSeeded(collections.warehouses, seedWarehouses),
    ensureSeeded(collections.subscriptions, seedSubscriptions)
  ]);

  await Promise.all([
    collections.users.createIndex({ phone: 1 }, { unique: true }),
    collections.users.createIndex({ role: 1 }),
    collections.routes.createIndex({ routeName: 1 }),
    collections.stops.createIndex({ routeId: 1, order: 1 }),
    collections.buses.createIndex({ driverId: 1 }),
    collections.buses.createIndex({ routeId: 1 }),
    collections.bookings.createIndex({ userId: 1, createdAt: -1 }),
    collections.bookings.createIndex({ busId: 1, status: 1 }),
    collections.payments.createIndex({ bookingId: 1 }, { unique: true }),
    collections.reviews.createIndex({ bookingId: 1 }),
    collections.liveLocations.createIndex({ busId: 1 }, { unique: true }),
    collections.warehouses.createIndex({ stopId: 1 }, { unique: true }),
    collections.subscriptions.createIndex({ userId: 1, routeId: 1 }),
    collections.otpSessions.createIndex({ phone: 1, role: 1, createdAt: -1 }),
    collections.otpSessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    collections.authSessions.createIndex({ userId: 1, revokedAt: 1 }),
    collections.authSessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  ]);
}

async function ensureSeeded(collection, docs) {
  const existingCount = await collection.countDocuments();
  if (existingCount > 0 || docs.length === 0) {
    return;
  }

  await collection.insertMany(docs);
}
