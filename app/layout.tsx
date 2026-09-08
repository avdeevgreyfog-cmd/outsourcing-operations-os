import type { Metadata } from "next";
import "./globals.css";
import "./request-intake.css";
import "./request-workflow.css";
import "./request-polish.css";
import "./request-final.css";
import "./request-baseline.css";

export const metadata: Metadata = {
  title: "OPERIS — Операционная система аутсорсинга",
  description: "Управление кадровым и производственным аутсорсингом: заявки, расчёты, объекты и персонал",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
