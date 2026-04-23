let currentMobileAuthToken: string | null = null;

export function setMobileAuthToken(token: string | null) {
  currentMobileAuthToken = token && token.trim().length > 0 ? token.trim() : null;
}

export function getMobileAuthToken() {
  return currentMobileAuthToken;
}
