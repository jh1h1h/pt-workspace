import type { ReactNode } from 'react';
export function Loading() {
  return <p role="status" className="muted">Loading workspace…</p>;
}
export function ErrorMessage({
  error
}: {
  error: unknown;
}) {
  return <p role="alert" className="error">{error instanceof Error ? error.message : 'Something went wrong.'}</p>;
}
export function Empty({
  children
}: {
  children: ReactNode;
}) {
  return <p className="empty">{children}</p>;
}
