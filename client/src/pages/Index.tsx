import { Link, useNavigate } from "react-router-dom";
import { apiFetch, clearToken, getCart } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import heroImage from "@/assets/hero-wristbands.jpg";
import { Palette, Zap, ShieldCheck, ArrowRight, LogOut, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getCurrentUser } from "@/lib/session";
import { SuppliersShowcase } from "@/components/SuppliersShowcase";

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [userName, setUserName] = useState<string>("");
  const [isSupplier, setIsSupplier] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    setUser(currentUser);
    const supplierRole = !!currentUser.roles?.includes("supplier");
    setIsSupplier(supplierRole);
    if (!supplierRole) {
      getCart().then((c) => setCartCount(c.count)).catch(() => {});
    }
    const supplier = await apiFetch("/suppliers/me").catch(() => null);
    if (supplier?.companyName) {
      setUserName(supplier.companyName);
      return;
    }

    setUserName(currentUser.fullName || currentUser.email?.split("@")[0] || "User");
  };

  const handleSignOut = async () => {
    clearToken();
    setUser(null);
    setUserName("");
    toast.success("Signed out successfully");
  };

  useEffect(() => {
    try {
      const openNew = localStorage.getItem("open_new_design");
      if (openNew === "true") {
        localStorage.removeItem("open_new_design");
        // Small delay to ensure app mounts correctly before navigation
        setTimeout(() => {
          navigate("/design-studio");
          toast.success("Opened new design studio");
        }, 50);
      }
    } catch (e) {
      // ignore
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Hero Section */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <Link to="/">
            <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent cursor-pointer hover:opacity-80 transition-opacity">
              EU Wristbands
            </h1>
          </Link>
          <div className="flex gap-3 items-center">
            {user ? (
              <>
                <span className="text-sm font-medium text-foreground">
                  Welcome, {userName}
                </span>
                {!isSupplier && (
                  <Button variant="outline" size="sm" className="relative" onClick={() => navigate("/order-summary")}>
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Cart
                    {cartCount > 0 && (
                      <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                        {cartCount}
                      </span>
                    )}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => navigate("/dashboard")}>
                  Dashboard
                </Button>
                <Button variant="ghost" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate("/supplier-login")}>
                  Supplier Login
                </Button>
                <Button variant="ghost" onClick={() => navigate("/auth")}>
                  Sign In
                </Button>
                <Button variant="hero" onClick={() => navigate("/auth")}>
                  Get Started
                </Button>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="container mx-auto px-4 py-20 text-center">
          <div className="max-w-4xl mx-auto animate-fade-in">
            <h2 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
              Design Your Perfect Wristband
            </h2>
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Create custom wristbands with your own designs, text, and colors. Professional quality, delivered to your door.
            </p>
            <div className="flex gap-4 justify-center mb-12">
              <Button size="lg" variant="hero" onClick={() => navigate("/auth")}>
                Start Designing <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/auth")}>
                View Examples
              </Button>
            </div>
            <img
              src={heroImage}
              alt="Custom wristbands showcase"
              className="rounded-2xl shadow-2xl mx-auto animate-float"
            />
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-4 py-20">
          <h3 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Why Choose EU Wristbands?
          </h3>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="hover:shadow-xl transition-shadow animate-scale-in">
              <CardContent className="pt-6 text-center">
                <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Palette className="h-8 w-8 text-primary" />
                </div>
                <h4 className="text-xl font-semibold mb-2">Easy Design Studio</h4>
                <p className="text-muted-foreground">
                  Intuitive tools to upload images, add text, and customize colors in real-time
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-xl transition-shadow animate-scale-in" style={{ animationDelay: "0.1s" }}>
              <CardContent className="pt-6 text-center">
                <div className="bg-accent/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-8 w-8 text-accent" />
                </div>
                <h4 className="text-xl font-semibold mb-2">Fast Production</h4>
                <p className="text-muted-foreground">
                  Quick turnaround times with professional-grade manufacturing
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-xl transition-shadow animate-scale-in" style={{ animationDelay: "0.2s" }}>
              <CardContent className="pt-6 text-center">
                <div className="bg-secondary/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck className="h-8 w-8 text-secondary-foreground" />
                </div>
                <h4 className="text-xl font-semibold mb-2">Quality Guaranteed</h4>
                <p className="text-muted-foreground">
                  Durable materials and vibrant prints that last
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Suppliers directory — shown to customers & visitors, hidden for signed-in suppliers */}
        {!isSupplier && <SuppliersShowcase />}

        {/* CTA */}
        <section className="container mx-auto px-4 py-20 text-center">
          <div className="bg-gradient-primary rounded-3xl p-12 md:p-16 shadow-2xl">
            <h3 className="text-3xl md:text-5xl font-bold text-white mb-4">
              Ready to Get Started?
            </h3>
            <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
              Join thousands of satisfied customers creating custom wristbands
            </p>
            <Button size="lg" variant="secondary" onClick={() => navigate("/auth")}>
              Create Your Account
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t mt-20 py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2024 EU Wristbands. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
