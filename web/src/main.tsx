import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { queryClient } from '@/api/query-client.js';
import { AdminPage } from '@/routes/AdminPage.js';
import { AppShell } from '@/routes/AppShell.js';
import { ConfirmPage } from '@/routes/ConfirmPage.js';
import { ConnectionsPage } from '@/routes/ConnectionsPage.js';
import { ForgotPasswordPage } from '@/routes/ForgotPasswordPage.js';
import { LoginPage } from '@/routes/LoginPage.js';
import { ProfilePage } from '@/routes/ProfilePage.js';
import { RedirectIfAuthed } from '@/routes/RedirectIfAuthed.js';
import { RegisterPage } from '@/routes/RegisterPage.js';
import { RequireAuth } from '@/routes/RequireAuth.js';
import { ResetPasswordPage } from '@/routes/ResetPasswordPage.js';
import { RootRedirect } from '@/routes/RootRedirect.js';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route element={<RedirectIfAuthed />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route path="/confirm" element={<ConfirmPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="/d/:dashboardId" />
              <Route path="/services" element={<ConnectionsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
