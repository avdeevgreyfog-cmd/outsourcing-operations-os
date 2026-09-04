"use client";

export function ProposalPrintButton() {
  return <button className="proposal-print-button" type="button" onClick={() => window.print()}>Печать / сохранить PDF</button>;
}
