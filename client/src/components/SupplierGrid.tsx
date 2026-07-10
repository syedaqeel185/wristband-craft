import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type DirectorySupplier,
  type SupplierReview,
  getSupplierReviews,
  getCanReview,
  createSupplierReview,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Star, MapPin, Palette, Loader2, BadgeCheck } from "lucide-react";
import { toast } from "sonner";

export const Stars = ({ value, size = 16, onPick }: { value: number; size?: number; onPick?: (n: number) => void }) => (
  <div className="flex">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star
        key={n}
        style={{ width: size, height: size }}
        className={`${n <= Math.round(value) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"} ${onPick ? "cursor-pointer" : ""}`}
        onClick={onPick ? () => onPick(n) : undefined}
      />
    ))}
  </div>
);

const ReviewsDialog = ({ supplier, onClose }: { supplier: DirectorySupplier; onClose: () => void }) => {
  const [reviews, setReviews] = useState<SupplierReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [canReview, setCanReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [list, user] = await Promise.all([getSupplierReviews(supplier.id), getCurrentUser()]);
        setReviews(list);
        if (user) {
          const res = await getCanReview(supplier.id).catch(() => null);
          setCanReview(!!res?.canReview);
          if (res?.existingReview) {
            setRating(res.existingReview.rating);
            setComment(res.existingReview.comment || "");
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [supplier.id]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const updated = await createSupplierReview(supplier.id, rating, comment.trim() || undefined);
      setReviews(updated);
      toast.success("Thanks for your review!");
    } catch (e: any) {
      toast.error(e.message || "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier.companyName} — Reviews</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {canReview && (
              <div className="border rounded-lg p-3 bg-secondary/10 space-y-2">
                <p className="text-sm font-medium">Leave a review</p>
                <Stars value={rating} size={22} onPick={setRating} />
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="How was your experience?"
                />
                <Button size="sm" onClick={submit} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit review"}
                </Button>
              </div>
            )}

            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No reviews yet.</p>
            ) : (
              reviews.map((r) => (
                <div key={r.id} className="border-b pb-3 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{r.reviewer}</span>
                    <Stars value={r.rating} />
                  </div>
                  {r.comment && <p className="text-sm text-muted-foreground mt-1">{r.comment}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** Reusable grid of supplier cards (used on the homepage and the dashboard). */
export const SupplierGrid = ({
  suppliers,
  emptyText = "No suppliers yet.",
}: {
  suppliers: DirectorySupplier[];
  emptyText?: string;
}) => {
  const navigate = useNavigate();
  const [reviewing, setReviewing] = useState<DirectorySupplier | null>(null);

  const designWith = (supplierId: string) => {
    // Persist intent so it survives the auth redirect, then open the studio.
    localStorage.setItem("preferred_supplier", supplierId);
    navigate("/design-studio");
  };

  if (suppliers.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">{emptyText}</p>;
  }

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {suppliers.map((s) => (
          <Card key={s.id} className="hover:shadow-xl transition-shadow flex flex-col">
            <CardContent className="pt-6 flex-1 flex flex-col">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-lg font-semibold">{s.companyName}</h4>
                {s.isVerified && <BadgeCheck className="h-4 w-4 text-primary" />}
                {s.isLocal && (
                  <Badge variant="secondary" className="text-xs">
                    Local
                  </Badge>
                )}
              </div>
              {(s.city || s.country || s.countryCode) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                  {s.countryCode ? (
                    <img
                      src={`https://flagcdn.com/20x15/${s.countryCode.toLowerCase()}.png`}
                      alt={s.countryCode}
                      width={18}
                      height={13}
                      className="rounded-[2px] shrink-0"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <MapPin className="h-3 w-3" />
                  )}
                  {[s.city, s.country].filter(Boolean).join(", ") || s.countryCode}
                </p>
              )}

              <button
                className="flex items-center gap-2 mt-2 text-sm hover:underline"
                onClick={() => setReviewing(s)}
                title="View reviews"
              >
                <Stars value={s.rating} />
                <span className="text-muted-foreground">
                  {s.rating > 0 ? s.rating.toFixed(1) : "New"} · {s.reviewCount} review{s.reviewCount === 1 ? "" : "s"}
                </span>
              </button>

              {s.description && <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{s.description}</p>}

              <div className="mt-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Palette className="h-3 w-3" /> Services
                </p>
                <div className="flex flex-wrap gap-1">
                  {s.services.length > 0 ? (
                    s.services.map((svc) => (
                      <Badge key={svc} variant="secondary" className="capitalize">
                        {svc}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No products listed yet</span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t mt-auto">
                <Button className="flex-1" onClick={() => designWith(s.id)}>
                  Design with this supplier
                </Button>
                <Button variant="outline" onClick={() => setReviewing(s)}>
                  Reviews
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {reviewing && <ReviewsDialog supplier={reviewing} onClose={() => setReviewing(null)} />}
    </>
  );
};
