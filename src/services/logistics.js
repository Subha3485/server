import { getCollections } from "../db.js";

const BOOKING_STATUSES = ["booked", "loaded", "in_transit", "reached", "delivered"];

export async function sanitizeRoute(route) {
  const stops = await getStopsForRoute(route._id);
  return {
    id: route._id,
    name: route.routeName,
    code: route.code ?? route._id,
    baseFare: route.basePrice,
    perKmFare: route.perKmFare ?? 0,
    startLocation: route.startLocation,
    endLocation: route.endLocation,
    distance: route.distance,
    stops: stops.map(serializeStop),
    slots: route.slots ?? []
  };
}

export async function getRouteById(routeId) {
  const { routes } = await getCollections();
  return routes.findOne({ _id: routeId }, { projection: { _id: 1, routeName: 1, code: 1, basePrice: 1, perKmFare: 1, startLocation: 1, endLocation: 1, distance: 1, stopIds: 1, slots: 1 } });
}

export async function getUserById(userId) {
  const { users } = await getCollections();
  const user = await users.findOne({ _id: userId });
  return user ? serializeUser(user) : null;
}

export async function getUserByPhone(phone) {
  const { users } = await getCollections();
  const user = await users.findOne({ phone });
  return user ? serializeUser(user) : null;
}

export async function getDriverById(driverId) {
  const { users } = await getCollections();
  const driver = await users.findOne({ _id: driverId, role: "driver" });
  return driver ? serializeUser(driver) : null;
}

export async function getDriverByPhone(phone) {
  const { users } = await getCollections();
  const driver = await users.findOne({ phone, role: "driver" });
  return driver ? serializeUser(driver) : null;
}

export async function getBusById(busId) {
  const { buses } = await getCollections();
  const bus = await buses.findOne({ _id: busId });
  return bus ? serializeBus(bus) : null;
}

export async function getTripById(busId) {
  const { buses } = await getCollections();
  const bus = await buses.findOne({ _id: busId });
  return bus && bus.status === "running" ? bus : null;
}

export async function getTripForDriver(driverId) {
  const { buses } = await getCollections();
  return buses.findOne(
    { driverId, status: { $in: ["running", "idle"] } },
    { sort: { startedAt: -1, _id: 1 } }
  );
}

export async function getAllRoutes() {
  const { routes } = await getCollections();
  const docs = await routes.find({}, { projection: { _id: 1, routeName: 1, code: 1, basePrice: 1, perKmFare: 1, startLocation: 1, endLocation: 1, distance: 1, stopIds: 1, slots: 1 } }).toArray();
  return Promise.all(docs.map(sanitizeRoute));
}

export async function getAllBuses() {
  const { buses } = await getCollections();
  const docs = await buses.find({}).toArray();
  return docs.map(serializeBus);
}

export async function getAllDrivers() {
  const { users } = await getCollections();
  const docs = await users.find({ role: "driver" }).toArray();
  return docs.map(serializeUser);
}

export function validateStopSequence(routeStops, pickupStopId, dropStopId) {
  const pickupIndex = routeStops.findIndex((stop) => stop._id === pickupStopId);
  const dropIndex = routeStops.findIndex((stop) => stop._id === dropStopId);

  if (pickupIndex === -1 || dropIndex === -1) {
    throw createBadRequest("Pickup or drop stop does not exist on this route.");
  }

  if (dropIndex <= pickupIndex) {
    throw createBadRequest("Drop stop must come after pickup stop in the route sequence.");
  }

  return {
    pickupIndex,
    dropIndex,
    pickupStop: routeStops[pickupIndex],
    dropStop: routeStops[dropIndex]
  };
}

