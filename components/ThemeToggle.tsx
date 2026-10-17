"use client";
import { useEffect, useState } from "react";

/** Dark is the default. A light choice is remembered in this browser only. */
export const THEME_STORAGE_KEY = "sf_theme";

/** Runs in <head> before the first paint so a saved light theme does not flash dark first. */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

type Theme = "dark" | "light";

export function ThemeToggle() {
  // Null until the browser has applied the saved theme. The visible label is switched by CSS, so
  // the server-rendered button never disagrees with the page.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = (theme ?? "dark") === "light" ? "dark" : "light";
    if (next === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      if (next === "light") window.localStorage.setItem(THEME_STORAGE_KEY, "light");
      else window.localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      // Storage can be blocked. The theme still changes for this page view.
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark mode" : theme === "dark" ? "Switch to light mode" : "Switch colour theme"}
    >
      <span className="theme-toggle-to-light" aria-hidden="true">☀ Light</span>
      <span className="theme-toggle-to-dark" aria-hidden="true">☾ Dark</span>
    </button>
  );
}
