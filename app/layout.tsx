import type { Metadata } from "next";
import "./globals.css";
import "./request-intake.css";
import "./request-workflow.css";
import "./request-polish.css";
import "./request-final.css";
import "./request-baseline.css";
import "./request-entity.css";
import "./commercial-baseline.css";
import "./proposal-template.css";
import "./tender-core.css";
import "./tender-demo.css";

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
