const routeKolkataHaldiaStops = [
  {
    _id: "stop-dankuni",
    name: "Dankuni",
    location: { lat: 22.679, lng: 88.287 },
    order: 1,
    routeId: "route-kolkata-haldia",
    kmFromStart: 0,
    region: "Hooghly"
  },
  {
    _id: "stop-kolkata-gate",
    name: "Kolkata Gate",
    location: { lat: 22.5726, lng: 88.3639 },
    order: 2,
    routeId: "route-kolkata-haldia",
    kmFromStart: 22,
    region: "Kolkata"
  },
  {
    _id: "stop-uluberia",
    name: "Uluberia",
    location: { lat: 22.4703, lng: 88.1148 },
    order: 3,
    routeId: "route-kolkata-haldia",
    kmFromStart: 48,
    region: "Howrah"
  },
  {
    _id: "stop-bagnan",
    name: "Bagnan",
    location: { lat: 22.4698, lng: 87.9711 },
    order: 4,
    routeId: "route-kolkata-haldia",
    kmFromStart: 67,
    region: "Howrah"
  },
  {
    _id: "stop-kolaghat",
    name: "Kolaghat",
    location: { lat: 22.4301, lng: 87.8592 },
    order: 5,
    routeId: "route-kolkata-haldia",
    kmFromStart: 94,
    region: "Purba Medinipur"
  },
  {
    _id: "stop-mecheda",
    name: "Mecheda",
    location: { lat: 22.4219, lng: 87.7533 },
    order: 6,
    routeId: "route-kolkata-haldia",
    kmFromStart: 108,
    region: "Purba Medinipur"
  },
  {
    _id: "stop-tamluk",
    name: "Tamluk",
    location: { lat: 22.2963, lng: 87.9217 },
    order: 7,
    routeId: "route-kolkata-haldia",
    kmFromStart: 128,
    region: "Purba Medinipur"
  },
  {
    _id: "stop-nandakumar",
    name: "Nandakumar",
    location: { lat: 22.1626, lng: 87.9984 },
    order: 8,
    routeId: "route-kolkata-haldia",
    kmFromStart: 146,
    region: "Purba Medinipur"
  },
  {
    _id: "stop-durgachak",
    name: "Durgachak",
    location: { lat: 22.0502, lng: 88.0584 },
    order: 9,
    routeId: "route-kolkata-haldia",
    kmFromStart: 171,
    region: "Haldia"
  },
  {
    _id: "stop-haldia-depot",
    name: "Haldia Depot",
    location: { lat: 22.0667, lng: 88.0698 },
    order: 10,
    routeId: "route-kolkata-haldia",
    kmFromStart: 184,
    region: "Haldia"
  }
];

const routeHowrahDighaStops = [
  {
    _id: "stop-howrah-terminus",
    name: "Howrah Terminus",
    location: { lat: 22.5958, lng: 88.2636 },
    order: 1,
    routeId: "route-howrah-digha",
    kmFromStart: 0,
    region: "Howrah"
  },
  {
    _id: "stop-santragachi",
    name: "Santragachi",
    location: { lat: 22.5839, lng: 88.2843 },
    order: 2,
    routeId: "route-howrah-digha",
    kmFromStart: 11,
    region: "Howrah"
  },
  {
    _id: "stop-uluberia-digha",
    name: "Uluberia",
    location: { lat: 22.4703, lng: 88.1148 },
    order: 3,
    routeId: "route-howrah-digha",
    kmFromStart: 36,
    region: "Howrah"
  },
  {
    _id: "stop-kolaghat-digha",
    name: "Kolaghat",
    location: { lat: 22.4301, lng: 87.8592 },
    order: 4,
    routeId: "route-howrah-digha",
    kmFromStart: 82,
    region: "Purba Medinipur"
  },
  {
    _id: "stop-nandakumar-digha",
    name: "Nandakumar",
    location: { lat: 22.1626, lng: 87.9984 },
    order: 5,
    routeId: "route-howrah-digha",
    kmFromStart: 131,
    region: "Purba Medinipur"
  },
  {
    _id: "stop-contai",
    name: "Contai",
    location: { lat: 21.7789, lng: 87.7483 },
    order: 6,
    routeId: "route-howrah-digha",
    kmFromStart: 187,
    region: "Purba Medinipur"
  },
  {
    _id: "stop-digha",
    name: "Digha",
    location: { lat: 21.6237, lng: 87.5076 },
    order: 7,
    routeId: "route-howrah-digha",
    kmFromStart: 226,
    region: "East Midnapore"
  }
];

export const seedUsers = [
  {
    _id: "user-001",
    name: "Subhadeep Samanta",
    phone: "9831047286",
    email: "subhadeep@buslogistics.dev",
    role: "customer",
    rating: 4.9,
    createdAt: "2026-03-15T09:30:00.000Z",
    usage: "Business",
    language: "English",
    walletBalance: 3240,
    gstNumber: "19AABCU9603R1ZX",
    savedRouteIds: ["route-kolkata-haldia"],
    savedStopIds: ["stop-kolaghat", "stop-haldia-depot"]
  },
  {
    _id: "driver-001",
    name: "Mansur ali Saha",
    phone: "9174558326",
    email: "saha.ops@buslogistics.dev",
    role: "driver",
    rating: 4.9,
    createdAt: "2026-03-14T08:00:00.000Z",
    badgeNumber: "DRV-1208",
    status: "Assigned"
  },
  {
    _id: "driver-002",
    name: "Sannyasi Mondal",
    phone: "9163892745",
    email: "mondal.ops@buslogistics.dev",
    role: "driver",
    rating: 4.7,
    createdAt: "2026-03-16T10:00:00.000Z",
    badgeNumber: "DRV-2084",
    status: "Available"
  },
  {
    _id: "admin-001",
    name: "Control Room Admin",
    phone: "9142217836",
    email: "control.admin@buslogistics.dev",
    role: "admin",
    rating: 5,
    createdAt: "2026-03-10T07:00:00.000Z"
  }
];