export async function calculateFare({
  route,
  pickupStopId,
  dropStopId,
  weightKg,
  quantity,
  fragile,
  express
}) {
  const routeStops = await getStopsForRoute(route._id);
  const { pickupStop, dropStop } = validateStopSequence(routeStops, pickupStopId, dropStopId);
  const distanceKm = dropStop.kmFromStart - pickupStop.kmFromStart;
  const distanceFare = route.basePrice + distanceKm * (route.perKmFare ?? 0);
  const weightCharge = Number(weightKg) * 8;
  const quantityCharge = (Number(quantity) - 1) * 24;
  const fragileCharge = fragile ? 40 : 0;
  const expressCharge = express ? 75 : 0;
  const totalFare = Math.round(distanceFare + weightCharge + quantityCharge + fragileCharge + expressCharge);

  return {
    routeId: route._id,
    pickupStop: serializeStop(pickupStop),
    dropStop: serializeStop(dropStop),
    distanceKm,
    breakdown: {
      baseFare: route.basePrice,
      distanceFare: Math.round(distanceKm * (route.perKmFare ?? 0)),
      weightCharge,
      quantityCharge,
      fragileCharge,
      expressCharge
    },
    totalFare
  };
}

export async function createBooking({
  userId,
  busId,
  routeId,
  pickupStopId,
  dropStopId,
  weightKg,
  quantity,
  fragile,
  express,
  paymentMethod,
  packageType,
  slotId
}) {
  const { bookings, buses, payments } = await getCollections();
  const [user, route] = await Promise.all([getUserById(userId), getRouteById(routeId)]);
  if (!user) {
    throw createBadRequest("User does not exist.");
  }
  if (!route) {
    throw createBadRequest("Route does not exist.");
  }

  const resolvedBusId = busId ?? (await resolveBusForRoute(routeId, slotId));
  const bus = resolvedBusId ? await getBusById(resolvedBusId) : null;
  if (!bus) {
    throw createBadRequest("Bus is not available for this booking.");
  }

  const quote = await calculateFare({
    route,
    pickupStopId,
    dropStopId,
    weightKg,
    quantity,
    fragile,
    express
  });

  const bookingId = await createSequenceId(bookings, "booking-", 240302);
  const paymentId = await createSequenceId(payments, "payment-", 240302);
  const timestamp = new Date().toISOString();

  const booking = {
    _id: bookingId,
    userId,
    busId: bus.id,
    routeId,
    pickupStopId,
    dropStopId,
    weight: Number(weightKg),
    quantity: Number(quantity),
    price: quote.totalFare,
    packageType: packageType ?? "Cargo",
    fragile: Boolean(fragile),
    express: Boolean(express),
    paymentMethod: paymentMethod ?? "UPI",
    slotId: slotId ?? null,
    status: "booked",
    createdAt: timestamp,
    tracking: [{ status: "booked", message: "Booking created", time: timestamp }]
  };

  await bookings.insertOne(booking);
  await payments.insertOne({
    _id: paymentId,
    bookingId,
    userId,
    amount: booking.price,
    method: booking.paymentMethod,
    status: "success",
    transactionId: `TXN-${paymentId}`,
    createdAt: timestamp
  });

  await buses.updateOne(
    { _id: bus.id },
    { $set: { capacityAvailable: Math.max(0, (bus.capacityTotal ?? 0) - booking.weight) } }
  );

  return serializeBooking(booking);
}

export async function createRoute({ name, code, baseFare, perKmFare, stops = [], slots = [] }) {
  const { routes, stops: stopCollection } = await getCollections();
  if (!name || !code) {
    throw createBadRequest("name and code are required.");
  }

  const routeId = `route-${slugify(name)}-${Date.now()}`;
  const normalizedStops = normalizeStops(routeId, stops);
  const route = {
    _id: routeId,
    routeName: name,
    startLocation: normalizedStops[0]?.name ?? "Unknown",
    endLocation: normalizedStops.at(-1)?.name ?? "Unknown",
    stopIds: normalizedStops.map((stop) => stop._id),
    distance: normalizedStops.at(-1)?.kmFromStart ?? 0,
    basePrice: Number(baseFare ?? 0),
    perKmFare: Number(perKmFare ?? 0),
    code,
    slots: normalizeSlots(slots)
  };

  await routes.insertOne(route);
  if (normalizedStops.length > 0) {
    await stopCollection.insertMany(normalizedStops);
  }

  return sanitizeRoute(route);
}

