import { mkdir, copyFile } from "node:fs/promises";

// Only public assets enter the CDN output. HTML remains behind the existing router.
const files = ["styles.css", "manager.css", "script.js", "gestor.js", "message-ui.js", "assets/logo.png",
  "Captura de tela de 2026-06-07 23-06-40.png"];
await mkdir("public/assets", { recursive: true });
for (const file of files) await copyFile(file, `public/${file}`);
console.info(`Build Vercel: ${files.length} assets públicos. Backend em api/index.js.`);
