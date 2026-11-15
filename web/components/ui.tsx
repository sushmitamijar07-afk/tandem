import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function Notice({ tone = "warn", children }: { tone?: "warn" | "info"; children: ReactNode }) {
  const cls =
    tone === "warn" ? "border-warn-line bg-warn-bg text-warn-ink" : "border-line bg-bg text-muted";
  return (
    <p role="status" className={`border px-3 py-2 text-sm ${cls}`}>
      {children}
    </p>
  );
}

export function Button({
  busy,
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; variant?: "primary" | "quiet" }) {
  const base = "inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
  const look =
    variant === "primary"
      ? "bg-brand text-on-brand hover:bg-brand-hover"
      : "border border-line bg-surface text-ink hover:border-ink";
  return (
    <button type="button" {...rest} disabled={rest.disabled || busy} className={`${base} ${look} ${className}`}>
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-1.5 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="num text-right">{children}</dd>
    </div>
  );
}