export async function createBus({ busNumber, capacityKg, routeId, driverId, status = "idle" }) {
  const { buses } = await getCollections();
  if (!busNumber || !capacityKg) {
    throw createBadRequest("busNumber and capacityKg are required.");
  }

  if (routeId && !(await getRouteById(routeId))) {
    throw createBadRequest("routeId does not exist.");
  }

  if (driverId && !(await getDriverById(driverId))) {
    throw createBadRequest("driverId does not exist.");
  }

  const bus = {
    _id: await createSequenceId(buses, "bus-", 3, 3),
    busNumber,
    driverId: driverId ?? null,
    capacityTotal: Number(capacityKg),
    capacityAvailable: Number(capacityKg),
    routeId: routeId ?? null,
    currentLocation: null,
    status,
    currentStopId: null,
    nextStopId: null,
    startedAt: null,
    completedAt: null
  };

  await buses.insertOne(bus);
  return serializeBus(bus);
}

export async function createDriver({ name, phoneNumber, badgeNumber, role = "driver", status = "Available", rating = 5, email = "" }) {
  const { users } = await getCollections();
  if (!name || !phoneNumber || !badgeNumber) {
    throw createBadRequest("name, phoneNumber and badgeNumber are required.");
  }

  const driver = {
    _id: await createSequenceId(users, "driver-", 3, 3, { role: "driver" }),
    name,
    phone: phoneNumber,
    email,
    role,
    rating: Number(rating),
    createdAt: new Date().toISOString(),
    badgeNumber,
    status
  };

  await users.insertOne(driver);
  return serializeUser(driver);
}

export async function updateBookingStatus(bookingId, status) {
  const { bookings } = await getCollections();
  const normalizedStatus = normalizeBookingStatus(status);
  const booking = await bookings.findOne({ _id: bookingId });
  if (!booking) {
    throw createBadRequest("Booking not found.");
  }

  booking.status = normalizedStatus;
  booking.tracking = [
    { status: normalizedStatus, message: `Booking marked as ${normalizedStatus}`, time: new Date().toISOString() },
    ...(booking.tracking ?? [])
  ];

  await bookings.updateOne(
    { _id: bookingId },
    { $set: { status: booking.status, tracking: booking.tracking } }
  );

  return serializeBooking(booking);
}

export async function serializeBooking(booking) {
  const [route, pickupStop, dropStop, bus, payment] = await Promise.all([
    getRouteById(booking.routeId),
    getStopById(booking.pickupStopId),
    getStopById(booking.dropStopId),
    getBusById(booking.busId),
    getPaymentByBookingId(booking._id)
  ]);

  const slot = route?.slots?.find((item) => item.id === booking.slotId) ?? null;

  return {
    id: booking._id,
    userId: booking.userId,
    busId: booking.busId,
    routeId: booking.routeId,
    pickupStopId: booking.pickupStopId,
    dropStopId: booking.dropStopId,
    packageType: booking.packageType ?? "Cargo",
    weightKg: booking.weight,
    quantity: booking.quantity ?? 1,
    fragile: Boolean(booking.fragile),
    express: Boolean(booking.express),
    fare: booking.price,
    paymentMethod: booking.paymentMethod ?? payment?.method ?? "UPI",
    status: apiBookingStatus(booking.status),
    statusFlow: BOOKING_STATUSES.map(apiBookingStatus),
    createdAt: booking.createdAt,
    tracking: (booking.tracking ?? []).map((entry) => ({
      status: apiBookingStatus(entry.status),
      time: entry.time,
      message: entry.message
    })),
    route: route ? { id: route._id, name: route.routeName, code: route.code } : null,
    slot,
    pickupStop: pickupStop ? serializeStop(pickupStop) : null,
    dropStop: dropStop ? serializeStop(dropStop) : null,
    bus,
    payment
  };
}

export async function getBookingsForUser(userId) {
  const { bookings } = await getCollections();
  const docs = await bookings.find({ userId }).sort({ createdAt: -1 }).toArray();
  return Promise.all(docs.map((booking) => serializeBooking(booking)));
}

export async function getBookingById(bookingId) {
  const { bookings } = await getCollections();
  const booking = await bookings.findOne({ _id: bookingId });
  return booking ? serializeBooking(booking) : null;
}

