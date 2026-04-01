import { createServer } from "http";
import { createApp } from "./app.js";
import { createRealtimeServer } from "./realtime.js";

const PORT = process.env.PORT || 4000;
const httpServer = createServer();
const io = createRealtimeServer(httpServer);
const app = createApp(io);

httpServer.on("request", app);

httpServer.listen(PORT, () => {
  console.log(`Bus Logistics API running on http://localhost:${PORT}`);
  console.log(`Admin panel available at http://localhost:${PORT}/admin`);
  console.log(`Realtime socket available at ws://localhost:${PORT}`);
});
