import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gravity Tetris",
  description: "A browser-based 3D Tetris game with tilt-controlled views and radial core gravity.",
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
