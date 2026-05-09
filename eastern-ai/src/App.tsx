import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { VerifyPage } from './pages/VerifyPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { DashboardPage } from './pages/DashboardPage'
import { SetupPage } from './pages/SetupPage'
import { SalesPage } from './pages/SalesPage'
import { AgentLogsPage } from './pages/AgentLogsPage'
import { CataloguePage } from './pages/CataloguePage'
import { OrdersPage } from './pages/OrdersPage'
import { FinancesPage } from './pages/FinancesPage'
import { HelpCenterPage } from './pages/HelpCenterPage'
import { SettingsPage } from './pages/SettingsPage'
import { PaymentPage } from './pages/PaymentPage'
import { AppShell } from './components/layout/AppShell'
import { ProtectedRoute, AuthRoute } from './components/auth/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Auth-only (no verification required) */}
        <Route path="/onboarding" element={<AuthRoute><OnboardingPage /></AuthRoute>} />
        <Route path="/verify" element={<AuthRoute><VerifyPage /></AuthRoute>} />

        {/* Payment — accessible to trial-gated users */}
        <Route path="/dashboard/payment" element={<AuthRoute><PaymentPage /></AuthRoute>} />

        {/* Protected dashboard — requires auth + verification + active trial */}
        <Route path="/dashboard" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="logs" element={<AgentLogsPage />} />
          <Route path="catalogue" element={<CataloguePage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="finances" element={<FinancesPage />} />
          <Route path="help" element={<HelpCenterPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
