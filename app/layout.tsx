import type { Metadata } from "next";
import "./globals.css";
import "./request-intake.css";

export const metadata: Metadata = {
  title: "OPERIS — Операционная система аутсорсинга",
  description: "Operations OS для кадрового и производственного аутсорсинга",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
