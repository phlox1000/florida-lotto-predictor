import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import { resolveClientAuthConfig } from "./runtime-config";

function explainLoginUnavailable(reason: string | null): string {
  if (reason === "missing_oauth_portal_url" || reason === "malformed_oauth_portal_url") {
    return "Sign-in is currently unavailable. Please try again later.";
  }
  return "Sign-in is currently unavailable. Please try again later.";
}

export function attemptLoginRedirect(): boolean {
  const config = resolveClientAuthConfig();

  if (!config.canStartLoginFlow) {
    const message = explainLoginUnavailable(config.loginUnavailableReason);
    toast.error(message);
    console.warn("[AUTH] Sign-in attempt blocked due to invalid login configuration", {
      reason: config.loginUnavailableReason || "unknown",
      authDisableSource: config.authDisableSource,
    });
    return false;
  }

  const loginUrl = getLoginUrl();
  if (!loginUrl || loginUrl === "/") {
    const message = explainLoginUnavailable(config.loginUnavailableReason);
    toast.error(message);
    console.warn("[AUTH] Sign-in attempt blocked because resolved login URL is not navigable", {
      loginUrl,
      reason: config.loginUnavailableReason || "resolved_root_path",
    });
    return false;
  }

  window.location.href = loginUrl;
  return true;
}
