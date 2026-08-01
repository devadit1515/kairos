import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

/**
 * One family, several weights — the right answer for a product UI. Inter also
 * matters here for a specific reason: the interface leans on tabular figures
 * throughout, and relying on whatever the OS happened to supply meant the
 * numbers were set in Segoe UI on Windows and SF on macOS, at noticeably
 * different widths. Loading the family makes the typography deliberate rather
 * than incidental.
 *
 * Self-hosted at build time by next/font, so there is no runtime request to a
 * third party and no layout shift from a late swap.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Kairos — the time you actually have",
  description:
    "A capacity-aware calendar. It computes whether your commitments are actually possible, then rebuilds your week so they are.",
  applicationName: "Kairos",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Kairos",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false, date: false, address: false },
  openGraph: {
    title: "Kairos — the time you actually have",
    description:
      "Most calendars show what you committed to. Kairos tells you whether it's possible.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#06070a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Allow zoom — disabling it is an accessibility failure, and the layout
  // is built to survive it.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <div className="relative z-10">{children}</div>
        <ServiceWorker />
      </body>
    </html>
  );
}
