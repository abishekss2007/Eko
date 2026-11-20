import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

export type Route = "/" | "/login" | "/signup" | "/app";
const ROUTES: Route[] = ["/", "/login", "/signup", "/app"];

function current(): Route {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return (ROUTES as string[]).includes(path) ? (path as Route) : "/";
}

export function navigate(to: string): void {
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo?.(0, 0);
}

/** Tiny History-API router: four pages need no routing library. */
export function useRoute(): { route: Route; search: URLSearchParams } {
  const [state, setState] = useState(() => ({ route: current(), search: new URLSearchParams(window.location.search) }));
  useEffect(() => {
    const onPop = () => setState({ route: current(), search: new URLSearchParams(window.location.search) });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return state;
}

/** A real link (works with middle-click and screen readers) that navigates without a reload. */
export function Link({ href, onClick, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} onClick={handle} {...rest}>
      {children}
    </a>
  );
}
