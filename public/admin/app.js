const statsRoot = document.getElementById("stats");
const heroTitle = document.getElementById("heroTitle");
const navLinks = [...document.querySelectorAll("#navLinks a")];
const viewPanels = [...document.querySelectorAll(".view-panel")];
const refreshButton = document.getElementById("refreshButton");
const seedTripButton = document.getElementById("seedTripButton");

const routesList = document.getElementById("routesList");
const tripsList = document.getElementById("tripsList");
const driversList = document.getElementById("driversList");
const busesList = document.getElementById("busesList");
const bookingsTable = document.getElementById("bookingsTable");
const analyticsSummary = document.getElementById("analyticsSummary");

const routesManagerList = document.getElementById("routesManagerList");
const busesManagerList = document.getElementById("busesManagerList");
const driversManagerList = document.getElementById("driversManagerList");
const bookingManagerTable = document.getElementById("bookingManagerTable");
const analyticsDetails = document.getElementById("analyticsDetails");
const reportsSummary = document.getElementById("reportsSummary");

const routeForm = document.getElementById("routeForm");
const busForm = document.getElementById("busForm");
const driverForm = document.getElementById("driverForm");

const socket = io();
socket.emit("admin:subscribe");

let summaryCache = null;

socket.on("admin:fleet:update", () => loadDashboard());
socket.on("admin:trip:event", () => loadDashboard());

refreshButton.addEventListener("click", () => loadDashboard());
seedTripButton.addEventListener("click", simulateRealtime);
window.addEventListener("hashchange", syncView);

routeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(routeForm);
  await postJson("/api/admin/routes", {
    name: formData.get("name"),
    code: formData.get("code"),
    baseFare: Number(formData.get("baseFare")),
    perKmFare: Number(formData.get("perKmFare")),
    stops: parseStops(formData.get("stops")),
    slots: parseSlots(formData.get("slots"))
  });
  routeForm.reset();
  await loadDashboard();
  location.hash = "routes";
});

busForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(busForm);
  await postJson("/api/admin/buses", {
    busNumber: formData.get("busNumber"),
    capacityKg: Number(formData.get("capacityKg")),
    routeId: formData.get("routeId") || null,
    status: formData.get("status")
  });
  busForm.reset();
  await loadDashboard();
  location.hash = "buses";
});

driverForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(driverForm);
  await postJson("/api/admin/drivers", {
    name: formData.get("name"),
    phoneNumber: formData.get("phoneNumber"),
    badgeNumber: formData.get("badgeNumber"),
    role: formData.get("role"),
    status: formData.get("status")
  });
  driverForm.reset();
  await loadDashboard();
  location.hash = "drivers";
});

async function loadDashboard() {
  const response = await fetch("/api/admin/summary");
  const { data } = await response.json();
  summaryCache = data;

  renderStats(data.totals);
  renderRoutes(data.routes);
  renderTrips(data.activeTrips);
  renderDrivers(data.drivers);
  renderBuses(data.buses);
  renderBookings(data.recentBookings);
  renderAnalytics(data);
  renderManagerViews(data);
  syncView();
}

function syncView() {
  const view = location.hash.replace("#", "") || "dashboard";

  navLinks.forEach((link) => {
    link.classList.toggle("active-link", link.dataset.view === view);
  });

  viewPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `view-${view}`);
  });

  heroTitle.textContent = getHeroTitle(view);
}

function renderStats(totals) {
  const items = [
    ["Routes", totals.routes],
    ["Buses", totals.buses],
    ["Drivers", totals.drivers],
    ["Bookings", totals.bookings],
    ["Active Trips", totals.activeTrips],
    ["Revenue", `Rs ${totals.revenue}`]
  ];

  statsRoot.innerHTML = items
    .map(
      ([label, value]) => `
        <div class="stat">
          <div class="label">${label}</div>
          <div class="value">${value}</div>
        </div>
      `
    )
    .join("");
}

function renderRoutes(routes) {
  routesList.innerHTML = routes
    .map(
      (route) => `
        <div class="card">
          <strong>${route.name}</strong>
          <p class="meta">${route.code} · ${route.stops.length} stops · ${route.slots.length} slots</p>
        </div>
      `
    )
    .join("");
}

function renderTrips(trips) {
  tripsList.innerHTML = trips
    .map(
      (trip) => `
        <div class="card">
          <strong>${trip.route.name}</strong>
          <p class="meta">${trip.bus.busNumber} · ${trip.driver.name}</p>
          <p class="meta">Current: ${trip.currentStop?.name ?? "Unknown"} · Next: ${trip.nextStop?.name ?? "Unknown"}</p>
          <p class="meta">Live: ${trip.liveLocation?.label ?? "No live GPS yet"}</p>
        </div>
      `
    )
    .join("");
}

function renderDrivers(drivers) {
  driversList.innerHTML = drivers
    .map(
      (driver) => `
        <div class="card">
          <strong>${driver.name}</strong>
          <p class="meta">${driver.role} · ${driver.badgeNumber}</p>
          <span class="pill ${driver.status.toLowerCase()}">${driver.status}</span>
        </div>
      `
    )
    .join("");
}

function renderBuses(buses) {
  busesList.innerHTML = buses
    .map(
      (bus) => `
        <div class="card">
          <strong>${bus.busNumber}</strong>
          <p class="meta">Capacity ${bus.capacityKg} kg · Route ${bus.routeId ?? "Unassigned"}</p>
          <span class="pill ${bus.status.toLowerCase()}">${bus.status}</span>
        </div>
      `
    )
    .join("");
}

