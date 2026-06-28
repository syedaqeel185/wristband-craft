import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, getOrderTimeline, getOrderTracking, type OrderTimelineItem, type OrderTracking } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Package } from "lucide-react";

interface Order {
  id: string;
  quantity: number;
  totalPrice: number;
  unitPrice: number;
  status: string;
  printType?: string;
  createdAt: string;
  design: {
    id: string;
    designUrl: string;
    customText: string | null;
    wristbandColor: string | null;
    wristbandType: string;
    canvasJson?: string | null;
  } | null;
}

const MyOrders = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [trackingByOrderId, setTrackingByOrderId] = useState<Record<string, OrderTracking>>({});
  const [timelineByOrderId, setTimelineByOrderId] = useState<Record<string, OrderTimelineItem[]>>({});
  const [loadingTrackingId, setLoadingTrackingId] = useState<string | null>(null);
  const [loadingTimelineId, setLoadingTimelineId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const data = await apiFetch("/orders/mine");
      setOrders(data || []);
    } catch (error) {
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const normalized = status.toUpperCase();
    if (normalized === "PLACED") return "bg-yellow-500";
    if (normalized === "ACCEPTED" || normalized === "IN_PRODUCTION") return "bg-blue-500";
    if (normalized === "SHIPPED") return "bg-indigo-500";
    if (normalized === "DELIVERED") return "bg-green-500";
    if (normalized === "CANCELLED") return "bg-red-500";
    return "bg-gray-500";
  };

  const loadTracking = async (orderId: string) => {
    if (trackingByOrderId[orderId]) return;
    setLoadingTrackingId(orderId);
    try {
      const tracking = await getOrderTracking(orderId);
      setTrackingByOrderId((prev) => ({ ...prev, [orderId]: tracking }));
    } catch {
      toast.error("Could not load tracking details");
    } finally {
      setLoadingTrackingId(null);
    }
  };

  const loadTimeline = async (orderId: string) => {
    if (timelineByOrderId[orderId]) return;
    setLoadingTimelineId(orderId);
    try {
      const timeline = await getOrderTimeline(orderId);
      setTimelineByOrderId((prev) => ({ ...prev, [orderId]: timeline }));
    } catch {
      toast.error("Could not load order timeline");
    } finally {
      setLoadingTimelineId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            My Orders
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <p className="text-sm text-muted-foreground max-w-4xl mx-auto mb-6">
          You can customize and reorder from your designs. Unit price and list totals come from the supplier you choose in
          the design studio, not from this screen.
        </p>
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-xl text-muted-foreground mb-6">No orders yet</p>
            <Button variant="hero" onClick={() => navigate("/design-studio")}>
              Create Your First Design
            </Button>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {orders.map((order) => (
              <Card key={order.id} className="hover:shadow-xl transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">
                      Order #{order.id.slice(0, 8)}
                    </CardTitle>
                    <Badge className={getStatusColor(order.status)}>
                      {order.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4">
                    {order.design && (
                      <div>
                        <img
                          src={order.design.designUrl}
                          alt="Order design"
                          className="w-full h-32 object-cover rounded-lg"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Type:</span>
                        <span className="font-semibold capitalize">{order.design?.wristbandType || "N/A"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Quantity:</span>
                        <span className="font-semibold">{order.quantity}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Unit Price:</span>
                        <span className="font-semibold">${order.unitPrice}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total:</span>
                        <span className="font-semibold text-primary">${order.totalPrice}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date:</span>
                        <span className="font-semibold">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {order.design?.customText && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Text:</span>
                          <span className="font-semibold">{order.design.customText}</span>
                        </div>
                      )}
                      
                      <div className="flex gap-2 pt-4 justify-end border-t mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => loadTracking(order.id)}
                          disabled={loadingTrackingId === order.id}
                        >
                          {loadingTrackingId === order.id ? "Loading..." : "Track Order"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => loadTimeline(order.id)}
                          disabled={loadingTimelineId === order.id}
                        >
                          {loadingTimelineId === order.id ? "Loading..." : "View Timeline"}
                        </Button>
                        {order.design?.designUrl && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              const link = document.createElement("a");
                              link.href = order.design!.designUrl;
                              link.download = `order-design-${order.id.slice(0, 8)}.png`;
                              link.target = "_blank";
                              link.click();
                            }}
                          >
                            Download Design
                          </Button>
                        )}
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={() => {
                            navigate("/design-studio", {
                              state: {
                                editDesign: {
                                  canvasJson: order.design?.canvasJson || undefined,
                                  orderDetails: {
                                    wristband_color: order.design?.wristbandColor || undefined,
                                    wristband_type: order.design?.wristbandType,
                                    quantity: order.quantity,
                                    print_type: order.printType || "none",
                                    trademark_text: order.design?.customText || "",
                                  },
                                },
                              },
                            });
                          }}
                        >
                          Customize again
                        </Button>
                      </div>
                      {trackingByOrderId[order.id] && (
                        <div className="mt-3 rounded border p-3 text-sm bg-muted/40">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Courier:</span>
                            <span>{trackingByOrderId[order.id].courier || "-"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tracking No:</span>
                            <span>{trackingByOrderId[order.id].trackingNumber || "-"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Shipped At:</span>
                            <span>
                              {trackingByOrderId[order.id].shippedAt
                                ? new Date(trackingByOrderId[order.id].shippedAt as string).toLocaleString()
                                : "-"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Estimated Delivery:</span>
                            <span>
                              {trackingByOrderId[order.id].estimatedDelivery
                                ? new Date(trackingByOrderId[order.id].estimatedDelivery as string).toLocaleDateString()
                                : "-"}
                            </span>
                          </div>
                          {trackingByOrderId[order.id].trackingUrl && (
                            <div className="pt-2">
                              <a
                                href={trackingByOrderId[order.id].trackingUrl as string}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary underline"
                              >
                                Open tracking link
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                      {timelineByOrderId[order.id] && (
                        <div className="mt-3 rounded border p-3 text-sm bg-muted/40">
                          <div className="font-semibold mb-2">Order Timeline</div>
                          <div className="space-y-2">
                            {timelineByOrderId[order.id].map((item) => (
                              <div key={item.id} className="flex items-start justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0">
                                <div>
                                  <div className="font-medium">{item.toStatus}</div>
                                  {item.note && <div className="text-muted-foreground">{item.note}</div>}
                                </div>
                                <div className="text-muted-foreground whitespace-nowrap">
                                  {new Date(item.createdAt).toLocaleString()}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MyOrders;
