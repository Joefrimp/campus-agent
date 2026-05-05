import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { supabase } from '@/src/lib/supabase';
import { Activity, MessageSquare, Package, TrendingUp, X, Sparkles, Wand2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface Order {
  id: string;
  customer_name: string;
  customer_hall: string;
  total_price: number;
  timestamp: string;
}

export default function DashboardOverview() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    // Check if tutorial has been seen
    const hasSeen = localStorage.getItem('ea_seen_tutorial');
    if (!hasSeen) {
      setShowTutorial(true);
    }

    // Initial fetch
    const fetchOrders = async () => {
      if (!supabase) {
        // Fallback mock data if Supabase isn't configured
        setOrders([
          { id: '1', customer_name: 'Alex D.', customer_hall: 'North Hall', total_price: 25.00, timestamp: new Date().toISOString() },
          { id: '2', customer_name: 'Sam T.', customer_hall: 'East Wing', total_price: 45.50, timestamp: new Date(Date.now() - 3600000).toISOString() },
        ]);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10);
      
      if (!error && data) {
        setOrders(data);
      }
      setIsLoading(false);
    };

    fetchOrders();

    if (!supabase) return;

    // Real-time subscription
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setOrders((prev) => [payload.new as Order, ...prev].slice(0, 10));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const closeTutorial = () => {
    localStorage.setItem('ea_seen_tutorial', 'true');
    setShowTutorial(false);
  };

  return (
    <>
      <div className="space-y-6 flex flex-col h-full">
        <div className="shrink-0 flex justify-between items-end">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">Eastern AI <span className="text-indigo-400 text-sm font-normal ml-2">Executive Dashboard</span></h2>
            <p className="text-xs text-slate-500 mt-1">
              Autonomous AI Ops for Campus Entrepreneurs
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-indigo-600 hover:bg-indigo-700 text-white border-0 font-medium h-8 rounded-lg shadow-[0_0_15px_rgba(99,102,241,0.3)]" 
            onClick={() => {
              if (orders.length === 0) {
                alert("No data available to export yet.");
                return;
              }
              const headers = ['Order ID', 'Customer', 'Hall', 'Amount', 'Date'];
              const csvContent = [
                headers.join(','),
                ...orders.map(o => `${o.id},"${o.customer_name}","${o.customer_hall}",${o.total_price},"${o.timestamp}"`)
              ].join('\n');
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.setAttribute("download", "eastern_ai_leads.csv");
              link.setAttribute("target", "_blank"); // Better fallback for some devices
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
          >
            Export Leads (CSV)
          </Button>
        </div>

        <div className="grid grid-cols-12 md:grid-rows-6 gap-4 min-h-[600px] flex-grow">
          
          {/* Col 1-4, Row 1-4: Recent Orders */}
          <div className="col-span-12 lg:col-span-4 lg:row-span-4 flex flex-col">
            <Card className="h-full flex flex-col">
              <CardHeader className="flex flex-row justify-between items-center pb-4">
                <CardTitle>Live Sales Stream</CardTitle>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">Real-time</span>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto space-y-3">
                {isLoading ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-sm">Connecting to Eastern AI Core...</p>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center border-2 border-dashed border-white/5 rounded-2xl p-6 bg-white/[0.02]">
                    <Package className="w-8 h-8 text-indigo-400/50 mb-3" />
                    <p className="text-sm font-medium text-slate-300 mb-1">No orders yet</p>
                    <p className="text-xs text-slate-500 mb-4 max-w-[200px] leading-relaxed">Once your agent closes a sale on WhatsApp, it appears here in real-time.</p>
                    <Button variant="outline" size="sm" className="bg-white/5 border-white/10 text-white hover:bg-white/10 h-8 text-xs font-semibold rounded-full px-4" onClick={() => window.location.hash = '#/setup'}>
                      Setup Agent
                    </Button>
                  </div>
                ) : (
                  orders.map((order, i) => (
                    <div key={order.id} className={cn("p-3 bg-white/5 rounded-2xl border border-white/5", i > 0 && "opacity-80", i > 1 && "opacity-60")}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-indigo-300 font-medium">{order.customer_name}</span>
                        <span className="text-slate-500">{new Date(order.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      </div>
                      <p className="text-sm text-white">{order.customer_hall}</p>
                      <p className="text-xs text-slate-400 mt-1 italic">Ordered via WhatsApp • ${order.total_price.toFixed(2)}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Col 5-8, Row 1-2: Total Revenue */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4 lg:row-span-2 flex flex-col">
            <MetricCard title="Total Revenue" value="$4,231.00" icon={TrendingUp} trend="+12.4% vs last week" className="h-full" onClick={() => setActiveModal('Total Revenue')} />
          </div>

          {/* Col 9-12, Row 1-2: Active Chats */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4 lg:row-span-2 flex flex-col">
            <MetricCard title="Active Chats" value="12" icon={MessageSquare} trend="3 requiring intervention" className="h-full bg-indigo-950/30 border-indigo-500/20" onClick={() => setActiveModal('Active Chats')} />
          </div>

          {/* Col 5-12, Row 3-6: Live Agent Log */}
          <div className="col-span-12 lg:col-span-8 lg:row-span-4 flex flex-col">
            <Card className="h-full flex flex-col relative overflow-hidden">
              <CardHeader className="flex flex-row justify-between items-center pb-4 relative z-10">
                <CardTitle>Autonomous Agent Log</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" className="h-6 text-[10px] rounded-full px-3 py-1 font-bold text-white bg-indigo-500 hover:bg-indigo-600 border-0 shadow-[0_0_10px_rgba(99,102,241,0.2)]" onClick={() => setActiveModal('System Logs')}>SYSTEM LOGS</Button>
                  <Button size="sm" className="h-6 text-[10px] rounded-full px-3 py-1 font-bold bg-white/10 text-white border border-white/10 hover:bg-white/20" onClick={() => setActiveModal('Manual Override')}>MANUAL OVERRIDE</Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto space-y-3 p-5 relative z-10">
                {orders.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center border-2 border-dashed border-white/5 rounded-2xl p-6 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] transition-colors" onClick={() => setActiveModal('System Logs')}>
                    <Activity className="w-8 h-8 text-indigo-400/50 mb-3" />
                    <p className="text-sm font-medium text-slate-300 mb-1">Agent log is empty</p>
                    <p className="text-xs text-slate-500 max-w-[220px] leading-relaxed">Initialize your core agent connection to see real-time interaction logs here.</p>
                  </div>
                ) : (
                  <>
                    <LogEntry time="Just now" action="Confirmed order for Alex D." type="success" />
                    <LogEntry time="2m ago" action="Checked inventory for 'Blue Denim Jacket'" type="info" />
                    <LogEntry time="5m ago" action="Answered sizing query from Sam T." type="info" />
                    <LogEntry time="12m ago" action="Requested manual intervention on pricing dispute." type="warning" hasAction={true} onAction={() => setActiveModal('Manual Override')} />
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Col 1-4, Row 5-6: Items Sold & Agent Actions */}
          <div className="col-span-12 md:col-span-6 lg:col-span-2 lg:row-span-2 flex flex-col">
            <MetricCard title="Items Sold" value="84" icon={Package} trend="+5% via Agent" className="h-full" onClick={() => setActiveModal('Items Sold')} />
          </div>
          <div className="col-span-12 md:col-span-6 lg:col-span-2 lg:row-span-2 flex flex-col">
            <MetricCard title="Actions" value="1.4k" icon={Activity} trend="Last 30 days" className="h-full" onClick={() => setActiveModal('Actions')} />
          </div>
        </div>
      </div>

      {activeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-lg bg-[#0a0a0b] border-white/10 shadow-2xl flex flex-col overflow-hidden max-h-[80vh]">
            <div className="flex justify-between items-center p-4 border-b border-white/5 bg-white/5">
              <h3 className="font-semibold tracking-tight text-white">{activeModal} detailed view</h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-1.5 rounded-md">
                <X className="w-4 h-4"/>
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="flex flex-col items-center justify-center text-center py-10 space-y-4 text-slate-400">
                <Activity className="w-12 h-12 text-indigo-500/50" />
                <p>This is a simulated detail view for <strong>{activeModal}</strong>.</p>
                <p className="text-sm max-w-[300px]">In a full production environment with adequate data models, this modal would contain deep analytics, specific logs, charts (e.g. via Recharts), or override panels. Currently running in demo mode as part of the prototype.</p>
                <Button variant="outline" className="mt-4 bg-white/5 border-white/10 hover:bg-white/10 text-white" onClick={() => setActiveModal(null)}>Close Preview</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tutorial Welcome Modal */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="w-full max-w-lg bg-[#0a0a0b]/90 border-indigo-500/30 shadow-[0_0_50px_rgba(99,102,241,0.15)] flex flex-col overflow-hidden relative">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>
                <CardHeader className="text-center pt-8 pb-4">
                  <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl mx-auto flex items-center justify-center mb-4 border border-indigo-500/30">
                    <Wand2 className="w-8 h-8 text-indigo-400" />
                  </div>
                  <CardTitle className="text-2xl text-white">Welcome to Eastern AI</CardTitle>
                  <CardDescription className="text-indigo-200/70 text-base">You've successfully registered your business.</CardDescription>
                </CardHeader>
                <CardContent className="px-8 pb-6">
                  <div className="space-y-4">
                    <div className="flex gap-4 items-start bg-white/5 p-4 rounded-xl border border-white/5">
                      <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border border-indigo-500/20">
                        <span className="text-indigo-400 font-bold">1</span>
                      </div>
                      <div>
                        <h4 className="text-slate-200 font-medium mb-1">Set up your AI Agent</h4>
                        <p className="text-sm text-slate-400">Head over to the <strong className="text-white">AI Agent Setup</strong> tab in the sidebar to scan your WhatsApp QR code and connect your number.</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-4 items-start bg-white/5 p-4 rounded-xl border border-white/5">
                      <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border border-indigo-500/20">
                        <span className="text-indigo-400 font-bold">2</span>
                      </div>
                      <div>
                        <h4 className="text-slate-200 font-medium mb-1">Upload your Inventory</h4>
                        <p className="text-sm text-slate-400">Use the <strong className="text-white">Gallery Upload</strong> to feed images and descriptions so your agent knows what you cell.</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-4 items-start bg-white/5 p-4 rounded-xl border border-white/5">
                      <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border border-indigo-500/20">
                        <span className="text-indigo-400 font-bold">3</span>
                      </div>
                      <div>
                        <h4 className="text-slate-200 font-medium mb-1">Watch the Leads Flow In</h4>
                        <p className="text-sm text-slate-400">Manage orders, intervene in chats, and export your customer leads directly from this dashboard.</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="bg-white/[0.02] border-t border-white/5 p-4">
                  <Button onClick={closeTutorial} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium h-12">
                    Let's Get Started <Sparkles className="w-4 h-4 ml-2" />
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function MetricCard({ title, value, icon: Icon, trend, className, onClick }: { title: string, value: string, icon: any, trend: string, className?: string, onClick?: () => void }) {
  return (
    <Card 
      className={cn("p-5 flex flex-col justify-center transition-all duration-300", onClick ? "cursor-pointer hover:bg-white/5 hover:border-indigo-500/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.1)] group" : "", className)}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500 uppercase tracking-widest group-hover:text-slate-400 transition-colors">{title}</p>
        <div className="p-1.5 bg-indigo-500/10 rounded-lg group-hover:bg-indigo-500/20 transition-colors">
          <Icon className="w-4 h-4 text-indigo-400" />
        </div>
      </div>
      <h2 className="text-4xl font-light text-slate-200 group-hover:text-white transition-colors">{value}</h2>
      <div className="mt-2 text-xs text-green-400 flex items-center gap-1 group-hover:text-green-300 transition-colors">
        <span>{trend}</span>
      </div>
    </Card>
  );
}

function LogEntry({ time, action, type, hasAction = false, onAction }: { time: string, action: string, type: 'success' | 'info' | 'warning', hasAction?: boolean, onAction?: () => void }) {
  if (hasAction) {
    return (
      <div className="p-4 bg-red-500/5 rounded-2xl border border-red-500/20">
        <div className="flex justify-between items-center mb-1">
          <h3 className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Agent Interrupt</h3>
          <span className="text-slate-500 text-xs">{time}</span>
        </div>
        <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20 mb-3 mt-2">
          <p className="text-[10px] font-bold text-red-300 mb-0.5">PENDING APPROVAL</p>
          <p className="text-xs text-white">{action}</p>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 bg-red-500 hover:bg-red-600 text-white text-[9px] h-6 font-bold py-1.5 rounded" onClick={onAction}>BLOCK</Button>
          <Button variant="outline" className="flex-1 bg-white/10 hover:bg-white/20 text-white border-0 text-[9px] h-6 font-bold py-1.5 rounded" onClick={onAction}>ALLOW</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-white/5 rounded-2xl border border-white/5 flex gap-3 items-start">
      <div className={cn(
        "mt-1.5 w-2 h-2 rounded-full shrink-0",
        type === 'success' && "bg-green-500",
        type === 'info' && "bg-blue-500",
      )} />
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-indigo-300 font-medium">System {type}</span>
          <span className="text-xs text-slate-500">{time}</span>
        </div>
        <p className="text-sm text-slate-200">{action}</p>
      </div>
    </div>
  );
}
