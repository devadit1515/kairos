import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <div className="relative z-10">{children}</div>
        <ServiceWorker />
      </body>
    </html>
  );
}
