import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './context';
import { Spinner, Toasts } from './components/ui';
import { LoginScreen } from './screens/Login';
import { MobileHomeScreen } from './screens/MobileHome';
import { AddGarmentScreen } from './screens/AddGarment';
import { InventoryScreen, ItemDetailScreen } from './screens/Inventory';
import { CheckoutScreen, ReceiptScreen } from './screens/Checkout';
import {
  AdminCategoriesScreen,
  AdminInventoryScreen,
  AdminOverviewScreen,
  AdminPricingScreen,
  AdminSalesScreen,
  AdminSettingsScreen,
} from './screens/Admin';

function Guard({ children }: { children: React.ReactNode }) {
  const { user, ready } = useApp();
  if (!ready) return <div className="page-center"><Spinner label="Loading demo session…" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const { user, ready } = useApp();
  if (!ready) return <div className="page-center"><Spinner label="Loading…" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/m'} replace />;
}

export function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Toasts />
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginScreen />} />

          {/* Employee Mobile Screens */}
          <Route path="/m" element={<Guard><MobileHomeScreen /></Guard>} />
          <Route path="/m/add" element={<Guard><AddGarmentScreen /></Guard>} />
          <Route path="/m/inventory" element={<Guard><InventoryScreen /></Guard>} />
          <Route path="/m/inventory/:id" element={<Guard><ItemDetailScreen /></Guard>} />
          <Route path="/m/checkout" element={<Guard><CheckoutScreen /></Guard>} />
          <Route path="/m/receipt/:id" element={<Guard><ReceiptScreen /></Guard>} />

          {/* Admin Dashboard Screens */}
          <Route path="/admin" element={<Guard><AdminOverviewScreen /></Guard>} />
          <Route path="/admin/inventory" element={<Guard><AdminInventoryScreen /></Guard>} />
          <Route path="/admin/categories" element={<Guard><AdminCategoriesScreen /></Guard>} />
          <Route path="/admin/pricing" element={<Guard><AdminPricingScreen /></Guard>} />
          <Route path="/admin/sales" element={<Guard><AdminSalesScreen /></Guard>} />
          <Route path="/admin/settings" element={<Guard><AdminSettingsScreen /></Guard>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