function renderBookings(bookings) {
  bookingsTable.innerHTML = bookingTableMarkup(bookings, false);
}

function renderAnalytics(data) {
  analyticsSummary.innerHTML = analyticsMarkup(data);
}

function renderManagerViews(data) {
  routesManagerList.innerHTML = data.routes
    .map(
      (route) => `
        <div class="card">
          <strong>${route.name}</strong>
          <p class="meta">${route.id}</p>
          <p class="meta">${route.stops.map((stop) => stop.name).join(" -> ")}</p>
        </div>
      `
    )
    .join("");

  busesManagerList.innerHTML = data.buses
    .map(
      (bus) => `
        <div class="card">
          <strong>${bus.busNumber}</strong>
          <p class="meta">Capacity ${bus.capacityKg} kg</p>
          <p class="meta">Route ${bus.routeId ?? "Unassigned"} · ${bus.status}</p>
        </div>
      `
    )
    .join("");

  driversManagerList.innerHTML = data.drivers
    .map(
      (driver) => `
        <div class="card">
          <strong>${driver.name}</strong>
          <p class="meta">${driver.phoneNumber} · ${driver.badgeNumber}</p>
          <p class="meta">${driver.role} · Rating ${driver.rating}</p>
        </div>
      `
    )
    .join("");

  bookingManagerTable.innerHTML = bookingTableMarkup(data.recentBookings, true);
  analyticsDetails.innerHTML = analyticsMarkup(data);
  reportsSummary.innerHTML = `
    <div class="card"><strong>Revenue</strong><p class="meta">Rs ${data.totals.revenue}</p></div>
    <div class="card"><strong>Fleet utilization</strong><p class="meta">${data.fleetStatus.assigned} assigned / ${data.totals.buses} buses</p></div>
    <div class="card"><strong>Trips</strong><p class="meta">${data.totals.activeTrips} active trips across ${data.totals.routes} routes</p></div>
  `;

  bookingManagerTable.querySelectorAll("select[data-booking-id]").forEach((select) => {
    select.addEventListener("change", async (event) => {
      const bookingId = event.target.dataset.bookingId;
      await patchJson(`/api/admin/bookings/${bookingId}/status`, { status: event.target.value });
      await loadDashboard();
    });
  });
}

function bookingTableMarkup(bookings, editable) {
  return `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Route</th>
          <th>Package</th>
          <th>Fare</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${bookings
          .map(
            (booking) => `
              <tr>
                <td>${booking.id}</td>
                <td>${booking.route.name}</td>
                <td>${booking.packageType}</td>
                <td>Rs ${booking.fare}</td>
                <td>
                  ${
                    editable
                      ? `
                        <select data-booking-id="${booking.id}">
                          ${["Booked", "Loaded", "In Transit", "Reached", "Delivered"]
                            .map(
                              (status) =>
                                `<option value="${status}" ${status === booking.status ? "selected" : ""}>${status}</option>`
                            )
                            .join("")}
                        </select>
                      `
                      : `<span class="pill transit">${booking.status}</span>`
                  }
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function analyticsMarkup(data) {
  return `
    <div class="metric blue">
      <div>Assigned buses</div>
      <h3>${data.fleetStatus.assigned}</h3>
    </div>
    <div class="metric cyan">
      <div>Idle buses</div>
      <h3>${data.fleetStatus.idle}</h3>
    </div>
    <div class="metric ink">
      <div>Active bookings</div>
      <h3>${data.fleetStatus.activeBookings}</h3>
    </div>
  `;
}

function parseStops(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, region, kmFromStart] = line.split("|").map((part) => part.trim());
      return { name, region, kmFromStart: Number(kmFromStart) };
    });
}

function parseSlots(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [time, arrival, busNumber] = line.split("|").map((part) => part.trim());
      return { time, arrival, busNumber };
    });
}

function getHeroTitle(view) {
  const titles = {
    dashboard: "Monitor routes, buses, drivers, cargo bookings, and trip health.",
    routes: "Create and review route corridors, stop lists, and slot plans.",
    buses: "Register fleet units and map capacity to the right corridors.",
    drivers: "Manage driver and conductor records for OTP-enabled operations.",
    bookings: "Track booking progress and push cargo status updates.",
    analytics: "Review revenue, active fleet state, and operational KPIs.",
    reports: "Summarize the current fleet and booking state for reporting."
  };

  return titles[view] ?? titles.dashboard;
}

async function simulateRealtime() {
  if (!summaryCache?.activeTrips?.length) return;
  const trip = summaryCache.activeTrips[0];
  const location = trip.liveLocation ?? { lat: 22.4267, lng: 87.8652, speed: 40, heading: 100 };

  await postJson(`/api/trips/${trip.id}/location`, {
    driverId: trip.driver.id,
    lat: Number(location.lat) + 0.01,
    lng: Number(location.lng) + 0.01,
    speed: Number(location.speed) + 1,
    heading: Number(location.heading) + 2,
    label: `Near ${trip.nextStop?.name ?? trip.currentStop?.name ?? "route"}`
  });
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "Request failed.");
  return payload;
}

async function patchJson(url, body) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "Request failed.");
  return payload;
}

loadDashboard().catch((error) => {
  heroTitle.textContent = error.message;
});
