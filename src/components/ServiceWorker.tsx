"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production only.
 *
 * In development a service worker caches the very assets you're iterating on,
 * which turns "why isn't my change showing up?" into a recurring twenty-minute
 * detour. Not worth it for a feature that only matters in production anyway.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        // A failed registration costs offline support, not the app — log and move on.
        console.warn("Service worker registration failed:", err);
      });
    };

    // Defer past load so registration never competes with first paint.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
