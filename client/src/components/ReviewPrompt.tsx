import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getPendingReviews, createSupplierReview } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Star } from "lucide-react";
import { toast } from "sonner";

const DISMISS_KEY = "review_prompt_dismissed";

/**
 * App-level prompt: once a supplier marks an order DELIVERED, the next time the
 * customer opens the site they're invited to review that supplier. Dismissible
 * for the session; reappears next visit until a review is left.
 */
export const ReviewPrompt = () => {
  const location = useLocation();
  const [pending, setPending] = useState<{ supplierId: string; companyName: string }[]>([]);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Don't pop on auth/checkout/confirmation screens.
    const skip = ["/auth", "/payment-success", "/confirm-order", "/address"].some((p) =>
      location.pathname.startsWith(p),
    );
    if (skip) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    (async () => {
      const user = await getCurrentUser();
      if (!user) return;
      const list = await getPendingReviews().catch(() => []);
      if (list.length) {
        setPending(list);
        setIdx(0);
        setOpen(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = pending[idx];

  const close = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  };

  const next = () => {
    setComment("");
    setRating(5);
    if (idx + 1 < pending.length) setIdx(idx + 1);
    else setOpen(false);
  };

  const submit = async () => {
    if (!current) return;
    setSubmitting(true);
    try {
      await createSupplierReview(current.supplierId, rating, comment.trim() || undefined);
      toast.success(`Thanks for reviewing ${current.companyName}!`);
      next();
    } catch (e: any) {
      toast.error(e.message || "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>How was your order from {current.companyName}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your order was delivered — share your experience to help other customers.
          </p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={`h-8 w-8 cursor-pointer ${n <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
                onClick={() => setRating(n)}
              />
            ))}
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Tell others about the quality, speed, communication… (optional)"
          />
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={close}>
              Maybe later
            </Button>
            <div className="flex gap-2">
              {pending.length > 1 && (
                <Button variant="outline" onClick={next}>
                  Skip
                </Button>
              )}
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit review"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
