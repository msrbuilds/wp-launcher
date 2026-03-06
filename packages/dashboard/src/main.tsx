import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import LaunchPage from './pages/LaunchPage';
import SitesListPage from './pages/SitesListPage';
import LoginPage from './pages/LoginPage';
import AccountPage from './pages/AccountPage';
import VerifyPage from './pages/VerifyPage';
import AdminPage from './pages/AdminPage';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<LaunchPage />} />
            <Route path="sites" element={<SitesListPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="verify" element={<VerifyPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