export async function serializeTrip(busDoc) {
  const bus = serializeBus(busDoc);
  const [route, driver, currentStop, nextStop, liveLocation, cargoBookings] = await Promise.all([
    getRouteById(bus.routeId),
    getDriverById(bus.driverId),
    bus.currentStopId ? getStopById(bus.currentStopId) : null,
    bus.nextStopId ? getStopById(bus.nextStopId) : null,
    getLiveLocationByBusId(bus.id),
    getBookingsForBus(bus.id)
  ]);

  const hydratedRoute = route ? await sanitizeRoute(route) : null;
  const slot = route?.slots?.find((item) => item.busNumber === bus.busNumber) ?? route?.slots?.[0] ?? null;

  return {
    id: bus.id,
    status: bus.status === "running" ? "Active" : bus.status === "completed" ? "Completed" : "Assigned",
    route: hydratedRoute,
    bus,
    driver,
    slot,
    currentStop: currentStop ? serializeStop(currentStop) : null,
    nextStop: nextStop ? serializeStop(nextStop) : null,
    liveLocation,
    cargoBookings,
    stopCount: hydratedRoute?.stops.length ?? 0,
    startedAt: busDoc.startedAt ?? null
  };
}

export async function getDriverAssignment(driverId) {
  const bus = await getTripForDriver(driverId);
  if (!bus) {
    throw createBadRequest("No trip assignment available.");
  }
  return serializeTrip(bus);
}

export async function getTripTracking(busId) {
  const bus = await getTripById(busId);
  if (!bus) {
    throw createBadRequest("Trip not found.");
  }

  const [serializedTrip, cargoBookings] = await Promise.all([
    serializeTrip(bus),
    getBookingsForBus(busId)
  ]);

  const events = cargoBookings
    .flatMap((booking) => booking.tracking ?? [])
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 20);

  return {
    tripId: serializedTrip.id,
    status: serializedTrip.status,
    currentStop: serializedTrip.currentStop,
    nextStop: serializedTrip.nextStop,
    route: serializedTrip.route,
    bus: serializedTrip.bus,
    liveLocation: serializedTrip.liveLocation,
    events
  };
}

export async function updateTripStatus(busId, status) {
  const { buses } = await getCollections();
  const bus = await buses.findOne({ _id: busId });
  if (!bus) {
    throw createBadRequest("Trip not found.");
  }

  const mappedStatus = normalizeBusStatus(status);
  await buses.updateOne(
    { _id: busId },
    {
      $set: {
        status: mappedStatus,
        completedAt: mappedStatus === "completed" ? new Date().toISOString() : null,
        startedAt: mappedStatus === "running" ? bus.startedAt ?? new Date().toISOString() : bus.startedAt ?? null
      }
    }
  );

  await appendTripEvent(busId, {
    status: mappedStatus === "running" ? "in_transit" : mappedStatus === "completed" ? "delivered" : "booked",
    message: `Bus status changed to ${mappedStatus}`,
    time: new Date().toISOString()
  });

  return serializeTrip({ ...bus, _id: busId, status: mappedStatus });
}

export async function updateTripLocation({
  tripId,
  driverId,
  lat,
  lng,
  speed = 0,
  heading = 0,
  label = "On route"
}) {
  const { liveLocations, buses } = await getCollections();
  const bus = await buses.findOne({ _id: tripId });
  if (!bus) {
    throw createBadRequest("Trip not found.");
  }

  if (bus.driverId !== driverId) {
    throw createBadRequest("Driver is not assigned to this trip.");
  }

  const payload = {
    _id: `live-${tripId}`,
    busId: tripId,
    lat: Number(lat),
    lng: Number(lng),
    speed: Number(speed),
    heading: Number(heading),
    label,
    updatedAt: new Date().toISOString()
  };

  await liveLocations.updateOne({ busId: tripId }, { $set: payload }, { upsert: true });
  await buses.updateOne(
    { _id: tripId },
    {
      $set: {
        currentLocation: { lat: payload.lat, lng: payload.lng }
      }
    }
  );

  return {
    tripId,
    driverId,
    lat: payload.lat,
    lng: payload.lng,
    speed: payload.speed,
    heading: payload.heading,
    label: payload.label,
    updatedAt: payload.updatedAt
  };
}

