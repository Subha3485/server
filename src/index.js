import { createServer } from "http";
import { createApp } from "./app.js";
import { initializeDatabase } from "./bootstrap.js";
import { config } from "./config.js";
import { createRealtimeServer } from "./realtime.js";
import { getDatabaseConnectionStatus } from "./db.js";
import { getRuntimeMode, resolveDbNameForMode } from "./runtime_mode.js";

// In local development we can probe a small port range to avoid manual edits.
const PORT_RETRY_LIMIT = 10;
const IS_DYNAMIC_PORT_ASSIGNED = typeof process.env.PORT !== "undefined";
const DYNAMIC_HOST = "0.0.0.0";

function resolveListenHost() {
  // Managed platforms typically require binding to all interfaces.
  if (IS_DYNAMIC_PORT_ASSIGNED) {
    return DYNAMIC_HOST;
  }

  return config.host;
}

function buildPublicBaseUrl(host, port) {
  if (IS_DYNAMIC_PORT_ASSIGNED) {
    return `http://${host}:${port}`;
  }

  try {
    const url = new URL(config.publicBaseUrl);
    url.port = String(port);
    return url.toString().replace(/\/$/, "");
  } catch {
    return `http://${host}:${port}`;
  }
}

async function listenWithPortRetry(server, host, preferredPort) {
  // If the platform controls PORT, do a single strict bind attempt.
  if (IS_DYNAMIC_PORT_ASSIGNED) {
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(preferredPort, host);
    });

    return preferredPort;
  }

  for (let index = 0; index < PORT_RETRY_LIMIT; index += 1) {
    const candidatePort = preferredPort + index;
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };

        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(candidatePort, host);
      });
      return candidatePort;
    } catch (error) {
      if (error?.code !== "EADDRINUSE") {
        throw error;
      }
      if (index === PORT_RETRY_LIMIT - 1) {
        throw error;
      }
      console.warn(`⚠️ Port ${candidatePort} is in use. Retrying on ${candidatePort + 1}...`);
    }
  }

  throw new Error("Unable to find an available port.");
}

try {
  // Boot order is important: DB first, then web/realtime surfaces.
  await initializeDatabase();
  const dbStatus = await getDatabaseConnectionStatus();

  const httpServer = createServer();
  const io = createRealtimeServer(httpServer);
  const app = createApp(io);
  const listenHost = resolveListenHost();

  console.log(`ENV PORT: ${process.env.PORT ?? "undefined"}`);

  httpServer.on("request", app);
  const activePort = await listenWithPortRetry(httpServer, listenHost, config.port);
  const activeBaseUrl = buildPublicBaseUrl(listenHost, activePort);

  httpServer.on("error", (error) => {
    console.error("❌ Server runtime error.");
    console.error(error);
  });

  setImmediate(() => {
    // Startup banner is deferred so fatal startup errors are logged first.
    console.log("\n");
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║                                                           ║");
    console.log("║          🚌 BUS LOGISTICS SERVER STARTED                 ║");
    console.log("║                                                           ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");
    console.log("");
    console.log(`✅ Server running on: ${activeBaseUrl}`);
    console.log(`📍 Host: ${listenHost}:${activePort}`);
    console.log(`🌍 Listening on ${activePort}`);
    console.log("🌐 Public URL will be provided by Render");
    console.log(`🔧 Server mode: ${config.serverMode}`);
    console.log(`🧭 Runtime data mode: ${getRuntimeMode()}`);
    console.log(`🗃️  Live DB: ${resolveDbNameForMode("live")}`);
    console.log(`🗃️  Mock DB: ${resolveDbNameForMode("mock")}`);
    console.log(`🧪 Mongo status: ${dbStatus.connected ? "CONNECTED" : "DISCONNECTED"}`);
    if (!dbStatus.connected) {
      console.log(`⚠️  Mongo error: ${dbStatus.error}`);
    }
    console.log(`🛠️  Admin panel: ${activeBaseUrl}/admin`);
    console.log(`⚡ Realtime socket: ${activeBaseUrl}`);
    console.log("");
    console.log("Server is ready to accept connections!");
    console.log("\n");
  });
} catch (error) {
  console.error("\n❌ FATAL ERROR - Server boot failed!");
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error(error);
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.exit(1);
}
