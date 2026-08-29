import { createConnectClassApp } from "./server/app.js";

const port = Number(process.env.PORT ?? 8080);
const app = await createConnectClassApp();

app.server.listen(port, () => {
  console.info(`[ConnectClass] Servidor disponível em http://localhost:${port}`);
});
