import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { confirmProduction } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Loader2, XCircle } from "lucide-react";

const ConfirmOrder = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setState("error");
      setMessage("This confirmation link is missing its token.");
      return;
    }
    confirmProduction(token)
      .then((r) => {
        setState("ok");
        setMessage(
          r.alreadyConfirmed
            ? "This order is already confirmed and in production."
            : "Thanks! Your order is confirmed and production has started.",
        );
      })
      .catch((e: any) => {
        setState("error");
        setMessage(e.message || "We couldn't confirm this order.");
      });
  }, [params]);

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {state === "loading" && <Loader2 className="h-14 w-14 animate-spin mx-auto mb-3 text-primary" />}
          {state === "ok" && <CheckCircle className="h-14 w-14 text-green-500 mx-auto mb-3" />}
          {state === "error" && <XCircle className="h-14 w-14 text-destructive mx-auto mb-3" />}
          <CardTitle className="text-2xl">
            {state === "loading" ? "Confirming…" : state === "ok" ? "Order confirmed" : "Couldn't confirm"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-muted-foreground">{message}</p>
          {state !== "loading" && (
            <div className="space-y-2">
              <Button onClick={() => navigate("/my-orders")} className="w-full" variant="hero">
                View My Orders
              </Button>
              <Button onClick={() => navigate("/")} variant="outline" className="w-full">
                Back to Home
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConfirmOrder;
