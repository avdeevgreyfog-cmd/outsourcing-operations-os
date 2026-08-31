import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OPERIS — Outsourcing Operations OS",
  description: "Operations OS для кадрового и производственного аутсорсинга",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
