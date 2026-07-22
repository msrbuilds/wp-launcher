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
import LocalDashboard from './pages/LocalDashboard';
import SitesListPage from './pages/SitesListPage';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import AccountPage from './pages/AccountPage';
import VerifyPage from './pages/VerifyPage';
import AdminLayout, { useAdminAuth } from './pages/admin/AdminLayout';
import OverviewTab from './pages/admin/OverviewTab';
import AnalyticsTab from './pages/admin/AnalyticsTab';
import MonitoringPage from './pages/admin/MonitoringPage';
import BulkTab from './pages/admin/BulkTab';
import BlueprintsTab from './pages/admin/BlueprintsTab';
import UsersTab from './pages/admin/UsersTab';
import SitesTab from './pages/admin/SitesTab';
import LogsTab from './pages/admin/LogsTab';
import FeaturesTab from './pages/admin/FeaturesTab';
import BrandingTab from './pages/admin/BrandingTab';
import SystemTab from './pages/admin/SystemTab';
import BlueprintEditorPage from './pages/BlueprintEditorPage';
import SyncPage from './pages/SyncPage';
import ClientsPage from './pages/admin/ClientsPage';
import ProjectsPage from './pages/admin/ProjectsPage';
import ProjectDetailPage from './pages/admin/ProjectDetailPage';
import InvoicesPage from './pages/admin/InvoicesPage';
import InvoicePrintPage from './pages/admin/InvoicePrintPage';
import ProductivityPage from './pages/ProductivityPage';
import './index.css';

function LaunchRedirect() {
  const { blueprintId } = useParams();
  if (blueprintId) {
    localStorage.setItem('pendingProductLaunch', blueprintId);
  }
  return <Navigate to="/" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAdminAuth();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}

function LocalRoutes() {
  return (
    <Routes>
      {/* Outside AdminLayout — the layout's auth guard would bounce it back here. */}
      <Route path="/login" element={<LoginPage />} />
      {/* Setup is a one-time route; once done it must not render at all. */}
      <Route path="/setup" element={<Navigate to="/" replace />} />
      <Route path="/" element={<AdminLayout />}>
        <Route index element={<LocalDashboard />} />
        <Route path="sites" element={<SitesListPage />} />
        <Route path="create" element={<LocalLaunchPage />} />
        <Route path="blueprints" element={<BlueprintsTab />} />
        <Route path="blueprints/new" element={<BlueprintEditorPage />} />
        {/* Old paths kept so existing links and bookmarks resolve. */}
        <Route path="create-template" element={<Navigate to="/blueprints/new" replace />} />
        <Route path="sync" element={<SyncPage />} />
        <Route path="productivity" element={<ProductivityPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:id/print" element={<InvoicePrintPage />} />
        <Route path="products" element={<Navigate to="/blueprints" replace />} />
        <Route path="bulk" element={<BulkTab />} />
        <Route path="logs" element={<LogsTab />} />
        <Route path="features" element={<FeaturesTab />} />
        <Route path="branding" element={<BrandingTab />} />
        <Route path="system" element={<SystemTab />} />
        {/* Redirect old admin paths */}
        <Route path="admin" element={<Navigate to="/" replace />} />
        <Route path="admin/sites" element={<Navigate to="/sites" replace />} />
        <Route path="admin/products" element={<Navigate to="/blueprints" replace />} />
        <Route path="admin/logs" element={<Navigate to="/logs" replace />} />
        <Route path="admin/features" element={<Navigate to="/features" replace />} />
        <Route path="admin/branding" element={<Navigate to="/branding" replace />} />
        <Route path="admin/system" element={<Navigate to="/system" replace />} />
        <Route path="admin/bulk" element={<Navigate to="/bulk" replace />} />
        <Route path="launch/:blueprintId" element={<LaunchRedirect />} />
      </Route>
    </Routes>
  );
}

function AgencyRoutes() {
  return (
    <Routes>
      <Route path="/" element={<App />}>
        <Route index element={<LaunchPage />} />
        <Route path="blueprints/new" element={<AdminRoute><BlueprintEditorPage /></AdminRoute>} />
        <Route path="create-product" element={<Navigate to="/blueprints/new" replace />} />
        <Route path="launch/:blueprintId" element={<LaunchRedirect />} />
        <Route path="sites" element={<SitesListPage />} />
        <Route path="login" element={<LoginPage />} />
        {/* Setup is a one-time route; once done it must not render at all. */}
        <Route path="setup" element={<Navigate to="/" replace />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="verify" element={<VerifyPage />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<OverviewTab />} />
          <Route path="analytics" element={<AnalyticsTab />} />
          <Route path="monitoring" element={<MonitoringPage />} />
          <Route path="bulk" element={<BulkTab />} />
          <Route path="blueprints" element={<BlueprintsTab />} />
          <Route path="products" element={<Navigate to="/admin/blueprints" replace />} />
          <Route path="users" element={<UsersTab />} />
          <Route path="sites" element={<SitesTab />} />
          <Route path="logs" element={<LogsTab />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="invoices/:id/print" element={<InvoicePrintPage />} />
          <Route path="features" element={<FeaturesTab />} />
          <Route path="branding" element={<BrandingTab />} />
          <Route path="system" element={<SystemTab />} />
        </Route>
      </Route>
    </Routes>
  );
}

function AppRoutes() {
  const { loading, setupRequired } = useSettings();
  const isLocal = useIsLocalMode();

  if (loading) return null;

  // Nothing else is reachable until the panel has an owner.
  if (setupRequired) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return isLocal ? <LocalRoutes /> : <AgencyRoutes />;
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
