export const routes = [
  {
    id: "route-kolkata-haldia",
    name: "Kolkata to Haldia",
    code: "WB-116 Cargo Line",
    baseFare: 85,
    perKmFare: 5.2,
    stops: [
      { id: "dankuni", name: "Dankuni", kmFromStart: 0, region: "Hooghly" },
      { id: "kolkata-gate", name: "Kolkata Gate", kmFromStart: 22, region: "Kolkata" },
      { id: "uluberia", name: "Uluberia", kmFromStart: 48, region: "Howrah" },
      { id: "bagnan", name: "Bagnan", kmFromStart: 67, region: "Howrah" },
      { id: "kolaghat", name: "Kolaghat", kmFromStart: 94, region: "Purba Medinipur" },
      { id: "mecheda", name: "Mecheda", kmFromStart: 108, region: "Purba Medinipur" },
      { id: "tamluk", name: "Tamluk", kmFromStart: 128, region: "Purba Medinipur" },
      { id: "nandakumar", name: "Nandakumar", kmFromStart: 146, region: "Purba Medinipur" },
      { id: "durgachak", name: "Durgachak", kmFromStart: 171, region: "Haldia" },
      { id: "haldia-depot", name: "Haldia Depot", kmFromStart: 184, region: "Haldia" }
    ],
    slots: [
      { id: "slot-1030", time: "10:30 AM", arrival: "1:10 PM", capacityUsed: 42, busNumber: "WB-19B-2451" },
      { id: "slot-1200", time: "12:00 PM", arrival: "2:45 PM", capacityUsed: 68, busNumber: "WB-19B-3158" },
      { id: "slot-1545", time: "3:45 PM", arrival: "6:20 PM", capacityUsed: 93, busNumber: "WB-19B-4412" }
    ]
  },
  {
    id: "route-howrah-digha",
    name: "Howrah to Digha",
    code: "Coastal Express",
    baseFare: 95,
    perKmFare: 5.8,
    stops: [
      { id: "howrah-terminus", name: "Howrah Terminus", kmFromStart: 0, region: "Howrah" },
      { id: "santragachi", name: "Santragachi", kmFromStart: 11, region: "Howrah" },
      { id: "uluberia-digha", name: "Uluberia", kmFromStart: 36, region: "Howrah" },
      { id: "kolaghat-digha", name: "Kolaghat", kmFromStart: 82, region: "Purba Medinipur" },
      { id: "nandakumar-digha", name: "Nandakumar", kmFromStart: 131, region: "Purba Medinipur" },
      { id: "contai", name: "Contai", kmFromStart: 187, region: "Purba Medinipur" },
      { id: "digha", name: "Digha", kmFromStart: 226, region: "East Midnapore" }
    ],
    slots: [
      { id: "slot-0800", time: "8:00 AM", arrival: "12:00 PM", capacityUsed: 33, busNumber: "WB-34C-1021" },
      { id: "slot-1130", time: "11:30 AM", arrival: "3:25 PM", capacityUsed: 57, busNumber: "WB-34C-2877" },
      { id: "slot-1630", time: "4:30 PM", arrival: "8:20 PM", capacityUsed: 74, busNumber: "WB-34C-4110" }
    ]
  }
];

export const users = [
  {
    id: "user-001",
    phoneNumber: "9883773485",
    name: "Subhadeep",
    email: "subhadeep@example.com",
    usage: "Business",
    language: "English",
    walletBalance: 1240,
    gstNumber: "19ABCDE1234F1Z5",
    savedRouteIds: ["route-kolkata-haldia"],
    savedStopIds: ["kolaghat", "haldia-depot"]
  }
];

export const drivers = [
  {
    id: "driver-001",
    phoneNumber: "9123456789",
    name: "Arindam Saha",
    badgeNumber: "DRV-1208",
    role: "Driver",
    status: "Assigned",
    rating: 4.9
  },
  {
    id: "driver-002",
    phoneNumber: "9234567890",
    name: "Priya Mondal",
    badgeNumber: "DRV-2084",
    role: "Conductor",
    status: "Available",
    rating: 4.7
  }
];

export const buses = [
  {
    id: "bus-001",
    busNumber: "WB-19B-3158",
    capacityKg: 4200,
    routeId: "route-kolkata-haldia",
    status: "Assigned"
  },
  {
    id: "bus-002",
    busNumber: "WB-34C-2877",
    capacityKg: 3900,
    routeId: "route-howrah-digha",
    status: "Idle"
  }
];

export const bookings = [
  {
    id: "BK-240301",
    userId: "user-001",
    routeId: "route-kolkata-haldia",
    pickupStopId: "kolkata-gate",
    dropStopId: "haldia-depot",
    slotId: "slot-1200",
    packageType: "Electronics",
    weightKg: 18,
    quantity: 2,
    fragile: true,
    express: false,
    fare: 629,
    paymentMethod: "UPI",
    status: "In Transit",
    createdAt: "2026-03-20T09:30:00.000Z",
    tracking: [
      { status: "Booked", time: "2026-03-20T09:30:00.000Z" },
      { status: "Loaded", time: "2026-03-20T11:45:00.000Z" },
      { status: "In Transit", time: "2026-03-20T12:25:00.000Z" }
    ]
  }
];

export const tripAssignments = [
  {
    id: "trip-001",
    driverId: "driver-001",
    busId: "bus-001",
    routeId: "route-kolkata-haldia",
    slotId: "slot-1200",
    bookingIds: ["BK-240301"],
    status: "Active",
    startedAt: "2026-03-20T12:05:00.000Z",
    currentStopId: "kolaghat",
    nextStopId: "mecheda"
  }
];

export const liveTripLocations = new Map([
  [
    "trip-001",
    {
      tripId: "trip-001",
      driverId: "driver-001",
      lat: 22.4267,
      lng: 87.8652,
      speed: 42,
      heading: 118,
      label: "Near Kolaghat bridge",
      updatedAt: "2026-03-20T12:40:00.000Z"
    }
  ]
]);

export const liveTripEvents = new Map([
  [
    "trip-001",
    [
      { type: "trip.started", message: "Trip started from Kolkata Gate", time: "2026-03-20T12:05:00.000Z" },
      { type: "stop.departed", message: "Departed Kolaghat", time: "2026-03-20T12:31:00.000Z" }
    ]
  ]
]);

export const otpSessions = new Map();
export const refreshSessions = new Map();
