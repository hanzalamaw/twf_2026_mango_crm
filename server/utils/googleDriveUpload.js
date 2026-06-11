import { google } from "googleapis";
import { PassThrough } from "stream";

let drive = null;

function getDrive() {
  if (drive) return drive;

  const clientId =
    process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret =
    process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in .env");
  }
  if (!refreshToken) {
    throw new Error("Set GOOGLE_DRIVE_REFRESH_TOKEN in .env (run: npm run get-drive-token)");
  }
  if (!folderId) {
    throw new Error("Set GOOGLE_DRIVE_FOLDER_ID in .env");
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  drive = google.drive({ version: "v3", auth: oauth2 });
  return drive;
}

/** Returns a user-facing message when Drive OAuth fails (e.g. expired refresh token). */
export function driveAuthErrorMessage(err) {
  const msg = String(err?.message || err?.response?.data?.error || "");
  if (msg.includes("invalid_grant")) {
    return "Google Drive token expired or revoked. Run: cd server && npm run get-drive-token — then paste the new GOOGLE_DRIVE_REFRESH_TOKEN into .env and restart the server.";
  }
  if (msg.includes("GOOGLE_DRIVE")) return msg;
  return null;
}

function folderId() {
  return process.env.GOOGLE_DRIVE_FOLDER_ID.trim();
}

async function uploadImage(fileBuffer, fileName, mimeType) {
  const bufferStream = new PassThrough();
  bufferStream.end(fileBuffer);

  const res = await getDrive().files.create({
    requestBody: { name: fileName, parents: [folderId()] },
    media: { mimeType, body: bufferStream },
    fields: "id",
  });

  const fileId = res.data.id;

  try {
    await getDrive().permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });
  } catch {
    /* optional — view link may still work for owner */
  }

  return {
    fileId,
    photoUrl: `https://drive.google.com/uc?export=view&id=${fileId}`,
  };
}

export async function uploadRiderPhoto(fileBuffer, fileName) {
  const { fileId, photoUrl } = await uploadImage(fileBuffer, fileName, "image/jpeg");
  return { fileId, photoUrl };
}

export async function uploadPaymentScreenshot(fileBuffer, fileName, mimeType = "image/png") {
  const { fileId, photoUrl } = await uploadImage(fileBuffer, fileName, mimeType);
  return { fileId, screenshotUrl: photoUrl };
}

export async function deleteRiderPhoto(fileId) {
  if (!fileId) return;
  try {
    await getDrive().files.delete({ fileId });
  } catch (e) {
    console.error("Drive delete error:", e.message);
  }
}
