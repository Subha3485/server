import {
  bookings,
  buses,
  drivers,
  liveTripEvents,
  liveTripLocations,
  routes,
  tripAssignments,
  users
} from "../data.js";

const BOOKING_STATUSES = ["Booked", "Loaded", "In Transit", "Reached", "Delivered"];

export function sanitizeRoute(route) {
  return {
    id: route.id,
    name: route.name,
    code: route.code,
    baseFare: route.baseFare,
    perKmFare: route.perKmFare,
    stops: route.stops,
    slots: route.slots
  };
}

export function getRouteById(routeId) {
  return routes.find((route) => route.id === routeId);
}

export function getUserById(userId) {
  return users.find((user) => user.id === userId);
}

export function getDriverById(driverId) {
  return drivers.find((driver) => driver.id === driverId);
}

export function getDriverByPhone(phoneNumber) {
  return drivers.find((driver) => driver.phoneNumber === phoneNumber);
}

export function getBusById(busId) {
  return buses.find((bus) => bus.id === busId);
}

export function getTripById(tripId) {
  return tripAssignments.find((trip) => trip.id === tripId);
}

export function getTripForDriver(driverId) {
  return tripAssignments.find((trip) => trip.driverId === driverId);
}

export function getAllRoutes() {
  return routes.map(sanitizeRoute);
}

export function getAllBuses() {
  return buses;
}

export function getAllDrivers() {
  return drivers;
}

export function validateStopSequence(route, pickupStopId, dropStopId) {
  const pickupIndex = route.stops.findIndex((stop) => stop.id === pickupStopId);
  const dropIndex = route.stops.findIndex((stop) => stop.id === dropStopId);

  if (pickupIndex === -1 || dropIndex === -1) {
    throw createBadRequest("Pickup or drop stop does not exist on this route.");
  }

  if (dropIndex <= pickupIndex) {
    throw createBadRequest("Drop stop must come after pickup stop in the route sequence.");
  }

  return {
    pickupIndex,
    dropIndex,
    pickupStop: route.stops[pickupIndex],
    dropStop: route.stops[dropIndex]
  };
}

export function calculateFare({
  route,
  pickupStopId,
  dropStopId,
  weightKg,
  quantity,
  fragile,
  express
}) {
  const { pickupStop, dropStop } = validateStopSequence(route, pickupStopId, dropStopId);
  const distanceKm = dropStop.kmFromStart - pickupStop.kmFromStart;
  const distanceFare = route.baseFare + distanceKm * route.perKmFare;
  const weightCharge = Number(weightKg) * 8;
  const quantityCharge = (Number(quantity) - 1) * 24;
  const fragileCharge = fragile ? 40 : 0;
  const expressCharge = express ? 75 : 0;
  const total = Math.round(distanceFare + weightCharge + quantityCharge + fragileCharge + expressCharge);

  return {
    routeId: route.id,
    pickupStop,
    dropStop,
    distanceKm,
    breakdown: {
      baseFare: route.baseFare,
      distanceFare: Math.round(distanceKm * route.perKmFare),
      weightCharge,
      quantityCharge,
      fragileCharge,
      expressCharge
    },
    totalFare: total
  };
}

