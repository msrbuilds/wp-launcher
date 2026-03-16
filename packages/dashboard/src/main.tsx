import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { SettingsProvider } from './context/SettingsContext';
import { AuthProvider } from './context/AuthContext';
import { useIsLocalMode, useSettings } from './context/SettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import LaunchPage from './pages/LaunchPage';
import LocalLaunchPage from './pages/LocalLaunchPage';
import SitesListPage from './pages/SitesListPage';
import LoginPage from './pages/LoginPage';
import AccountPage from './pages/AccountPage';
import VerifyPage from './pages/VerifyPage';
import AdminLayout, { useAdminAuth } from './pages/admin/AdminLayout';
import OverviewTab from './pages/admin/OverviewTab';
import AnalyticsTab from './pages/admin/AnalyticsTab';
import BulkTab from './pages/admin/BulkTab';
import ProductsTab from './pages/admin/ProductsTab';
import UsersTab from './pages/admin/UsersTab';
import SitesTab from './pages/admin/SitesTab';
import LogsTab from './pages/admin/LogsTab';
import FeaturesTab from './pages/admin/FeaturesTab';
import BrandingTab from './pages/admin/BrandingTab';
import SystemTab from './pages/admin/SystemTab';
import CreateTemplatePage from './pages/CreateTemplatePage';
import CreateProductPage from './pages/CreateProductPage';
import './index.css';

function LaunchRedirect() {
  const { productId } = useParams();
  if (productId) {
    localStorage.setItem('pendingProductLaunch', productId);
  }
  return <Navigate to="/" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAdminAuth();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}

function AppRoutes() {
  const { loading } = useSettings();
  const isLocal = useIsLocalMode();

  if (loading) return null;

  return (
    <Routes>
      <Route path="/" element={<App />}>
        <Route index element={<LaunchPage />} />
        {isLocal && <Route path="create" element={<LocalLaunchPage />} />}
        {isLocal && <Route path="create-template" element={<CreateTemplatePage />} />}
        {!isLocal && <Route path="create-product" element={<AdminRoute><CreateProductPage /></AdminRoute>} />}
        <Route path="launch/:productId" element={<LaunchRedirect />} />
        <Route path="sites" element={<SitesListPage />} />
        {!isLocal && (
          <>
            <Route path="login" element={<LoginPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="verify" element={<VerifyPage />} />
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<OverviewTab />} />
              <Route path="analytics" element={<AnalyticsTab />} />
              <Route path="bulk" element={<BulkTab />} />
              <Route path="products" element={<ProductsTab />} />
              <Route path="users" element={<UsersTab />} />
              <Route path="sites" element={<SitesTab />} />
              <Route path="logs" element={<LogsTab />} />
              <Route path="features" element={<FeaturesTab />} />
              <Route path="branding" element={<BrandingTab />} />
              <Route path="system" element={<SystemTab />} />
            </Route>
          </>
        )}
        {isLocal && (
          <>
            <Route path="login" element={<Navigate to="/" replace />} />
            <Route path="admin/*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Route>
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <AuthProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
