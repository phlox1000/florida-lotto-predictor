const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const configuredUploadSessionToken = process.env.EXPO_PUBLIC_UPLOAD_SESSION_TOKEN?.trim();

export const API_URL = (
  configuredApiUrl && configuredApiUrl.length > 0
    ? configuredApiUrl
    : "https://florida-lotto-predictor.onrender.com"
).replace(/\/+$/, "");

export const API_TIMEOUT_MS = 25_000;
export const UPLOAD_SESSION_TOKEN = configuredUploadSessionToken && configuredUploadSessionToken.length > 0
  ? configuredUploadSessionToken
  : null;