export function createBooking({
  userId,
  routeId,
  pickupStopId,
  dropStopId,
  slotId,
  packageType,
  weightKg,
  quantity,
  fragile,
  express,
  paymentMethod
}) {
  const user = getUserById(userId);
  if (!user) {
    throw createBadRequest("User does not exist.");
  }

  const route = getRouteById(routeId);
  if (!route) {
    throw createBadRequest("Route does not exist.");
  }

  const slot = route.slots.find((item) => item.id === slotId);
  if (!slot) {
    throw createBadRequest("Selected slot does not exist for this route.");
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

  const booking = {
    id: `BK-${String(bookings.length + 240302).padStart(6, "0")}`,
    userId,
    routeId,
    pickupStopId,
    dropStopId,
    slotId,
    packageType,
    weightKg: Number(weightKg),
    quantity: Number(quantity),
    fragile: Boolean(fragile),
    express: Boolean(express),
    fare: quote.totalFare,
    paymentMethod,
    status: "Booked",
    createdAt: new Date().toISOString(),
    tracking: [{ status: "Booked", time: new Date().toISOString() }]
  };

  bookings.unshift(booking);

  return serializeBooking(booking);
}

export function createRoute({ name, code, baseFare, perKmFare, stops = [], slots = [] }) {
  if (!name || !code) {
    throw createBadRequest("name and code are required.");
  }

  const route = {
    id: `route-${slugify(name)}-${routes.length + 1}`,
    name,
    code,
    baseFare: Number(baseFare ?? 0),
    perKmFare: Number(perKmFare ?? 0),
    stops: normalizeStops(stops),
    slots: normalizeSlots(slots)
  };

  routes.push(route);
  return sanitizeRoute(route);
}

export function createBus({ busNumber, capacityKg, routeId, status = "Idle" }) {
  if (!busNumber || !capacityKg) {
    throw createBadRequest("busNumber and capacityKg are required.");
  }

  if (routeId && !getRouteById(routeId)) {
    throw createBadRequest("routeId does not exist.");
  }

  const bus = {
    id: `bus-${String(buses.length + 1).padStart(3, "0")}`,
    busNumber,
    capacityKg: Number(capacityKg),
    routeId: routeId ?? null,
    status
  };

  buses.push(bus);
  return bus;
}

export function createDriver({ name, phoneNumber, badgeNumber, role = "Driver", status = "Available", rating = 5 }) {
  if (!name || !phoneNumber || !badgeNumber) {
    throw createBadRequest("name, phoneNumber and badgeNumber are required.");
  }

  const driver = {
    id: `driver-${String(drivers.length + 1).padStart(3, "0")}`,
    phoneNumber,
    name,
    badgeNumber,
    role,
    status,
    rating: Number(rating)
  };

  drivers.push(driver);
  return driver;
}

export function updateBookingStatus(bookingId, status) {
  const booking = bookings.find((item) => item.id === bookingId);
  if (!booking) {
    throw createBadRequest("Booking not found.");
  }

  booking.status = status;
  booking.tracking.unshift({ status, time: new Date().toISOString() });
  return serializeBooking(booking);
}

export function serializeBooking(booking) {
  const route = getRouteById(booking.routeId);
  const slot = route?.slots.find((item) => item.id === booking.slotId);
  const pickup = route?.stops.find((stop) => stop.id === booking.pickupStopId);
  const drop = route?.stops.find((stop) => stop.id === booking.dropStopId);

  return {
    ...booking,
    route: route ? { id: route.id, name: route.name, code: route.code } : null,
    slot,
    pickupStop: pickup,
    dropStop: drop,
    statusFlow: BOOKING_STATUSES
  };
}

export function getBookingsForUser(userId) {
  return bookings.filter((booking) => booking.userId === userId).map(serializeBooking);
}

export function getBookingById(bookingId) {
  const booking = bookings.find((item) => item.id === bookingId);
  return booking ? serializeBooking(booking) : null;
}

export function serializeTrip(trip) {
  const route = getRouteById(trip.routeId);
  const bus = getBusById(trip.busId);
  const driver = getDriverById(trip.driverId);
  const slot = route?.slots.find((item) => item.id === trip.slotId) ?? null;
  const currentStop = route?.stops.find((stop) => stop.id === trip.currentStopId) ?? null;
  const nextStop = route?.stops.find((stop) => stop.id === trip.nextStopId) ?? null;
  const location = liveTripLocations.get(trip.id) ?? null;
  const cargoBookings = trip.bookingIds
    .map((bookingId) => getBookingById(bookingId))
    .filter(Boolean);

  return {
    ...trip,
    route: route ? sanitizeRoute(route) : null,
    bus,
    driver,
    slot,
    currentStop,
    nextStop,
    liveLocation: location,
    cargoBookings,
    stopCount: route?.stops.length ?? 0
  };
}

export function createDriverSession(phoneNumber) {
  const driver = getDriverByPhone(phoneNumber);
  if (!driver) {
    throw createBadRequest("Driver not found.");
  }

  return {
    token: `driver-token-${driver.id}`,
    driver,
    assignment: getTripForDriver(driver.id) ? serializeTrip(getTripForDriver(driver.id)) : null
  };
}

export function getDriverAssignment(driverId) {
  const trip = getTripForDriver(driverId);
  if (!trip) {
    throw createBadRequest("No trip assignment available.");
  }

  return serializeTrip(trip);
}

export function getTripTracking(tripId) {
  const trip = getTripById(tripId);
  if (!trip) {
    throw createBadRequest("Trip not found.");
  }

  const serializedTrip = serializeTrip(trip);
  return {
    tripId: serializedTrip.id,
    status: serializedTrip.status,
    currentStop: serializedTrip.currentStop,
    nextStop: serializedTrip.nextStop,
    route: serializedTrip.route,
    bus: serializedTrip.bus,
    liveLocation: serializedTrip.liveLocation,
    events: liveTripEvents.get(tripId) ?? []
  };
}

export function updateTripStatus(tripId, status) {
  const trip = getTripById(tripId);
  if (!trip) {
    throw createBadRequest("Trip not found.");
  }

  trip.status = status;
  appendTripEvent(tripId, {
    type: "trip.status",
    message: `Trip marked as ${status}`,
    time: new Date().toISOString()
  });

  return serializeTrip(trip);
}

export function updateTripLocation({
  tripId,
  driverId,
  lat,
  lng,
  speed = 0,
  heading = 0,
  label = "On route"
}) {
  const trip = getTripById(tripId);
  if (!trip) {
    throw createBadRequest("Trip not found.");
  }

  if (trip.driverId !== driverId) {
    throw createBadRequest("Driver is not assigned to this trip.");
  }

  const payload = {
    tripId,
    driverId,
    lat: Number(lat),
    lng: Number(lng),
    speed: Number(speed),
    heading: Number(heading),
    label,
    updatedAt: new Date().toISOString()
  };

  liveTripLocations.set(tripId, payload);
  return payload;
}

export function updateTripStop({ tripId, currentStopId, nextStopId, message }) {
  const trip = getTripById(tripId);
  if (!trip) {
    throw createBadRequest("Trip not found.");
  }

  trip.currentStopId = currentStopId ?? trip.currentStopId;
  trip.nextStopId = nextStopId ?? trip.nextStopId;

  appendTripEvent(tripId, {
    type: "stop.update",
    message: message ?? "Trip stop update received",
    time: new Date().toISOString()
  });

  return serializeTrip(trip);
}

export function appendTripEvent(tripId, event) {
  const existing = liveTripEvents.get(tripId) ?? [];
  existing.unshift(event);
  liveTripEvents.set(tripId, existing.slice(0, 20));
}

export function getAdminSummary() {
  const activeTrips = tripAssignments.filter((trip) => trip.status === "Active").length;
  const activeBookings = bookings.filter((booking) => booking.status !== "Delivered").length;
  const revenue = bookings.reduce((sum, booking) => sum + booking.fare, 0);

  return {
    totals: {
      routes: routes.length,
      buses: buses.length,
      drivers: drivers.length,
      bookings: bookings.length,
      activeTrips,
      revenue
    },
    activeTrips: tripAssignments.map(serializeTrip),
    routes: routes.map(sanitizeRoute),
    buses,
    drivers,
    recentBookings: bookings.slice(0, 6).map(serializeBooking),
    fleetStatus: {
      assigned: buses.filter((bus) => bus.status === "Assigned").length,
      idle: buses.filter((bus) => bus.status === "Idle").length,
      activeBookings
    }
  };
}

function normalizeStops(stops) {
  return (stops ?? [])
    .filter((stop) => stop?.name)
    .map((stop, index) => ({
      id: stop.id ?? `${slugify(stop.name)}-${index + 1}`,
      name: stop.name,
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

export function createBadRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
