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

function folderId() {
  return process.env.GOOGLE_DRIVE_FOLDER_ID.trim();
}

export async function uploadRiderPhoto(fileBuffer, fileName) {
  const bufferStream = new PassThrough();
  bufferStream.end(fileBuffer);

  const res = await getDrive().files.create({
    requestBody: { name: fileName, parents: [folderId()] },
    media: { mimeType: "image/jpeg", body: bufferStream },
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

export async function deleteRiderPhoto(fileId) {
  if (!fileId) return;
  try {
    await getDrive().files.delete({ fileId });
  } catch (e) {
    console.error("Drive delete error:", e.message);
  }
}
