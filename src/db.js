import { MongoClient } from "mongodb";
import { config } from "./config.js";

let clientPromise;

function createClient() {
  if (!config.mongodbUri) {
    throw new Error("MONGODB_URI is required.");
  }

  return new MongoClient(config.mongodbUri, {
    serverSelectionTimeoutMS: 10000
  });
}

export async function getDb() {
  if (!clientPromise) {
    const client = createClient();
    clientPromise = client.connect();
  }

  const client = await clientPromise;
  return client.db(config.mongodbDbName);
}

export async function getCollections() {
  const db = await getDb();
  return {
    users: db.collection("users"),
    buses: db.collection("buses"),
    routes: db.collection("routes"),
    stops: db.collection("stops"),
    bookings: db.collection("bookings"),
    payments: db.collection("payments"),
    reviews: db.collection("reviews"),
    liveLocations: db.collection("live_locations"),
    warehouses: db.collection("warehouses"),
    subscriptions: db.collection("subscriptions"),
    otpSessions: db.collection("otp_sessions"),
    authSessions: db.collection("auth_sessions")
  };
}
