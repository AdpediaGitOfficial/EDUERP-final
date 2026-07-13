// Minimal stand-in for @tanstack/react-router so ModuleTabs can render in a
// component test without a full RouterProvider. Only the two symbols the
// component uses are provided.
import * as React from "react";

// Tests set window.__pathname before mount to drive the active-tab state.
export function useLocation() {
  const pathname = (typeof window !== "undefined" && (window as any).__pathname) || "/hr";
  return { pathname };
}

export function Link({
  to,
  children,
  ...rest
}: {
  to: string;
  children: React.ReactNode;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={to} data-to={to} {...rest}>
      {children}
    </a>
  );
}
