import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, Rocket, Image, BookOpen, Settings, Menu, ToggleLeft, ToggleRight, LogOut } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import { cn } from '@/src/lib/utils';
import DashboardOverview from '@/src/pages/DashboardOverview';
import OnboardingFlow from '@/src/pages/OnboardingFlow';
import InventoryUpload from '@/src/pages/InventoryUpload';
import PlaybookEditor from '@/src/pages/PlaybookEditor';
import LandingAuth from '@/src/pages/LandingAuth';
import { AuthContext, UserData } from '@/src/lib/auth';
import { BackgroundNodes } from '@/src/components/BackgroundNodes';

function Sidebar({ isOpen, onClose, user, agentStatus }: { isOpen: boolean; onClose: () => void; user: UserData | null, agentStatus: string }) {
  const location = useLocation();
  const [humanInLoop, setHumanInLoop] = useState(false);
  
  const links = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/setup', label: 'AI Agent Setup', icon: Rocket },
    { to: '/inventory', label: 'Gallery Upload', icon: Image },
    { to: '/playbook', label: 'Playbook', icon: BookOpen },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/80 z-20 md:hidden" onClick={onClose} />
      )}
      <div className={cn(
        "fixed inset-y-0 left-0 z-30 w-64 border-r border-white/5 bg-[#0a0a0b]/90 backdrop-blur-xl flex flex-col transition-transform duration-300 md:relative md:translate-x-0 h-full max-md:absolute max-md:top-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-[72px] flex items-center px-6 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white text-xl relative shadow-[0_0_15px_rgba(99,102,241,0.5)]">
              {user?.businessName?.[0]?.toUpperCase() || 'E'}
              {agentStatus === 'active' && <div className="absolute -inset-1 rounded-xl border border-indigo-500/30 animate-pulse pointer-events-none"></div>}
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-lg text-white tracking-tight leading-tight truncate max-w-[120px]">
                {user?.businessName || 'Eastern AI'}
              </span>
              <span className={cn("text-[10px] font-medium tracking-wider uppercase", agentStatus === 'active' ? "text-indigo-400" : "text-slate-500")}>
                {agentStatus === 'active' ? 'Agent Active' : 'Agent Inactive'}
              </span>
            </div>
          </div>
        </div>
      <div className="p-4 flex-1 flex flex-col gap-2">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.to;
          return (
            <Link
              key={link.to}
              to={link.to}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors",
                isActive 
                  ? "bg-white/10 text-white font-medium" 
                  : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
              )}
            >
              <Icon className="w-4 h-4" />
              {link.label}
            </Link>
          );
        })}
      </div>

      <div className="px-4 pb-4 shrink-0">
        <div className="bg-gradient-to-br from-indigo-950/40 to-black border border-indigo-500/20 p-3 rounded-xl flex flex-col gap-2">
          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-indigo-300">
            Free Trial
            <span className="bg-indigo-600/20 text-indigo-400 px-1.5 py-0.5 rounded">15 Days Left</span>
          </div>
          <div className="w-full bg-black/50 h-1.5 rounded-full overflow-hidden">
            <div className="bg-indigo-500 w-[10%] h-full"></div>
          </div>
          <span className="text-[10px] text-slate-500">2 / 50 Messages Used</span>
        </div>
      </div>

      <div className="p-4 border-t border-white/5 space-y-3 shrink-0">
        <div 
          className="flex items-center justify-between px-3 py-2 rounded-xl border border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => setHumanInLoop(!humanInLoop)}
        >
          <div className="flex flex-col">
            <span className="text-white text-xs font-semibold">Human-in-the-Loop</span>
            <span className="text-slate-500 text-[10px]">Manual override</span>
          </div>
          {humanInLoop ? <ToggleRight className="text-indigo-400 w-6 h-6" /> : <ToggleLeft className="text-slate-500 w-6 h-6" />}
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors rounded-xl hover:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/20 flex items-center justify-center font-bold text-xs text-white">
              {user?.firstName?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex flex-col">
              <span className="font-medium text-slate-200">{user?.firstName || 'User'}</span>
              <span className="text-[10px] text-slate-500">Executive</span>
            </div>
          </div>
          <button 
            onClick={() => AuthContext.logout()}
            className="p-1.5 hover:bg-red-500/10 hover:text-red-400 rounded-md transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      </div>
    </>
  );
}