export async function updateTripStop({ tripId, currentStopId, nextStopId, message }) {
  const { buses } = await getCollections();
  const bus = await buses.findOne({ _id: tripId });
  if (!bus) {
    throw createBadRequest("Trip not found.");
  }

  await buses.updateOne(
    { _id: tripId },
    {
      $set: {
        currentStopId: currentStopId ?? bus.currentStopId,
        nextStopId: nextStopId ?? bus.nextStopId
      }
    }
  );

  await appendTripEvent(tripId, {
    status: "in_transit",
    message: message ?? "Trip stop update received",
    time: new Date().toISOString()
  });

  return serializeTrip({
    ...bus,
    _id: tripId,
    currentStopId: currentStopId ?? bus.currentStopId,
    nextStopId: nextStopId ?? bus.nextStopId
  });
}

export async function appendTripEvent(busId, event) {
  const { bookings } = await getCollections();
  const busBookings = await bookings.find({ busId }, { projection: { _id: 1, tracking: 1 } }).toArray();

  await Promise.all(
    busBookings.map((booking) =>
      bookings.updateOne(
        { _id: booking._id },
        {
          $set: {
            tracking: [event, ...(booking.tracking ?? [])].slice(0, 20)
          }
        }
      )
    )
  );
}

export async function getAdminSummary() {
  const [routes, buses, drivers, bookings] = await Promise.all([
    getAllRoutes(),
    getAllBuses(),
    getAllDrivers(),
    getAllBookings()
  ]);

  const activeTrips = buses.filter((bus) => bus.status === "Assigned");
  const activeBookings = bookings.filter((booking) => booking.status !== "Delivered").length;
  const revenue = bookings.reduce((sum, booking) => sum + booking.fare, 0);

  return {
    totals: {
      routes: routes.length,
      buses: buses.length,
      drivers: drivers.length,
      bookings: bookings.length,
      activeTrips: activeTrips.length,
      revenue
    },
    activeTrips: await Promise.all(activeTrips.map((bus) => serializeTrip(deserializeBus(bus)))),
    routes,
    buses,
    drivers,
    recentBookings: bookings.slice(0, 6),
    fleetStatus: {
      assigned: buses.filter((bus) => ["running", "idle"].includes(bus.status.toLowerCase())).length,
      idle: buses.filter((bus) => bus.status.toLowerCase() === "idle").length,
      activeBookings
    }
  };
}

export function createBadRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function getAllBookings() {
  const { bookings } = await getCollections();
  const docs = await bookings.find({}).sort({ createdAt: -1 }).toArray();
  return Promise.all(docs.map((booking) => serializeBooking(booking)));
}

async function getBookingsForBus(busId) {
  const { bookings } = await getCollections();
  const docs = await bookings.find({ busId }).sort({ createdAt: -1 }).toArray();
  return Promise.all(docs.map((booking) => serializeBooking(booking)));
}

async function getStopsForRoute(routeId) {
  const { stops } = await getCollections();
  return stops.find({ routeId }).sort({ order: 1 }).toArray();
}

async function getStopById(stopId) {
  const { stops } = await getCollections();
  return stops.findOne({ _id: stopId });
}

async function getLiveLocationByBusId(busId) {
  const { liveLocations } = await getCollections();
  const doc = await liveLocations.findOne({ busId }, { projection: { _id: 0 } });
  return doc
    ? {
        tripId: busId,
        lat: doc.lat,
        lng: doc.lng,
        speed: doc.speed ?? 0,
        heading: doc.heading ?? 0,
        label: doc.label ?? "On route",
        updatedAt: doc.updatedAt
      }
    : null;
}

async function getPaymentByBookingId(bookingId) {
  const { payments } = await getCollections();
  return payments.findOne({ bookingId }, { projection: { _id: 0 } });
}

async function resolveBusForRoute(routeId, slotId) {
  const { buses } = await getCollections();
  const query = { routeId };
  if (slotId) {
    const bus = await buses.findOne({ routeId, status: { $in: ["running", "idle"] } }, { projection: { _id: 1 }, sort: { status: 1 } });
    return bus?._id ?? null;
  }

  const bus = await buses.findOne(query, { projection: { _id: 1 }, sort: { status: 1 } });
  return bus?._id ?? null;
}

