import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import ProtectedRoute from "./components/ProtectedRoute";
import { ReviewPrompt } from "./components/ReviewPrompt";
import NotFound from "./pages/NotFound";
import SupplierPricing from "./pages/SupplierPricing";
import SupplierDesigns from "./pages/SupplierDesigns";
import SupplierProducts from "./pages/SupplierProducts";

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
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reset-password"
            element={
              <ProtectedRoute>
                <AdminPasswordReset />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pricing"
            element={
              <ProtectedRoute allowedRoles={['supplier']}>
                <SupplierPricing />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/designs"
            element={
              <ProtectedRoute allowedRoles={['supplier', 'admin']}>
                <SupplierDesigns />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/products"
            element={
              <ProtectedRoute allowedRoles={['supplier']}>
                <SupplierProducts />
              </ProtectedRoute>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
