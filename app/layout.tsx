import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portioned — shop together, waste less",
  description: "Find a compatible grocery shopping partner and split a package in person.",
  applicationName: "Portioned",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f7f8f4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
