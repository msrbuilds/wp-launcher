import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { SettingsProvider } from './context/SettingsContext';
import { AuthProvider } from './context/AuthContext';
import { useIsLocalMode } from './context/SettingsContext';
import App from './App';
import LaunchPage from './pages/LaunchPage';
import LocalLaunchPage from './pages/LocalLaunchPage';
import SitesListPage from './pages/SitesListPage';
import LoginPage from './pages/LoginPage';
import AccountPage from './pages/AccountPage';
import VerifyPage from './pages/VerifyPage';
import AdminPage, { useAdminAuth } from './pages/AdminPage';
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
  const isLocal = useIsLocalMode();

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
            <Route path="admin" element={<AdminPage />} />
          </>
        )}
        {isLocal && (
          <>
            <Route path="login" element={<Navigate to="/" replace />} />
            <Route path="admin" element={<Navigate to="/" replace />} />
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
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
