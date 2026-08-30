import { cn } from "@/lib/ui/format";

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

export function Metric({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: string; tone?: "good" | "warn" | "bad" }) {
  return <div className={cn("metric", tone && `tone-${tone}`)}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

export function Status({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" }) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

export function Section({ title, note, actions, children, className }: { title?: string; note?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={cn("section", className)}>{(title || actions) && <div className="section-head"><div>{title && <h2>{title}</h2>}{note && <p>{note}</p>}</div>{actions}</div>}{children}</section>;
}

export function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><strong>{title}</strong><span>{text}</span></div>;
}
