import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { SettingsProvider } from './context/SettingsContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { useSettings } from './context/SettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import LocalLaunchPage from './pages/LocalLaunchPage';
import LocalDashboard from './pages/LocalDashboard';
import SitesListPage from './pages/SitesListPage';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import AccountPage from './pages/AccountPage';
import VerifyPage from './pages/VerifyPage';
import VerifyEmailChangePage from './pages/VerifyEmailChangePage';
import AppShell from './components/shell/AppShell';
import AnalyticsTab from './pages/admin/AnalyticsTab';
import MonitoringPage from './pages/admin/MonitoringPage';
import BulkTab from './pages/admin/BulkTab';
import BlueprintsTab from './pages/admin/BlueprintsTab';
import UsersTab from './pages/admin/UsersTab';
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
// theme.css imports index.css into a low-priority `legacy` layer; importing
// index.css here as well would reintroduce it unlayered and override Tailwind.
import './styles/theme.css';

function LaunchRedirect() {
  const { blueprintId } = useParams();
  if (blueprintId) {
    localStorage.setItem('pendingProductLaunch', blueprintId);
  }
  return <Navigate to="/" replace />;
}

function AppRoutes() {
  const { loading, setupRequired } = useSettings();

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

  return (
    <Routes>
      {/* Outside the shell: its auth guard would bounce these straight back. */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/verify-email-change" element={<VerifyEmailChangePage />} />
      <Route path="/setup" element={<Navigate to="/" replace />} />

      <Route path="/" element={<AppShell />}>
        <Route index element={<LocalDashboard />} />
        <Route path="sites" element={<SitesListPage />} />
        <Route path="sites/new" element={<LocalLaunchPage />} />
        <Route path="blueprints" element={<BlueprintsTab />} />
        <Route path="blueprints/new" element={<BlueprintEditorPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
        <Route path="analytics" element={<AnalyticsTab />} />
        <Route path="productivity" element={<ProductivityPage />} />
        <Route path="sync" element={<SyncPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:id/print" element={<InvoicePrintPage />} />
        <Route path="bulk" element={<BulkTab />} />
        <Route path="logs" element={<LogsTab />} />
        <Route path="users" element={<UsersTab />} />
        <Route path="features" element={<FeaturesTab />} />
        <Route path="branding" element={<BrandingTab />} />
        <Route path="system" element={<SystemTab />} />
        <Route path="account" element={<AccountPage />} />

        {/* Old paths, kept so existing links and bookmarks resolve. */}
        <Route path="create" element={<Navigate to="/sites/new" replace />} />
        <Route path="products" element={<Navigate to="/blueprints" replace />} />
        <Route path="create-template" element={<Navigate to="/blueprints/new" replace />} />
        <Route path="create-product" element={<Navigate to="/blueprints/new" replace />} />
        <Route path="admin" element={<Navigate to="/" replace />} />
        <Route path="admin/*" element={<Navigate to="/" replace />} />
        <Route path="launch/:blueprintId" element={<LaunchRedirect />} />

        {/* Any unknown in-shell path lands on the dashboard rather than a blank screen. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <AuthProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </BrowserRouter>
        </AuthProvider>
      </SettingsProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
