import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import DesignStudio from "./pages/DesignStudio";
import MyDesigns from "./pages/MyDesigns";
import MyOrders from "./pages/MyOrders";
import AdminDashboard from "./pages/AdminDashboard";
import AdminPasswordReset from "./pages/AdminPasswordReset";
import SupplierLogin from "./pages/SupplierLogin";
import SupplierSignup from "./pages/SupplierSignup";
import PaymentSuccess from "./pages/PaymentSuccess";
import ConfirmOrder from "./pages/ConfirmOrder";
import OrderSummary from "./pages/OrderSummary";
import Address from "./pages/Address";
import Payment from "./pages/Payment";
import ProtectedRoute from "./components/ProtectedRoute";
import { ReviewPrompt } from "./components/ReviewPrompt";
import NotFound from "./pages/NotFound";
import SupplierPricing from "./pages/SupplierPricing";
import SupplierDesigns from "./pages/SupplierDesigns";
import SupplierProducts from "./pages/SupplierProducts";
import SupplierBilling from "./pages/SupplierBilling";
import SupplierPayments from "./pages/SupplierPayments";
import SupplierShipping from "./pages/SupplierShipping";
import SupplierProfile from "./pages/SupplierProfile";
import SupplierWholesaler from "./pages/SupplierWholesaler";
import PlatformDashboard from "./pages/PlatformDashboard";
import EupDashboard from "./pages/EupDashboard";
import EupPrices from "./pages/EupPrices";
import EupFreight from "./pages/EupFreight";
import EupSuppliers from "./pages/EupSuppliers";
import EupPayments from "./pages/EupPayments";

// Removed clearOldSessions() to fix persistent login issue


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ReviewPrompt />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/supplier-login" element={<SupplierLogin />} />
          <Route path="/supplier-signup" element={<SupplierSignup />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/confirm-order" element={<ConfirmOrder />} />
          {/* Public supplier storefront */}
          <Route path="/suppliers/:id" element={<SupplierProfile />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/design-studio"
            element={
              <ProtectedRoute>
                <DesignStudio />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-designs"
            element={
              <ProtectedRoute>
                <MyDesigns />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-orders"
            element={
              <ProtectedRoute>
                <MyOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/order-summary"
            element={
              <ProtectedRoute>
                <OrderSummary />
              </ProtectedRoute>
            }
          />
          <Route
            path="/address"
            element={
              <ProtectedRoute>
                <Address />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pay"
            element={
              <ProtectedRoute>
                <Payment />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier"
            element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier/reset-password"
            element={
              <ProtectedRoute>
                <AdminPasswordReset />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier/pricing"
            element={
              <ProtectedRoute allowedRoles={['supplier']}>
                <SupplierPricing />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier/designs"
            element={
              <ProtectedRoute allowedRoles={['supplier', 'admin']}>
                <SupplierDesigns />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier/products"
            element={
              <ProtectedRoute allowedRoles={['supplier']}>
                <SupplierProducts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier/billing"
            element={
              <ProtectedRoute allowedRoles={['supplier']}>
                <SupplierBilling />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier/payments"
            element={
              <ProtectedRoute allowedRoles={['supplier']}>
                <SupplierPayments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier/shipping"
            element={
              <ProtectedRoute allowedRoles={['supplier']}>
                <SupplierShipping />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier/wholesaler"
            element={
              <ProtectedRoute allowedRoles={['supplier']}>
                <SupplierWholesaler />
              </ProtectedRoute>
            }
          />
          <Route
            path="/platform"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <PlatformDashboard />
              </ProtectedRoute>
            }
          />
          {/* EUP console — the manufacturer that sells to suppliers. Separate
              from /supplier: EUP has no retail storefront, products or billing. */}
          <Route
            path="/eup"
            element={
              <ProtectedRoute allowedRoles={['eup']}>
                <EupDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/eup/suppliers"
            element={
              <ProtectedRoute allowedRoles={['eup']}>
                <EupSuppliers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/eup/prices"
            element={
              <ProtectedRoute allowedRoles={['eup']}>
                <EupPrices />
              </ProtectedRoute>
            }
          />
          <Route
            path="/eup/freight"
            element={
              <ProtectedRoute allowedRoles={['eup']}>
                <EupFreight />
              </ProtectedRoute>
            }
          />
          <Route
            path="/eup/payments"
            element={
              <ProtectedRoute allowedRoles={['eup']}>
                <EupPayments />
              </ProtectedRoute>
            }
          />
          {/* Back-compat: the supplier console used to live under /admin. */}
          <Route path="/admin" element={<Navigate to="/supplier" replace />} />
          <Route path="/admin/products" element={<Navigate to="/supplier/products" replace />} />
          <Route path="/admin/pricing" element={<Navigate to="/supplier/pricing" replace />} />
          <Route path="/admin/designs" element={<Navigate to="/supplier/designs" replace />} />
          <Route path="/admin/billing" element={<Navigate to="/supplier/billing" replace />} />
          <Route path="/admin/payments" element={<Navigate to="/supplier/payments" replace />} />
          <Route path="/admin/reset-password" element={<Navigate to="/supplier/reset-password" replace />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
