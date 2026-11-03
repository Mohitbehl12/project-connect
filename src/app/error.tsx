"use client";
import { useEffect } from "react";
import { reportClientError } from "@/components/ErrorReporter";

/** Shown when a page crashes; the crash is reported to the monitor. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportClientError(error.message || `Server render failed (${error.digest ?? "no digest"})`, error.stack, "crash"); }, [error]);
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="text-3xl font-extrabold">Something went wrong</h1>
      <p className="mt-3 text-ink-soft">We've been told about it automatically. Try again, and if it keeps happening, come back in a few minutes.</p>
      <button className="btn-primary mt-6" onClick={() => reset()}>Try again</button>
    </div>
  );
}
