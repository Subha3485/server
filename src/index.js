import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./app.js";
import { initializeDatabase } from "./bootstrap.js";
import { config } from "./config.js";
import { createRealtimeServer } from "./realtime.js";

try {
  await initializeDatabase();

  const httpServer = createServer();
  const io = createRealtimeServer(httpServer);
  const app = createApp(io);

  httpServer.on("request", app);

  httpServer.listen(config.port, config.host, () => {
    console.log(`Bus Logistics API running on ${config.publicBaseUrl}`);
    console.log(`Admin panel available at ${config.publicBaseUrl}/admin`);
    console.log(`Realtime socket available from ${config.publicBaseUrl}`);
  });
} catch (error) {
  console.error("Server boot failed.");
  console.error(error);
  process.exit(1);
}
