import { existsSync } from "node:fs";
import { createApp } from "./app";
import { MemoryCartStore } from "./cart/store";
import { paymentsFromEnv } from "./payments";

// Local dev reads secrets from .env; on Render they come from the dashboard's environment settings.
if (existsSync(".env")) process.loadEnvFile(".env");

// `--port` wins so local dev can pin the API to 3001 even when PORT is set for Vite.
// In production (Render), PORT is provided by the host.
const portFlag = process.argv.indexOf("--port");
const port = Number(portFlag > -1 ? process.argv[portFlag + 1] : (process.env.PORT ?? 3001));
const { httpServer } = createApp(new MemoryCartStore(), paymentsFromEnv());

httpServer.listen(port, () => {
  console.log(`Settled server listening on http://localhost:${port}`);
});
