import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearToken, getCart } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Palette, FileImage, Package, LogOut, ShoppingCart } from "lucide-react";
import { DashboardSuppliers } from "@/components/DashboardSuppliers";
import { BrandLogo } from "@/components/BrandLogo";

const Dashboard = () => {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState("");
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    const getUser = async () => {
      const user = await getCurrentUser();
      if (user) {
        setUserEmail(user.email || "");
        getCart().then((c) => setCartCount(c.count)).catch(() => {});
      } else {
        navigate("/auth");
      }
    };
    getUser();
  }, [navigate]);

  const handleLogout = async () => {
    clearToken();
    toast.success("Signed out successfully");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <BrandLogo className="h-9 md:h-10 w-auto" />
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{userEmail}</span>
            <Button variant="outline" size="sm" className="relative" onClick={() => navigate("/order-summary")}>
              <ShoppingCart className="h-4 w-4 mr-2" />
              Cart
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-4xl font-bold mb-4">Welcome to Your Dashboard</h2>
          <p className="text-xl text-muted-foreground">
            Start creating your custom wristbands today
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <Card className="hover:shadow-xl transition-shadow cursor-pointer animate-scale-in" onClick={() => navigate("/design-studio")}>
            <CardHeader>
              <Palette className="h-12 w-12 text-primary mb-2" />
              <CardTitle>Design Studio</CardTitle>
              <CardDescription>Create and customize your wristband design</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="hero" className="w-full">
                Start Designing
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-xl transition-shadow cursor-pointer animate-scale-in" style={{ animationDelay: "0.1s" }} onClick={() => navigate("/my-designs")}>
            <CardHeader>
              <FileImage className="h-12 w-12 text-accent mb-2" />
              <CardTitle>My Designs</CardTitle>
              <CardDescription>View and manage your saved designs</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="accent" className="w-full">
                View Designs
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-xl transition-shadow cursor-pointer animate-scale-in" style={{ animationDelay: "0.2s" }} onClick={() => navigate("/my-orders")}>
            <CardHeader>
              <Package className="h-12 w-12 text-secondary-foreground mb-2" />
              <CardTitle>My Orders</CardTitle>
              <CardDescription>Track your wristband orders</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" className="w-full">
                View Orders
              </Button>
            </CardContent>
          </Card>
        </div>

        <DashboardSuppliers />
      </main>
    </div>
  );
};

export default Dashboard;
