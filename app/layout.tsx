import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tilt Tetris",
  description: "A browser-based 3D Tetris game with an accelerometer-controlled camera.",
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
