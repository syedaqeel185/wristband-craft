import { Link, useNavigate } from "react-router-dom";
import { apiFetch, clearToken, getCart } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import heroBanner from "@/assets/euw/hero-banner.jpg";
import euwLogo from "@/assets/euw/logo.png";
import shippingImg from "@/assets/euw/shipping.jpg";
import { BrandLogo } from "@/components/BrandLogo";
import saferImg from "@/assets/euw/safer-guests.jpg";
import {
  ArrowRight,
  LogOut,
  ShoppingCart,
  Droplets,
  ShieldCheck,
  Feather,
  PenTool,
  Palette,
  Lock,
  Globe,
  Clock,
  Truck,
  MapPin,
  Sparkles,
  Building2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getCurrentUser } from "@/lib/session";
import { SuppliersShowcase } from "@/components/SuppliersShowcase";

// EUW brand palette (kept local to the landing page so the app theme is untouched)
const NAVY = "#0b2559";
const BLUE = "#1e5bff";
const ORANGE = "#f5821f";

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
        setTimeout(() => {
          navigate("/design-studio");
          toast.success("Opened new design studio");
        }, 50);
      }
    } catch {
      // ignore
    }
  }, [navigate]);

  const scrollToSuppliers = () => {
    document.getElementById("suppliers")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-white text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b">
        <nav className="container mx-auto px-4 py-3 flex justify-between items-center">
          <BrandLogo className="h-9 md:h-11 w-auto" />

          <div className="flex gap-1.5 md:gap-3 items-center">
            {user ? (
              <>
                <span className="hidden md:block text-sm font-medium text-slate-600">Welcome, {userName}</span>
                {!isSupplier && (
                  <Button variant="outline" size="sm" className="relative" onClick={() => navigate("/order-summary")}>
                    <ShoppingCart className="h-4 w-4 md:mr-2" />
                    <span className="hidden md:inline">Cart</span>
                    {cartCount > 0 && (
                      <span className="absolute -top-2 -right-2 bg-[#1e5bff] text-white text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                        {cartCount}
                      </span>
                    )}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>Dashboard</Button>
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Sign Out</span>
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/supplier-login")}>
                  Supplier Login
                </Button>
                <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => navigate("/auth")}>
                  Sign In
                </Button>
                <Button
                  size="sm"
                  className="text-white"
                  style={{ backgroundColor: BLUE }}
                  onClick={() => navigate("/auth")}
                >
                  Get Started
                </Button>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="container mx-auto px-4 pt-12 pb-16 md:pt-16">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="animate-fade-in">
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full mb-5"
                style={{ backgroundColor: `${BLUE}14`, color: BLUE }}
              >
                <Sparkles className="h-3.5 w-3.5" /> Premium wristbands · Made in Europe
              </span>
              <h1 className="text-4xl md:text-6xl font-extrabold leading-tight" style={{ color: NAVY }}>
                Design. Order.{" "}
                <span style={{ color: ORANGE }}>Stand Out.</span>
              </h1>
              <p className="text-lg text-slate-600 mt-5 max-w-xl">
                Create premium-quality festival wristbands at Europe's lowest prices with trusted European suppliers.
                Produced within <strong>24 hours</strong> and delivered in just a few days.
              </p>
              <div className="flex flex-wrap gap-3 mt-7">
                <Button size="lg" className="text-white" style={{ backgroundColor: BLUE }} onClick={() => navigate("/auth")}>
                  Create an account <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button size="lg" variant="outline" onClick={scrollToSuppliers}>
                  Find a supplier
                </Button>
              </div>
              {/* Material trust chips */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-8 text-sm text-slate-600">
                <span className="flex items-center gap-2"><Droplets className="h-4 w-4" style={{ color: BLUE }} /> Water resistant</span>
                <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" style={{ color: BLUE }} /> Tear resistant</span>
                <span className="flex items-center gap-2"><Feather className="h-4 w-4" style={{ color: BLUE }} /> Lightweight &amp; comfortable</span>
              </div>
            </div>

            <div className="animate-float">
              <img
                src={heroBanner}
                alt="Tyvek wristbands made for every event"
                className="rounded-2xl shadow-2xl w-full"
                loading="eager"
              />
            </div>
          </div>
        </section>

        {/* Value props */}
        <section className="border-y bg-slate-50">
          <div className="container mx-auto px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: PenTool, title: "Fully customizable", sub: "Your design, your brand" },
              { icon: Palette, title: "Vibrant colors", sub: "High-quality print" },
              { icon: Lock, title: "Secure", sub: "Tamper-evident" },
              { icon: Globe, title: "Fast delivery", sub: "Across Europe" },
            ].map((f) => (
              <div key={f.title} className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${ORANGE}1a` }}>
                  <f.icon className="h-5 w-5" style={{ color: ORANGE }} />
                </div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: NAVY }}>{f.title}</div>
                  <div className="text-xs text-slate-500">{f.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works 1-2-3 */}
        <section className="container mx-auto px-4 py-16">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-3xl md:text-4xl font-bold" style={{ color: NAVY }}>
              Your custom wristbands in 1&nbsp;·&nbsp;2&nbsp;·&nbsp;3
            </h2>
            <p className="text-slate-600 mt-3">
              Choose a trusted supplier in your country, create your perfect wristbands, and place your order in
              minutes. Fast, easy, and hassle-free.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { n: "1", icon: MapPin, title: "Choose a supplier", sub: "Pick a trusted EUW supplier in your country." },
              { n: "2", icon: PenTool, title: "Design your band", sub: "Add your logo, text and colors in the studio." },
              { n: "3", icon: ShoppingCart, title: "Order in minutes", sub: "Place your order — it goes straight to the supplier." },
            ].map((s, i) => (
              <Card key={s.n} className="relative hover:shadow-xl transition-shadow animate-scale-in" style={{ animationDelay: `${i * 0.08}s` }}>
                <CardContent className="pt-8 text-center">
                  <div
                    className="absolute -top-4 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full text-white text-sm font-bold flex items-center justify-center"
                    style={{ backgroundColor: BLUE }}
                  >
                    {s.n}
                  </div>
                  <s.icon className="h-8 w-8 mx-auto mb-3" style={{ color: BLUE }} />
                  <h3 className="text-lg font-semibold mb-1" style={{ color: NAVY }}>{s.title}</h3>
                  <p className="text-sm text-slate-500">{s.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Suppliers directory — customers & visitors only */}
        {!isSupplier && (
          <div id="suppliers" className="bg-slate-50 border-y scroll-mt-20">
            <SuppliersShowcase />
          </div>
        )}

        {/* Shipping & production */}
        <section className="container mx-auto px-4 py-16">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: NAVY }}>
                Fast production. Fast delivery.
              </h2>
              <p className="text-slate-600 mb-6">
                Made in Europe and shipped with DHL across the continent — transparent pricing, no surprises.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <Clock className="h-5 w-5 mt-0.5" style={{ color: BLUE }} />
                  <span><strong style={{ color: NAVY }}>Same-day</strong> production for unprinted bands, <strong style={{ color: NAVY }}>1–2 days</strong> for printed.</span>
                </li>
                <li className="flex items-start gap-3">
                  <Truck className="h-5 w-5 mt-0.5" style={{ color: BLUE }} />
                  <span>DHL shipping from <strong style={{ color: NAVY }}>€23</strong> (100–5,000 pcs). Europe delivery in <strong style={{ color: NAVY }}>1–2 days</strong>.</span>
                </li>
                <li className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 mt-0.5" style={{ color: BLUE }} />
                  <span>Made in Europe — quality you can trust.</span>
                </li>
              </ul>
            </div>
            <div className="max-w-sm mx-auto">
              <img src={shippingImg} alt="Shipping prices and production times" className="rounded-2xl shadow-xl w-full border" />
            </div>
          </div>
        </section>

        {/* Safer Guests */}
        <section className="bg-slate-50 border-y">
          <div className="container mx-auto px-4 py-16 grid lg:grid-cols-2 gap-10 items-center">
            <div className="max-w-sm mx-auto order-2 lg:order-1">
              <img src={saferImg} alt="Safer Guests wristband safety system" className="rounded-2xl shadow-xl w-full border" />
            </div>
            <div className="order-1 lg:order-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full mb-4" style={{ backgroundColor: "#16a34a1a", color: "#16a34a" }}>
                <ShieldCheck className="h-3.5 w-3.5" /> Optional add-on
              </span>
              <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: NAVY }}>
                Safer Guests — safety built into the band
              </h2>
              <p className="text-slate-600 mb-4">
                A QR control system for authorized security and first-aid teams at events. Guests register their
                wristband via the app and store GDPR-friendly details like next of kin, medication or allergies — so
                staff can give the right help, fast.
              </p>
              <p className="text-sm text-slate-500">
                Add it at checkout: <strong style={{ color: NAVY }}>no setup cost + €2.50 per 100 pcs</strong>.
              </p>
            </div>
          </div>
        </section>

        {/* Supplier CTA */}
        <section className="container mx-auto px-4 py-16">
          <div className="rounded-3xl p-10 md:p-14 text-white grid md:grid-cols-[1.4fr_1fr] gap-8 items-center" style={{ backgroundColor: NAVY }}>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-3">Sell on EUW — become a supplier</h2>
              <p className="text-white/80 mb-6 max-w-xl">
                Join EUW as a supplier and offer your customers unbeatable quality, speed, and pricing.
                Manage your own products, payments and orders — we handle European production.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" className="text-white" style={{ backgroundColor: ORANGE }} onClick={() => navigate("/supplier-signup")}>
                  <Building2 className="mr-2 h-5 w-5" /> Become a Supplier
                </Button>
                <Button size="lg" variant="outline" className="bg-transparent text-white border-white/40 hover:bg-white/10" onClick={() => navigate("/supplier-login")}>
                  Supplier Login
                </Button>
              </div>
            </div>
            <div className="hidden md:flex bg-white rounded-2xl p-8 items-center justify-center">
              <img src={euwLogo} alt="EUW — Europe Wristbands" className="w-full" />
            </div>
          </div>
        </section>

        {/* Final customer CTA */}
        <section className="container mx-auto px-4 pb-20">
          <div className="rounded-3xl p-12 md:p-16 text-center" style={{ background: `linear-gradient(135deg, ${BLUE}, ${NAVY})` }}>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">Ready to get started?</h2>
            <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
              Join thousands of satisfied customers creating custom wristbands now.
            </p>
            <Button size="lg" className="bg-white hover:bg-white/90" style={{ color: NAVY }} onClick={() => navigate("/auth")}>
              Create your account
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="text-white" style={{ backgroundColor: "#081b40" }}>
        <div className="container mx-auto px-4 py-12 grid md:grid-cols-3 gap-8 items-start">
          <div>
            <span className="text-2xl font-extrabold">EU<span style={{ color: BLUE }}>W</span></span>
            <p className="text-white/60 text-sm mt-2 max-w-xs">
              Your design, our passion, European quality. Premium festival wristbands, made in Europe.
            </p>
          </div>
          <div className="text-sm space-y-2">
            <div className="font-semibold text-white/90 mb-2">Get started</div>
            <button className="block text-white/70 hover:text-white" onClick={() => navigate("/auth")}>Create a customer account</button>
            <button className="block text-white/70 hover:text-white" onClick={() => navigate("/supplier-signup")}>Sell on EUW (supplier)</button>
            <button className="block text-white/70 hover:text-white" onClick={() => navigate("/supplier-login")}>Supplier login</button>
          </div>
          <div className="text-sm text-white/60">
            <div className="font-semibold text-white/90 mb-2">Why EUW</div>
            <p>Made in Europe · DHL delivery in 1–2 days · Produced within 24 hours · Tamper-evident quality.</p>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="container mx-auto px-4 py-5 text-center text-white/50 text-sm">
            &copy; {new Date().getFullYear()} EUW — Europe Wristbands. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
