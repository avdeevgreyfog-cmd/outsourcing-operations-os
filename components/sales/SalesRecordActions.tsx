"use client";

import Link from "next/link";
import { ArrowUpRight, Eye } from "lucide-react";

export function SalesRecordActions({ title, onPreview, href, onOpen }: { title: string; onPreview: () => void; href?: string; onOpen?: () => void }) {
  return <div className="sales-record-actions">
    <button type="button" className="icon-button sales-preview-button" title="Быстрый просмотр" aria-label={`Просмотр: ${title}`} onClick={onPreview}><Eye size={16}/></button>
    {href && <Link className="icon-button sales-preview-button" title="Открыть карточку" aria-label={`Открыть карточку: ${title}`} href={href} onClick={onOpen}><ArrowUpRight size={16}/></Link>}
  </div>;
}

export function SalesRecordTitle({ title, onPreview, className = "cell-title" }: { title: string; onPreview: () => void; className?: string }) {
  return <button type="button" className={`sales-record-title ${className}`} title={title} onClick={onPreview}>{title}</button>;
}
