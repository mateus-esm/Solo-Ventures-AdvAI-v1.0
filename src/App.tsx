import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppSidebar } from "@/components/AppSidebar";
import { ModeToggle } from "@/components/ModeToggle";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import CRM from "./pages/CRM";
import Suporte from "./pages/Suporte";
import Dashboard from "./pages/Dashboard";
import Billing from "./pages/Billing";
import Tutorial from "./pages/Tutorial";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import { WhatsAppButton } from "./components/WhatsAppButton";

const queryClient = new QueryClient();

const AuthenticatedLayout = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider>
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <header className="h-14 flex items-center justify-between border-b border-border bg-background px-4 shrink-0">
          <SidebarTrigger />
          <ModeToggle />
        </header>
        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>
        <footer className="border-t border-border bg-header-bg shrink-0">
          <div className="container mx-auto px-4 py-3 text-center text-sm text-foreground/70 font-medium">
            © 2025 Solo Ventures. Todos os direitos reservados. | AdvAI é uma plataforma proprietária.
          </div>
        </footer>
      </div>
    </div>
    <WhatsAppButton />
  </SidebarProvider>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <AuthenticatedLayout>
                    <Home />
                  </AuthenticatedLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <AuthenticatedLayout>
                    <Dashboard />
                  </AuthenticatedLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <AuthenticatedLayout>
                    <Chat />
                  </AuthenticatedLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/crm"
              element={
                <ProtectedRoute>
                  <AuthenticatedLayout>
                    <CRM />
                  </AuthenticatedLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/billing"
              element={
                <ProtectedRoute>
                  <AuthenticatedLayout>
                    <Billing />
                  </AuthenticatedLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/suporte"
              element={
                <ProtectedRoute>
                  <AuthenticatedLayout>
                    <Suporte />
                  </AuthenticatedLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/tutorial"
              element={
                <ProtectedRoute>
                  <AuthenticatedLayout>
                    <Tutorial />
                  </AuthenticatedLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AuthenticatedLayout>
                    <Admin />
                  </AuthenticatedLayout>
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
