# Product Checklist

This checklist groups screens and modules for the current product scope.

## Customer App Screens

- Splash
- Login / OTP
- Home with map and search
- Route selection
- Package details
- Price comparison
- Booking confirmation
- Payment screen
- Live tracking
- Booking history
- Profile

## Driver / Conductor App Screens

- Login
- Bus assignment
- Dashboard
- Live map
- Stop management
- QR scan
- Cargo details
- Trip summary
- Profile

## Passenger Tracking Screens

- Select route
- Available buses
- Bus details
- Live tracking
- Seat info
- Boarding alert
- Trip status

## Admin Panel Screens

Admin panel should live as a web application inside the server repo.

- Dashboard
- Route management
- Bus management
- Driver management
- Booking monitor
- Analytics
- Reports

## Suggested Build Order

1. Finish backend trip, assignment, and realtime contracts.
2. Finish customer booking flow and live tracking screen.
3. Build driver app assignment, trip start, and GPS publishing.
4. Add admin web screens for route, bus, and driver management.
5. Add monitoring, analytics, and reports.

## Realtime MVP Contract

- Driver app sends location every 5 seconds.
- Backend validates trip and driver assignment.
- Latest position is cached in Redis.
- Customer app subscribes to trip updates.
- Admin panel subscribes to live fleet status.
