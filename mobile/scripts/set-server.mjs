// Points the app at your SaansSafe server: `npm run server -- https://saanssafe.example.com`.
// The app opens <url>/app full screen. Plain http (for a laptop on your Wi-Fi) works, but the phone then
// blocks location and notifications for the page, so prefer an https address.
import { readFileSync, writeFileSync } from "node:fs";

const raw = process.argv[2] ?? process.env.SAANSSAFE_SERVER_URL;
if (!raw) {
  console.error("Usage: npm run server -- <server url>, e.g. http://192.168.1.20:8080");
  process.exit(1);
}
let url;
try {
  url = new URL(raw);
} catch {
  console.error(`Not a URL: ${raw}`);
  process.exit(1);
}
if (url.protocol !== "https:" && url.protocol !== "http:") {
  console.error("The server address must start with http:// or https://");
  process.exit(1);
}
const file = new URL("../capacitor.config.json", import.meta.url);
const config = JSON.parse(readFileSync(file, "utf8"));
config.server.url = `${url.origin}/app`;
config.server.cleartext = url.protocol === "http:";
writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
console.log(`SaansSafe app will open ${config.server.url}`);
