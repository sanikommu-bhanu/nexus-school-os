import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NEXUS — AI Operating System for Schools",
  description:
    "NEXUS connects admins, teachers, students and parents into one intelligent school network.",
  manifest: "/manifest.json",
  // /icon.png never existed in public/ — it was referenced here and in
  // manifest.json, so every page load 404'd on the favicon and the
  // apple-touch icon. Replaced with a real SVG mark.
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0A0A11",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
