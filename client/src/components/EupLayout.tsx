import { NavLink, useNavigate } from "react-router-dom";
import { Factory, Users, Tags, Truck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { clearToken } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Chrome for the EUP console.
 *
 * EUP manufactures and sells to suppliers, so this deliberately shares nothing
 * with the supplier console: no Products / Pricing / Billing / Delivery nav, no
 * "Supplier Dashboard" title. EUP's account still carries a Supplier row
 * underneath (it anchors products and payouts) but that is an implementation
 * detail the operator should never see.
 */
const NAV = [
  { to: "/eup", end: true, label: "Orders", icon: Factory },
  { to: "/eup/suppliers", label: "Suppliers", icon: Users },
  { to: "/eup/prices", label: "Price lists", icon: Tags },
  { to: "/eup/freight", label: "Freight", icon: Truck },
];

export default function EupLayout({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();

  const signOut = () => {
    clearToken();
    navigate("/supplier-login");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4 flex-wrap">
            <BrandLogo className="h-9 w-auto" />
            <div className="flex-1 min-w-[12rem]">
              <h1 className="text-xl font-bold">EUP Console</h1>
              <p className="text-xs text-muted-foreground">
                European Promotion — manufacturing &amp; wholesale to suppliers
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>

          <nav className="flex flex-wrap gap-1 mt-4 -mb-px">
            {NAV.map(({ to, end, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "border-primary text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-[16rem]">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description ? (
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            ) : null}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