function normalizeStops(routeId, stops) {
  return (stops ?? [])
    .filter((stop) => stop?.name)
    .map((stop, index) => ({
      _id: stop.id ?? `stop-${slugify(stop.name)}-${Date.now()}-${index + 1}`,
      name: stop.name,
      location: stop.location ?? { lat: 0, lng: 0 },
      order: index + 1,
      routeId,
      kmFromStart: Number(stop.kmFromStart ?? index * 20),
      region: stop.region ?? "Unknown"
    }));
}

function normalizeSlots(slots) {
  return (slots ?? [])
    .filter((slot) => slot?.time)
    .map((slot, index) => ({
      id: slot.id ?? `slot-${String(index + 1).padStart(4, "0")}`,
      time: slot.time,
      arrival: slot.arrival ?? slot.time,
      capacityUsed: Number(slot.capacityUsed ?? 0),
      busNumber: slot.busNumber ?? "Pending"
    }));
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function serializeUser(user) {
  return {
    id: user._id ?? user.id,
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

function serializeBus(bus) {
  return {
    id: bus._id ?? bus.id,
    busNumber: bus.busNumber,
    driverId: bus.driverId ?? null,
    capacityKg: bus.capacityTotal,
    capacityTotal: bus.capacityTotal,
    capacityAvailable: bus.capacityAvailable,
    routeId: bus.routeId ?? null,
    currentLocation: bus.currentLocation ?? null,
    status: apiBusStatus(bus.status),
    currentStopId: bus.currentStopId ?? null,
    nextStopId: bus.nextStopId ?? null,
    startedAt: bus.startedAt ?? null,
    completedAt: bus.completedAt ?? null
  };
}

function deserializeBus(bus) {
  return {
    _id: bus.id,
    busNumber: bus.busNumber,
    driverId: bus.driverId,
    capacityTotal: bus.capacityTotal ?? bus.capacityKg,
    capacityAvailable: bus.capacityAvailable,
    routeId: bus.routeId,
    currentLocation: bus.currentLocation,
    status: normalizeBusStatus(bus.status),
    currentStopId: bus.currentStopId,
    nextStopId: bus.nextStopId,
    startedAt: bus.startedAt,
    completedAt: bus.completedAt
  };
}

function serializeStop(stop) {
  return {
    id: stop._id ?? stop.id,
    name: stop.name,
    kmFromStart: stop.kmFromStart ?? 0,
    region: stop.region ?? "Unknown",
    location: stop.location ?? null,
    order: stop.order ?? null,
    routeId: stop.routeId ?? null
  };
}

function normalizeBookingStatus(status) {
  const value = String(status ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!BOOKING_STATUSES.includes(value)) {
    throw createBadRequest("Unsupported booking status.");
  }
  return value;
}

function normalizeBusStatus(status) {
  const value = String(status ?? "").trim().toLowerCase();
  if (["assigned", "active", "running"].includes(value)) {
    return "running";
  }
  if (["idle", "available"].includes(value)) {
    return "idle";
  }
  if (["completed", "delivered"].includes(value)) {
    return "completed";
  }
  throw createBadRequest("Unsupported bus status.");
}

function apiBookingStatus(status) {
  return String(status)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function apiBusStatus(status) {
  if (status === "running") return "Assigned";
  if (status === "completed") return "Completed";
  return "Idle";
}

async function createSequenceId(collection, prefix, base, padLength = 6, extraFilter = {}) {
  const latest = await collection
    .find({ _id: { $regex: `^${prefix}` }, ...extraFilter }, { projection: { _id: 1 } })
    .sort({ _id: -1 })
    .limit(1)
    .toArray();

  const currentValue = latest[0]?._id?.replace(prefix, "");
  const numeric = Number.parseInt(currentValue ?? `${base - 1}`, 10);
  return `${prefix}${String(Number.isNaN(numeric) ? base : numeric + 1).padStart(padLength, "0")}`;
}
