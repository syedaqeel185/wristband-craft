import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, XCircle } from "lucide-react";
import { getMySubscription, type SubscriptionState } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * Warning banner shown across supplier pages when attention is needed:
 * trial ending soon, payment failed, subscription expired, or account suspended.
 * Renders nothing when the subscription is healthy (or for non-suppliers).
 */
export function SubscriptionBanner() {
  const navigate = useNavigate();
  const [state, setState] = useState<SubscriptionState | null>(null);

  useEffect(() => {
    getMySubscription()
      .then(setState)
      .catch(() => setState(null));
  }, []);

  if (!state) return null;

  const goBilling = () => navigate("/supplier/billing");
  const formatDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";

  // Blocking states (red)
  if (!state.usable) {
    const message =
      state.reason === "SUPPLIER_SUSPENDED"
        ? "Your supplier account has been suspended. You cannot create products or accept new orders. Please contact the platform administrator."
        : state.reason === "PAYMENT_FAILED"
          ? "Your last subscription payment failed. Update your billing to restore product creation and new orders."
          : "Your subscription has expired. Renew now to create products and accept new orders. Your existing data is safe.";
    return (
      <Banner tone="danger" icon={<XCircle className="h-5 w-5" />}>
        <span className="flex-1">{message}</span>
        {state.reason !== "SUPPLIER_SUSPENDED" && (
          <Button size="sm" variant="secondary" onClick={goBilling}>
            Manage subscription
          </Button>
        )}
      </Banner>
    );
  }

  // Trial ending soon (amber)
  if (state.isTrial && state.daysRemaining <= 7) {
    return (
      <Banner tone="warning" icon={<Clock className="h-5 w-5" />}>
        <span className="flex-1">
          Your free trial ends in {state.daysRemaining} day{state.daysRemaining === 1 ? "" : "s"} (
          {formatDate(state.trialEndsAt)}). Add a plan to keep selling without interruption.
        </span>
        <Button size="sm" variant="secondary" onClick={goBilling}>
          View plan
        </Button>
      </Banner>
    );
  }

  // Scheduled to cancel (amber)
  if (state.cancelAtPeriodEnd) {
    return (
      <Banner tone="warning" icon={<AlertTriangle className="h-5 w-5" />}>
        <span className="flex-1">
          Your subscription is set to cancel on {formatDate(state.currentPeriodEnd)}. You can resume anytime before then.
        </span>
        <Button size="sm" variant="secondary" onClick={goBilling}>
          Resume
        </Button>
      </Banner>
    );
  }

  return null;
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "danger" | "warning";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles =
    tone === "danger"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400";
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {icon}
      {children}
    </div>
  );
}
