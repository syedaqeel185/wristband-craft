import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch, confirmPayment } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const sessionId = searchParams.get("session_id");
      const legacyOrderId = searchParams.get("order_id");

      try {
        if (sessionId) {
          // Verify the Stripe session server-side (source of truth).
          const result = await confirmPayment(sessionId);
          if (!result.paid) {
            setError("Payment is still pending. If you completed payment, refresh in a moment.");
          } else {
            toast.success("Payment successful! Your order is ready for production.");
          }
        } else if (legacyOrderId) {
          // Legacy/mock path (no Stripe session).
          await apiFetch(`/orders/${legacyOrderId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: "ACCEPTED", paymentStatus: "paid" }),
          });
          toast.success("Payment confirmed.");
        } else {
          setError("No payment session found.");
        }
      } catch (err: any) {
        setError(err.message || "Failed to confirm payment");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-lg">Confirming your payment...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Payment Verification Failed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={() => navigate("/my-orders")} className="w-full">
              View My Orders
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <CardTitle className="text-2xl">Payment Successful!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-4 text-center">
            <p className="font-medium">Please check your email to confirm your order.</p>
            <p className="text-sm text-muted-foreground mt-1">
              We've sent a confirmation link to your inbox. Production starts as soon as you confirm.
            </p>
          </div>
          <div className="space-y-2">
            <Button onClick={() => navigate("/my-orders")} className="w-full" variant="hero">
              View My Orders
            </Button>
            <Button onClick={() => navigate("/design-studio")} variant="outline" className="w-full">
              Create Another Design
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSuccess;
