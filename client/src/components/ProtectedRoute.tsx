import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { apiFetch } from "@/lib/api";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    apiFetch('/auth/me')
      .then((data) => {
        setAuthenticated(true);
        setUserRoles(data.roles || []);
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  const isSupplierOrAdmin = userRoles.includes('supplier') || userRoles.includes('admin');
  // Each console has its own home: platform owners on /platform, EUP on /eup,
  // suppliers on /supplier. An EUP account also carries the `supplier` role
  // (its Supplier row anchors products and payouts), so `eup` is checked first.
  const homePath = userRoles.includes('admin')
    ? '/platform'
    : userRoles.includes('eup')
      ? '/eup'
      : '/supplier';
  const consolePaths = ['/supplier', '/platform', '/eup'];

  if (allowedRoles) {
    const hasRole = allowedRoles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      return <Navigate to={isSupplierOrAdmin ? homePath : "/dashboard"} replace />;
    }
  } else if (isSupplierOrAdmin && !consolePaths.some((p) => location.pathname.startsWith(p))) {
    // Suppliers can use the same shopping / design flow as customers; other
    // non-console areas redirect to their home dashboard.
    const customerFlowPaths = [
      "/design-studio",
      "/order-summary",
      "/address",
      "/my-designs",
      "/my-orders",
      "/payment-success",
    ];
    const isCustomerFlow = customerFlowPaths.some(
      (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
    );
    if (isCustomerFlow) {
      return <>{children}</>;
    }
    return <Navigate to={homePath} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
