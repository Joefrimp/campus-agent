import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Bot, Zap, TrendingUp, CheckCircle, Smartphone, Calendar, Check, Shield, ClipboardList, MessageSquare, Minus, Plus } from 'lucide-react';
import { SceneSneakerHub, SceneKicksLounge, SceneBraidsBooking, ScenePaymentAlert, SceneStockAlert, SceneTechHub, SceneNailVoiceNote, SceneMemoryEngine } from './Scenes';
import { useAuth } from '../../hooks/useAuth';

export default function App() {
  const [activeScene, setActiveScene] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate('/dashboard', { replace: true });
  }, [session, loading, navigate]);

  const start = () => navigate('/register');
  const signIn = () => navigate('/signin');
  const goPro = () => {
    if (session) navigate('/dashboard/payment');
    else navigate('/register');
  };

  const faqs = [
    { question: "What exactly is Vector?", answer: "Vector is an AI Agent that runs your business natively on WhatsApp. It replies to customers, takes orders, and closes sales 24/7." },
    { question: "How do I connect my WhatsApp?", answer: "Just scan a QR code from our dashboard. It instantly links to your WhatsApp Business without any coding required." },
    { question: "What happens when my phone is off?", answer: "Vector runs from the cloud. It keeps replying even when your phone is off or out of battery. The only thing you have to do is open WhatsApp on your phone roughly every two weeks so the session stays alive." },
    { question: "Can I take over a conversation myself?", answer: "Yes! Using our dashboard, you can monitor all active conversations and instantly pause the AI to take over manually at any time." },
    { question: "What if Vector replies with something wrong?", answer: "You can correct any reply and Vector will learn from your edit. For products and stock, Vector only confirms availability when it has a high-confidence match. If it's not sure, it tells the customer honestly that we don't carry that exact item and offers what we do have." },
    { question: "Can it book appointments?", answer: "Absolutely. Vector can check your calendar availability in real-time and automatically book appointments for your clients." }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveScene((prev) => (prev + 1) % 8);
    }, 9000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-vector-bg text-vector-secondary overflow-hidden selection:bg-vector-primary selection:text-white">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-vector-primary/5 blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-600/5 blur-[120px]" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto glass-pill rounded-full px-6 py-3 flex items-center justify-between border-white/5 bg-[#030303]/50 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-vector-primary/10 border border-vector-primary/20 flex items-center justify-center glow-shadow">
              <Bot className="text-white w-5 h-5 drop-shadow-md" />
            </div>
            <span className="font-display font-bold text-xl text-white tracking-tight">Vector</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold tracking-wide text-zinc-300">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={signIn} className="text-sm font-semibold text-zinc-300 hover:text-white transition-colors hidden md:block">
              Sign in
            </button>
            <button onClick={start} className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-bold hover:bg-vector-primary hover:text-white hover:glow-shadow transition-all flex items-center gap-2">
              Get started <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-32 pb-20">
        {/* Superior Hero Section */}
        <section className="max-w-7xl mx-auto px-6 grid xl:grid-cols-[1fr_400px] gap-16 items-center min-h-[75vh]">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col gap-8 relative z-10"
          >
            <h1 className="font-display text-5xl sm:text-6xl lg:text-[4.5rem] font-black leading-[1.05] tracking-tight text-white drop-shadow-lg">
              Never lose a customer to <span className="text-transparent bg-clip-text bg-gradient-to-r from-vector-primary to-emerald-400">a late reply again.</span>
            </h1>
            
            <p className="text-xl sm:text-2xl text-zinc-300 max-w-2xl leading-relaxed font-medium">
              Clone your best salesperson. Get a 24/7 autonomous WhatsApp agent that delights customers, remembers preferences, and closes sales.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-5 mt-4">
              <button onClick={start} className="w-full sm:w-auto bg-vector-primary text-black px-10 py-4 rounded-full font-bold text-lg hover:glow-shadow transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3">
                Deploy Vector <Zap className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mt-8 opacity-90 border-t border-white/10 pt-8">
              <div className="flex items-center">
                 <span className="text-3xl font-black text-white mr-2">100%</span>
                 <span className="text-xs font-bold text-zinc-400 uppercase tracking-[0.15em] leading-tight mt-1">Automation<br/>Success rate</span>
              </div>
              <div className="hidden sm:block w-px h-10 bg-white/10 mx-2" />
              <div className="flex items-center">
                 <span className="text-3xl font-black text-vector-primary mr-2">&lt;2s</span>
                 <span className="text-xs font-bold text-zinc-400 uppercase tracking-[0.15em] leading-tight mt-1">Average<br/>Latency</span>
              </div>
            </div>
          </motion.div>

          {/* Animated Stacked Carousel */}
          <div className="relative h-[650px] w-full max-w-[400px] flex items-center justify-center mx-auto mt-10 xl:mt-0 xl:scale-110">
            <div className="absolute inset-0 bg-gradient-to-tr from-vector-primary/20 to-emerald-500/10 rounded-[3rem] blur-[80px]" />
            
            <AnimatePresence mode="popLayout">
              {activeScene === 0 && <SceneSneakerHub />}
              {activeScene === 1 && <SceneKicksLounge />}
              {activeScene === 2 && <SceneBraidsBooking />}
              {activeScene === 3 && <ScenePaymentAlert />}
              {activeScene === 4 && <SceneStockAlert />}
              {activeScene === 5 && <SceneTechHub />}
              {activeScene === 6 && <SceneNailVoiceNote />}
              {activeScene === 7 && <SceneMemoryEngine />}
            </AnimatePresence>
            
            {/* Carousel Indicators */}
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-3">
               {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <button 
                     key={i} 
                     onClick={() => setActiveScene(i)}
                     className={`h-1.5 rounded-full transition-all duration-500 ${activeScene === i ? 'w-8 bg-vector-primary shadow-[0_0_10px_rgba(0,255,102,0.5)]' : 'w-2 bg-white/20 hover:bg-white/40'}`}
                  />
               ))}
            </div>
          </div>
        </section>

        {/* Features / Bento Grid */}
        <section id="features" className="max-w-7xl mx-auto px-6 py-28 relative z-10 mt-16">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 tracking-tight leading-tight">
              Everything a <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-vector-primary">full-time employee</span><br />
              would do.<br />
              None of the payroll.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="md:col-span-2 glass-pill p-10 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent relative overflow-hidden group hover:border-vector-primary/30 transition-all duration-300"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-vector-primary/10 rounded-full blur-[80px] group-hover:bg-vector-primary/20 transition-all duration-700" />
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0F172A] to-black border border-white/10 flex items-center justify-center mb-8 shadow-xl">
                 <MessageSquare className="w-7 h-7 text-vector-primary drop-shadow-[0_0_10px_rgba(59,130,246,0.3)]" />
              </div>
              <h3 className="font-display text-3xl font-bold text-white mb-4 relative z-10">Three brand voices</h3>
              <p className="text-zinc-400 text-lg max-w-md leading-relaxed relative z-10">Pick from professional, hype-man, or problem-solver. Or write your own.</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="glass-pill p-10 rounded-[2rem] border border-white/10 bg-gradient-to-bl from-white/[0.03] to-transparent relative overflow-hidden hover:border-vector-primary/30 transition-all duration-300 group"
            >
              <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-emerald-500/10 rounded-full blur-[60px] -translate-x-1/2 -translate-y-1/2" />
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0A0A0A] to-black border border-white/10 flex items-center justify-center mb-8 relative z-10 shadow-xl group-hover:scale-110 transition-transform">
                 <Shield className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="font-display text-2xl font-bold text-white mb-4 relative z-10">Manual mode</h3>
              <p className="text-zinc-400 relative z-10 leading-relaxed text-lg">Take over any chat with one toggle. Vector stays quiet until you switch it back.</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="glass-pill p-10 rounded-[2rem] border border-white/10 bg-gradient-to-tr from-white/[0.03] to-transparent relative overflow-hidden hover:border-vector-primary/30 transition-all duration-300 group"
            >
              <div className="absolute top-0 left-0 w-48 h-48 bg-vector-primary/5 rounded-full blur-[60px]" />
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0A0A0A] to-black border border-white/10 flex items-center justify-center mb-8 relative z-10 shadow-xl group-hover:scale-110 transition-transform">
                 <TrendingUp className="w-7 h-7 text-vector-primary" />
              </div>
              <h3 className="font-display text-2xl font-bold text-white mb-4 relative z-10">Nightly summary</h3>
              <p className="text-zinc-400 relative z-10 leading-relaxed text-lg">A short recap of today and a plan for tomorrow, every night at 9pm.</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="md:col-span-2 glass-pill p-10 rounded-[2rem] border border-white/10 bg-gradient-to-tl from-white/[0.03] to-transparent relative overflow-hidden hover:border-vector-primary/30 transition-all duration-300 group"
            >
               <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-600/10 rounded-full blur-[80px]" />
               <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0A0A0A] to-black border border-white/10 flex items-center justify-center mb-8 relative z-10 shadow-xl group-hover:scale-110 transition-transform">
                 <ClipboardList className="w-7 h-7 text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]" />
               </div>
              <h3 className="font-display text-3xl font-bold text-white mb-4 relative z-10">Orders and stock</h3>
              <p className="text-zinc-400 text-lg max-w-xl relative z-10 leading-relaxed">Catalogue, stock counts, and low-stock alerts straight to your WhatsApp.</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="md:col-span-1 glass-pill p-10 rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent relative overflow-hidden hover:border-vector-primary/30 transition-all duration-300 group"
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-vector-primary/5 rounded-full blur-[60px]" />
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0A0A0A] to-black border border-white/10 flex items-center justify-center mb-8 relative z-10 shadow-xl group-hover:scale-110 transition-transform">
                 <Calendar className="w-7 h-7 text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]" />
              </div>
              <h3 className="font-display text-2xl font-bold text-white mb-4 relative z-10">Appointments</h3>
              <p className="text-zinc-400 relative z-10 leading-relaxed text-lg">Books slots from your real schedule. Skips conflicts. Confirms with the customer.</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
              className="md:col-span-2 glass-pill p-10 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent relative overflow-hidden hover:border-vector-primary/30 transition-all duration-300 group"
            >
              <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] -translate-x-1/2 -translate-y-1/2" />
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0A0A0A] to-black border border-white/10 flex items-center justify-center mb-8 relative z-10 shadow-xl group-hover:scale-110 transition-transform">
                 <Smartphone className="w-7 h-7 text-vector-primary" />
              </div>
              <h3 className="font-display text-2xl font-bold text-white mb-4 relative z-10">Connect in 2 Mins</h3>
              <p className="text-zinc-400 relative z-10 leading-relaxed text-lg">Scan a secure QR code from WhatsApp Business. Zero coding required. Vectors are live instantly.</p>
            </motion.div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-28 relative z-10 mt-16">
          <div className="text-center mb-20">
            <h2 className="font-display text-4xl md:text-5xl font-black text-white mb-6">
              From zero to scaling in <span className="text-vector-primary">3 steps</span>
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto text-xl">
              We made setting up an AI automation system as simple as clicking a button.
            </p>
          </div>

          <div className="relative">
            <div className="hidden md:block absolute top-[40px] left-[10%] w-[80%] h-[2px] bg-gradient-to-r from-transparent via-vector-primary/50 to-transparent z-0 blur-[1px]" />
            <div className="hidden md:block absolute top-[40px] left-[10%] w-[80%] h-px bg-gradient-to-r from-transparent via-white/20 to-transparent z-0" />
            
            <div className="grid md:grid-cols-3 gap-12 relative z-10">
              {/* Step 1 */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="flex flex-col items-center text-center"
              >
                <div className="w-[80px] h-[80px] rounded-full bg-[#0B141A] border-2 border-white/10 flex items-center justify-center font-display text-3xl font-black text-vector-primary shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)] mb-8 relative">
                  <span className="absolute inset-0 rounded-full border border-vector-primary/20 animate-ping"></span>
                  1
                </div>
                <h3 className="font-display text-2xl font-bold text-white mb-4">Integrate WhatsApp</h3>
                <p className="text-zinc-400 text-lg leading-relaxed">Scan the secure QR code provided in our web dashboard. Your WhatsApp Business links instantly.</p>
              </motion.div>

              {/* Step 2 */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="flex flex-col items-center text-center"
              >
                <div className="w-[80px] h-[80px] rounded-full bg-[#0B141A] border-2 border-white/10 flex items-center justify-center font-display text-3xl font-black text-emerald-400 shadow-[0_0_30px_-5px_rgba(16,185,129,0.3)] mb-8 relative">
                  2
                </div>
                <h3 className="font-display text-2xl font-bold text-white mb-4">Ingest Knowledge</h3>
                <p className="text-zinc-400 text-lg leading-relaxed">Upload rulebooks, product pricing, delivery zones. Vector reads it and masters your operations in seconds.</p>
              </motion.div>

              {/* Step 3 */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="flex flex-col items-center text-center"
              >
                <div className="w-[80px] h-[80px] rounded-full bg-gradient-to-tr from-vector-primary to-emerald-400 flex items-center justify-center font-display text-3xl font-black text-black shadow-[0_0_40px_rgba(0,255,102,0.6)] mb-8 transform hover:scale-110 transition-transform cursor-default">
                  3
                </div>
                <h3 className="font-display text-2xl font-bold text-white mb-4">Launch Automation</h3>
                <p className="text-zinc-400 text-lg leading-relaxed">Flip the master switch. Vector begins replying, closing deals, and organizing appointments flawlessly.</p>
              </motion.div>
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section className="max-w-4xl mx-auto px-6 py-28 relative z-10">
           <div className="text-center mb-16">
            <h2 className="font-display text-4xl md:text-5xl font-black text-white mb-6">
              Frequently Asked <span className="text-vector-primary">Questions</span>
            </h2>
            <p className="text-zinc-400 text-xl font-medium">Everything you need to know about scaling with Vector.</p>
           </div>
           
           <div className="space-y-4">
              {faqs.map((faq, idx) => (
                 <div key={idx} className="glass-pill border border-white/10 rounded-2xl overflow-hidden bg-[#0B141A]">
                    <button 
                       onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                       className="w-full px-8 py-6 flex items-center justify-between text-left focus:outline-none group"
                    >
                       <span className="font-display font-bold text-lg md:text-xl text-white group-hover:text-vector-primary transition-colors">{faq.question}</span>
                       <div className={`w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0 transition-transform duration-300 ${openFaq === idx ? 'rotate-180 bg-vector-primary/10 text-vector-primary' : 'text-zinc-400'}`}>
                          {openFaq === idx ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                       </div>
                    </button>
                    <AnimatePresence>
                       {openFaq === idx && (
                          <motion.div
                             initial={{ height: 0, opacity: 0 }}
                             animate={{ height: "auto", opacity: 1 }}
                             exit={{ height: 0, opacity: 0 }}
                             transition={{ duration: 0.3, ease: "easeInOut" }}
                          >
                             <div className="px-8 pb-6 text-zinc-400 font-medium leading-relaxed border-t border-white/5 pt-4">
                                {faq.answer}
                             </div>
                          </motion.div>
                       )}
                    </AnimatePresence>
                 </div>
              ))}
           </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="max-w-7xl mx-auto px-6 py-28 relative z-10 mt-16">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 glass-pill px-4 py-1.5 rounded-full mb-6 border-white/10">
              <span className="w-2 h-2 rounded-full bg-vector-primary animate-pulse" />
              <span className="text-sm font-bold uppercase tracking-[0.2em] text-vector-primary">Simple Pricing</span>
            </div>
            <h2 className="font-display text-5xl md:text-6xl font-black text-white mb-8">
              Pricing that makes sense. <br className="hidden md:block" />
              <span className="inline-block mt-3 bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500 text-4xl md:text-5xl">Scale without the overhead.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-10 max-w-4xl mx-auto relative z-10">
            {/* Free Trial */}
            <div className="glass-pill rounded-[2.5rem] p-12 flex flex-col justify-between border border-white/10 hover:border-white/20 transition-all duration-300 bg-[#0B141A]">
              <div>
                 <h3 className="text-2xl font-bold text-white mb-2">Free Trial</h3>
                 <div className="font-display text-[4rem] font-black text-white mb-8 flex items-baseline">
                   0 <span className="text-xl text-zinc-500 font-sans font-medium ml-3 tracking-wide">/ 15 days</span>
                 </div>
                 <ul className="space-y-5 mb-10">
                   {[
                     '50 customer messages',
                     '3 brand voices',
                     'Order taking + catalogue',
                     'Automated appointment booking',
                     'Email support'
                   ].map((feature, i) => (
                     <li key={i} className="flex items-center gap-4 text-zinc-300 font-medium text-lg">
                       <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5 text-zinc-400" />
                       </div>
                       {feature}
                     </li>
                   ))}
                 </ul>
              </div>
              <button onClick={start} className="w-full py-5 rounded-full font-bold text-white bg-white/5 hover:bg-white/10 hover:text-white border border-white/10 transition-colors text-lg">
                Start Free Trial
              </button>
            </div>

            {/* Pro */}
            <div className="rounded-[2.5rem] p-12 flex flex-col justify-between bg-gradient-to-b from-vector-primary to-emerald-700 text-black relative transform md:-translate-y-4 shadow-[0_20px_60px_-15px_rgba(0,255,102,0.4)] border border-emerald-400/30">
               <div className="absolute -top-5 right-10 bg-white text-black px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-xl">
                 Most Popular
               </div>
               <div>
                 <h3 className="text-2xl font-bold text-black/90 mb-2">Pro Business</h3>
                 <div className="font-display text-[4rem] font-black text-black mb-8 flex items-start leading-none mt-4">
                   <span className="text-4xl mt-3 opacity-80 mr-1 font-sans">¢</span>100 <span className="text-xl text-black/70 font-sans font-medium mt-auto mb-2 ml-3">/ month</span>
                 </div>
                 <ul className="space-y-5 mb-10">
                   {[
                     'Unlimited messages',
                     'Custom voice style training',
                     'Connect to Calendar & Gmail',
                     'Website import',
                     'Dedicated customer support',
                     'Everything in Free Trial'
                   ].map((feature, i) => (
                     <li key={i} className="flex items-center gap-4 font-semibold text-black/90 text-lg">
                       <div className="w-6 h-6 rounded-full bg-black/10 flex items-center justify-center shrink-0">
                         <CheckCircle className="w-3.5 h-3.5 text-black" />
                       </div>
                       {feature}
                     </li>
                   ))}
                 </ul>
              </div>
              <button onClick={goPro} className="w-full py-5 rounded-full font-bold text-white bg-black hover:bg-zinc-900 transition flex items-center justify-center gap-3 hover:shadow-xl hover:-translate-y-1 duration-300 text-lg">
                Upgrade to Pro <Zap className="w-5 h-5 fill-current" />
              </button>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="max-w-5xl mx-auto px-6 py-28 text-center relative z-10 mt-16">
          <div className="glass-pill rounded-[3rem] p-16 relative overflow-hidden border-vector-primary/20 bg-[#0B141A]">
            <div className="absolute inset-0 bg-gradient-to-b from-vector-primary/10 to-transparent" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-px bg-gradient-to-r from-transparent via-vector-primary/50 to-transparent" />
            <div className="relative z-10 flex flex-col items-center">
              <h2 className="font-display text-4xl md:text-6xl font-black text-white mb-8">
                Ready to achieve <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-vector-primary">10x</span> scale?
              </h2>
              <p className="text-xl text-zinc-400 mb-12 max-w-2xl mx-auto leading-relaxed">
                Join elite entrepreneurs using Vector's AI automation to secure sales 24/7. Never lose a customer to slow replies again.
              </p>
              <button onClick={start} className="bg-gradient-to-r from-vector-primary to-emerald-600 text-black px-12 py-5 rounded-full font-bold text-xl hover:glow-shadow transition-all hover:scale-105 active:scale-95 flex items-center gap-3 shadow-[0_0_40px_rgba(0,255,102,0.4)]">
                Launch Your Agent <ArrowRight className="w-6 h-6" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-20 bg-[#020617] mt-12 relative z-10">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-16 md:gap-8 border-b border-white/5 pb-16">
          <div className="md:col-span-1 flex flex-col gap-8">
            <div className="flex items-center gap-3">
              <Bot className="text-vector-primary w-8 h-8 drop-shadow-[0_0_10px_rgba(0,255,102,0.5)]" />
              <span className="font-display font-black text-2xl text-white tracking-tight">Vector</span>
            </div>
            <p className="text-zinc-500 text-[15px] leading-relaxed max-w-xs font-medium">
              Vector is an Eastern AI product.<br/><br/>
              Intelligent automation solutions that never sleep. Scale confidently.
            </p>
          </div>
          
          <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-10 pl-0 md:pl-10">
            <div className="flex flex-col gap-5">
              <h4 className="text-xs font-black text-white tracking-[0.2em] uppercase mb-2">Product</h4>
              <a href="#features" className="text-zinc-400 hover:text-white transition-colors text-[15px] font-medium">Features</a>
              <a href="#how-it-works" className="text-zinc-400 hover:text-white transition-colors text-[15px] font-medium">How it works</a>
              <a href="#pricing" className="text-zinc-400 hover:text-white transition-colors text-[15px] font-medium">Pricing</a>
            </div>

            <div className="flex flex-col gap-5">
              <h4 className="text-xs font-black text-white tracking-[0.2em] uppercase mb-2">Company</h4>
              <a href="#" className="text-zinc-400 hover:text-white transition-colors text-[15px] font-medium">About Eastern AI</a>
              <a href="#" className="text-zinc-400 hover:text-white transition-colors text-[15px] font-medium">Our Story</a>
              <a href="#" className="text-zinc-400 hover:text-white transition-colors text-[15px] font-medium">Contact Us</a>
            </div>

            <div className="flex flex-col gap-5">
              <h4 className="text-xs font-black text-white tracking-[0.2em] uppercase mb-2">Legal</h4>
              <a href="#" className="text-zinc-400 hover:text-white transition-colors text-[15px] font-medium">Privacy Policy</a>
              <a href="#" className="text-zinc-400 hover:text-white transition-colors text-[15px] font-medium">Terms of Service</a>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-8 flex flex-col md:flex-row items-center justify-between gap-6">
           <div className="text-[15px] text-zinc-600 font-medium">
             © {new Date().getFullYear()} Eastern AI. All rights reserved.
           </div>
           <div className="flex items-center gap-4 text-zinc-500 text-[15px] font-bold">
             <span>Design powered by <span className="text-white">EasternAI</span></span>
           </div>
        </div>
      </footer>
    </div>
  );
}