export const seedRoutes = [
  {
    _id: "route-kolkata-haldia",
    routeName: "Kolkata to Haldia",
    startLocation: "Kolkata Gate",
    endLocation: "Haldia Depot",
    stopIds: routeKolkataHaldiaStops.map((stop) => stop._id),
    distance: 184,
    basePrice: 85,
    perKmFare: 5.2,
    code: "WB-116 Cargo Line",
    slots: [
      { id: "slot-1030", time: "10:30 AM", arrival: "1:10 PM", capacityUsed: 42, busNumber: "WB-19B-2451" },
      { id: "slot-1200", time: "12:00 PM", arrival: "2:45 PM", capacityUsed: 68, busNumber: "WB-19B-3158" },
      { id: "slot-1545", time: "3:45 PM", arrival: "6:20 PM", capacityUsed: 93, busNumber: "WB-19B-4412" }
    ]
  },
  {
    _id: "route-howrah-digha",
    routeName: "Howrah to Digha",
    startLocation: "Howrah Terminus",
    endLocation: "Digha",
    stopIds: routeHowrahDighaStops.map((stop) => stop._id),
    distance: 226,
    basePrice: 95,
    perKmFare: 5.8,
    code: "Coastal Express",
    slots: [
      { id: "slot-0800", time: "8:00 AM", arrival: "12:00 PM", capacityUsed: 33, busNumber: "WB-34C-1021" },
      { id: "slot-1130", time: "11:30 AM", arrival: "3:25 PM", capacityUsed: 57, busNumber: "WB-34C-2877" },
      { id: "slot-1630", time: "4:30 PM", arrival: "8:20 PM", capacityUsed: 74, busNumber: "WB-34C-4110" }
    ]
  }
];

export const seedStops = [...routeKolkataHaldiaStops, ...routeHowrahDighaStops];

export const seedBuses = [
  {
    _id: "bus-001",
    busNumber: "WB-19B-3158",
    driverId: "driver-001",
    capacityTotal: 4200,
    capacityAvailable: 3980,
    routeId: "route-kolkata-haldia",
    currentLocation: { lat: 22.4267, lng: 87.8652 },
    status: "running",
    currentStopId: "stop-kolaghat",
    nextStopId: "stop-mecheda",
    startedAt: "2026-03-20T12:05:00.000Z",
    completedAt: null
  },
  {
    _id: "bus-002",
    busNumber: "WB-34C-2877",
    driverId: "driver-002",
    capacityTotal: 3900,
    capacityAvailable: 3900,
    routeId: "route-howrah-digha",
    currentLocation: { lat: 22.5839, lng: 88.2843 },
    status: "idle",
    currentStopId: null,
    nextStopId: null,
    startedAt: null,
    completedAt: null
  }
];

export const seedBookings = [
  {
    _id: "booking-240301",
    userId: "user-001",
    busId: "bus-001",
    routeId: "route-kolkata-haldia",
    pickupStopId: "stop-kolkata-gate",
    dropStopId: "stop-haldia-depot",
    weight: 18,
    quantity: 2,
    price: 629,
    packageType: "Electronics",
    fragile: true,
    express: false,
    paymentMethod: "UPI",
    slotId: "slot-1200",
    status: "in_transit",
    createdAt: "2026-03-20T09:30:00.000Z",
    tracking: [
      { status: "booked", message: "Booking created", time: "2026-03-20T09:30:00.000Z" },
      { status: "loaded", message: "Package loaded on bus", time: "2026-03-20T11:45:00.000Z" },
      { status: "in_transit", message: "Bus departed Kolaghat", time: "2026-03-20T12:25:00.000Z" }
    ]
  }
];

export const seedPayments = [
  {
    _id: "payment-240301",
    bookingId: "booking-240301",
    userId: "user-001",
    amount: 629,
    method: "UPI",
    status: "success",
    transactionId: "TXN240301UPI",
    createdAt: "2026-03-20T09:31:00.000Z"
  }
];

export const seedReviews = [
  {
    _id: "review-240301",
    bookingId: "booking-240301",
    reviewerId: "user-001",
    targetId: "driver-001",
    rating: 5,
    comment: "Cargo reached on time and was handled carefully.",
    createdAt: "2026-03-21T10:15:00.000Z"
  }
];

export const seedLiveLocations = [
  {
    _id: "live-bus-001",
    busId: "bus-001",
    lat: 22.4267,
    lng: 87.8652,
    speed: 42,
    heading: 118,
    label: "Near Kolaghat bridge",
    updatedAt: "2026-03-20T12:40:00.000Z"
  }
];

export const seedWarehouses = [
  {
    _id: "warehouse-stop-kolaghat",
    stopId: "stop-kolaghat",
    capacity: 1200,
    currentLoad: 240
  },
  {
    _id: "warehouse-stop-haldia-depot",
    stopId: "stop-haldia-depot",
    capacity: 2400,
    currentLoad: 520
  }
];

export const seedSubscriptions = [
  {
    _id: "subscription-001",
    userId: "user-001",
    routeId: "route-kolkata-haldia",
    validFrom: "2026-03-01T00:00:00.000Z",
    validTo: "2026-03-31T23:59:59.000Z",
    type: "monthly"
  }
];
