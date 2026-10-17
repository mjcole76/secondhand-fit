import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Secondhand Fit",
  description:
    "Try-on for resale listings, built on the Perfect Corp. YouCam Apparel Virtual Try-On API. Preview only.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <header className="site-header">
          <Link href="/" className="brand">
            <span className="brand-symbol" aria-hidden="true">s.</span> Secondhand Fit
          </Link>
          <nav aria-label="Primary">
            <Link href="/listings">Browse</Link>
            <Link href="/sell/new">Sell</Link>
            <Link href="/try">Try it on</Link>
            <Link href="/watchlist">Watchlist</Link>
          </nav>
        </header>
        <main id="main-content" className="site-main">{children}</main>
        <footer className="site-footer">
          <span>
            Secondhand Fit · Appearance previews powered by Perfect Corp. YouCam.{" "}
            <Link href="/methods">Methods and scope</Link> · <Link href="/methods#source">Source and licence</Link> · <Link href="/status">Service status</Link>
          </span>
        </footer>
      </body>
    </html>
  );
}
