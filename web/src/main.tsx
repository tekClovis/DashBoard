import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { queryClient } from '@/api/query-client.js';
import { ConfirmPage } from '@/routes/ConfirmPage.js';
import { ConnectionsPage } from '@/routes/ConnectionsPage.js';
import { DashboardPlaceholderPage } from '@/routes/DashboardPlaceholderPage.js';
import { LoginPage } from '@/routes/LoginPage.js';
import { RegisterPage } from '@/routes/RegisterPage.js';
import { RequireAuth } from '@/routes/RequireAuth.js';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/confirm" element={<ConfirmPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/d/:dashboardId" element={<DashboardPlaceholderPage />} />
            <Route path="/connections" element={<ConnectionsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
