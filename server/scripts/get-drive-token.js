/**
 * One-time: sign in as hanzalamawahab@gmail.com, then paste GOOGLE_DRIVE_REFRESH_TOKEN into .env
 *
 * Google Cloud → Web client → Authorized redirect URI must be exactly:
 *   http://localhost:3333/oauth2callback
 *
 * (Not localhost:5173 — that is only the React app.)
 */
import dotenv from "dotenv";
import http from "http";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const REDIRECT = "http://localhost:3333/oauth2callback";
const PORT = 3333;

const clientId =
  process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret =
  process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in .env");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT);

const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/drive.file"],
});

console.log("\n=== Google Drive token setup ===");
console.log("Redirect URI (must match Google Cloud):", REDIRECT);
console.log("Sign in as: hanzalamawahab@gmail.com\n");
console.log(url, "\n");

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    if (u.pathname !== "/oauth2callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const code = u.searchParams.get("code");
    const error = u.searchParams.get("error");
    if (error) {
      res.end(`Error: ${error}`);
      console.error("OAuth error:", error);
      process.exit(1);
    }
    if (!code) {
      res.end("Missing code");
      return;
    }
    try {
      const { tokens } = await oauth2.getToken(code);
      const refresh = tokens.refresh_token;
      if (refresh) {
        console.log("\nGOOGLE_DRIVE_REFRESH_TOKEN=" + refresh + "\n");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;background:#111;color:#eee">
          <h2 style="color:#4caf50">Success</h2>
          <p>Add this line to <code>server/.env</code> and restart the API server:</p>
          <pre style="background:#222;padding:12px;overflow:auto;user-select:all">GOOGLE_DRIVE_REFRESH_TOKEN=${refresh}</pre>
          <p style="color:#888">Also printed in the terminal where you ran npm run get-drive-token</p>
        </body></html>`);
      } else {
        res.end("No refresh token — revoke TWF CRM at https://myaccount.google.com/permissions and run the script again.");
        console.log("\nNo refresh_token — revoke app and run again.\n");
      }
    } catch (e) {
      res.end(`Failed: ${e.message}`);
      console.error(e);
    }
    process.exit(0);
  })
  .listen(PORT, () => {
    console.log(`Listening on http://localhost:${PORT}/oauth2callback\n`);
    const cmd =
      process.platform === "win32" ? `start "" "${url}"` : `open "${url}"`;
    import("child_process").then(({ exec }) => exec(cmd, () => {}));
  });
