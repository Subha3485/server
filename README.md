# Bus Logistics Server

Node.js API for the Flutter bus-logistics prototype.

## Product Docs

- [System Architecture](./docs/system-architecture.md)
- [Product Checklist](./docs/product-checklist.md)

## Setup

```bash
npm install
npm run dev
```

Default port: `4000`

## Main Endpoints

- `GET /health`
- `GET /admin`
- `GET /api/routes`
- `GET /api/routes/:routeId`
- `GET /api/routes/:routeId/slots`
- `POST /api/auth/send-otp`
- `POST /api/auth/resend-otp`
- `POST /api/auth/verify-otp`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/driver/auth/send-otp`
- `POST /api/driver/auth/resend-otp`
- `POST /api/driver/auth/verify-otp`
- `POST /api/driver/auth/refresh`
- `POST /api/driver/auth/logout`
- `GET /api/driver/auth/me`
- `GET /api/driver/:driverId/assignment`
- `GET /api/trips/:tripId`
- `POST /api/trips/:tripId/status`
- `POST /api/trips/:tripId/stops`
- `POST /api/trips/:tripId/location`
- `GET /api/admin/summary`
- `GET /api/users/:userId/profile`
- `GET /api/users/:userId/bookings`
- `GET /api/bookings/:bookingId`
- `GET /api/bookings/:bookingId/tracking`
- `GET /api/users/:userId/wallet`
- `POST /api/fare/quote`
- `POST /api/bookings`

## Example Requests

Send OTP:

```bash
curl -X POST http://localhost:4000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d "{\"phoneNumber\":\"9883773485\"}"
```

Verify customer OTP:

```bash
curl -X POST http://localhost:4000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"otp-session-id\",\"otp\":\"123456\"}"
```

Send driver OTP:

```bash
curl -X POST http://localhost:4000/api/driver/auth/send-otp \
  -H "Content-Type: application/json" \
  -d "{\"phoneNumber\":\"9123456789\"}"
```

Get fare quote:

```bash
curl -X POST http://localhost:4000/api/fare/quote \
  -H "Content-Type: application/json" \
  -d "{\"routeId\":\"route-kolkata-haldia\",\"pickupStopId\":\"kolaghat\",\"dropStopId\":\"haldia-depot\",\"weightKg\":18,\"quantity\":2,\"fragile\":true,\"express\":false}"
```

Create booking:

```bash
curl -X POST http://localhost:4000/api/bookings \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"user-001\",\"routeId\":\"route-kolkata-haldia\",\"pickupStopId\":\"kolaghat\",\"dropStopId\":\"haldia-depot\",\"slotId\":\"slot-1200\",\"packageType\":\"Electronics\",\"weightKg\":18,\"quantity\":2,\"fragile\":true,\"express\":false,\"paymentMethod\":\"UPI\"}"
```

## Notes

- Data is mock and stored in memory.
- OTP is mocked as `123456`.
- Access and refresh tokens are mock in-memory sessions for local development.
- Realtime updates are available through Socket.IO on the same server port.
- This is suitable for Flutter integration and flow development, not production deployment.
