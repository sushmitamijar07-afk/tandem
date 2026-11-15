import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-xl space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted">That page doesn&apos;t exist.</p>
      <p>
        <Link href="/" className="underline underline-offset-2">
          Back to swap
        </Link>
      </p>
    </div>
  );
}
