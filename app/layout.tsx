import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tilt Tetris — Gesture Edition",
  description: "A touch-first 3D falling-block game with camera-relative swipes and an accelerometer-controlled view.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
