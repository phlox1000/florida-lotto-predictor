/**
 * StateViews — standardized loading, empty, and error state components.
 *
 * Use these instead of ad-hoc spinners or inline empty messages.
 * Ensures consistent visual behavior across all tab screens.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Inbox } from "lucide-react";

// ─── Loading state ────────────────────────────────────────────────────────────

interface LoadingStateProps {
  /** Number of skeleton rows to show */
  rows?: number;
  /** Height of each skeleton row */
  rowHeight?: string;
  /** Optional class override */
  className?: string;
}

export function LoadingState({
  rows = 4,
  rowHeight = "h-20",
  className = "",
}: LoadingStateProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`w-full ${rowHeight} rounded-xl`} />
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-16 text-center ${className}`}
    >
      <div className="mb-4 text-muted-foreground/30">
        {icon ?? <Inbox className="w-12 h-12" />}
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

interface ErrorStateProps {
  title?: string;
  message?: string;
  retry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message = "Failed to load data. Please try again.",
  retry,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-16 text-center ${className}`}
    >
      <AlertCircle className="w-10 h-10 text-destructive mb-3" />
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
      {retry && (
        <button
          onClick={retry}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

// ─── Inline skeleton row (for list items) ────────────────────────────────────

export function SkeletonRow({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl bg-card border border-border/50 ${className}`}>
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
      <Skeleton className="w-12 h-6 rounded-md flex-shrink-0" />
    </div>
  );
}

// ─── Card skeleton (for grid layouts) ────────────────────────────────────────

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`p-4 rounded-xl bg-card border border-border/50 space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="w-10 h-10 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
    </div>
  );
}