function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<UserData | null>(null);
  const [isInit, setIsInit] = useState(false);
  const [agentStatus, setAgentStatus] = useState(localStorage.getItem('ea_agent_status') || 'inactive');

  useEffect(() => {
    const initAuth = async () => {
      await AuthContext.load();
      setUser(AuthContext.user);
      setIsInit(true);
    };
    initAuth();

    const handleAuthChange = () => {
      setUser(AuthContext.user);
    };

    const handleAgentStatus = () => {
      setAgentStatus(localStorage.getItem('ea_agent_status') || 'inactive');
    };

    window.addEventListener('auth_changed', handleAuthChange);
    window.addEventListener('agent_status_changed', handleAgentStatus);
    return () => {
      window.removeEventListener('auth_changed', handleAuthChange);
      window.removeEventListener('agent_status_changed', handleAgentStatus);
    };
  }, []);

  if (!isInit) {
    return (
      <div className="h-screen w-screen bg-[#070708] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user && window.location.hash !== '#/auth') {
    return <Navigate to="/auth" />;
  }

  return (
    <div className="flex h-screen bg-[#070708] text-slate-200 overflow-hidden relative">
      <div className="absolute inset-0 opacity-30 pointer-events-none z-0">
        <BackgroundNodes />
      </div>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} user={user} agentStatus={agentStatus} />
      <main className="flex-1 overflow-auto bg-[#0a0a0b]/60 relative z-10 backdrop-blur-3xl">
        <div className="h-[72px] px-4 md:px-8 flex items-center justify-between border-b border-white/5 bg-[#0a0a0b]/80 backdrop-blur-sm sticky top-0 z-20 w-full">
          <button 
            className="md:hidden p-2 text-slate-400 hover:text-white"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
          
          <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full border ml-auto shadow-[0_0_10px_rgba(99,102,241,0.1)]", agentStatus === 'active' ? "bg-indigo-500/10 border-indigo-500/20" : "bg-black/50 border-white/10 shadow-none")}>
            <div className={cn("w-2 h-2 rounded-full", agentStatus === 'active' ? "bg-indigo-400 animate-pulse shadow-[0_0_5px_rgba(99,102,241,0.8)]" : "bg-slate-500")}></div>
            <span className={cn("text-[10px] font-medium uppercase tracking-wider hidden sm:inline-block", agentStatus === 'active' ? "text-indigo-300" : "text-slate-400")}>
              {agentStatus === 'active' ? 'Eastern AI Core Active' : 'Core Inactive'}
            </span>
            <span className={cn("text-[10px] font-medium uppercase tracking-wider sm:hidden", agentStatus === 'active' ? "text-indigo-300" : "text-slate-400")}>
              {agentStatus === 'active' ? 'Core Active' : 'Inactive'}
            </span>
          </div>
        </div>
        <div className="p-6 max-w-[1200px] mx-auto min-h-[calc(100vh-72px)] flex flex-col relative z-20">
          <Routes>
            <Route path="/" element={<DashboardOverview />} />
            <Route path="/setup" element={<OnboardingFlow />} />
            <Route path="/inventory" element={<InventoryUpload />} />
            <Route path="/playbook" element={<PlaybookEditor />} />
            <Route path="/settings" element={<div className="text-slate-500">Settings configuration goes here.</div>} />
          </Routes>
          <footer className="mt-8 flex justify-between items-center text-[10px] text-slate-600 border-t border-white/5 pt-4">
            <p>© 2026 Eastern AI Systems • Executive Dashboard</p>
            <div className="flex gap-4">
              <span>Postgres DB: Secured</span>
              <span>Vector DB: Synchronized</span>
              <span>Node Bridge: Healthy</span>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/auth" element={<LandingAuth />} />
        <Route path="/*" element={<Layout />} />
      </Routes>
      <Analytics />
    </HashRouter>
  );
}
