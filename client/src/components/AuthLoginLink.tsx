import type { MouseEvent, ReactNode } from "react";
import { getLoginUrl } from "@/const";
import { attemptLoginRedirect } from "@/lib/auth-login";

type AuthLoginLinkProps = {
  children: ReactNode;
  className?: string;
};

export function AuthLoginLink({ children, className }: AuthLoginLinkProps) {
  const href = getLoginUrl();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Intercept only left-click direct navigation. Let browser handle modified clicks.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    attemptLoginRedirect();
  };

  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
