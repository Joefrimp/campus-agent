import { motion } from 'motion/react';
import { Bot, Calendar, TrendingUp, Smile, Paperclip, Mic, Check, Play } from 'lucide-react';

export const SceneSneakerHub = () => (
  <motion.div
    key="scene0"
    initial={{ opacity: 0, scale: 0.8, rotate: -5, y: 100 }}
    animate={{ opacity: 1, scale: 1, rotate: 0, y: 0, zIndex: 10 }}
    exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)', transition: { duration: 0.5 } }}
    transition={{ type: "spring", stiffness: 200, damping: 20 }}
    className="absolute inset-0 w-full h-full glass-pill rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden flex flex-col bg-[#0B141A]"
  >
     <div className="bg-[#202C33] px-5 py-4 flex items-center gap-4 relative z-10 shadow-[0_2px_10px_rgba(0,0,0,0.5)] cursor-pointer">
        <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
          <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop" alt="Michael" className="w-full h-full object-cover" />
        </div>
        <div>
          <h3 className="font-bold text-[#E9EDEF] text-[16px]">Michael 👟</h3>
          <p className="text-[13px] text-[#8696A0]">Vector handled this • 0 owner replies</p>
        </div>
     </div>
     <div className="flex-1 px-4 py-6 overflow-hidden relative flex flex-col justify-center space-y-4 pb-[80px]"
          style={{ backgroundImage: 'radial-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), radial-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="chat-bubble customer self-start text-[15px]">
             Hi do you have Jordan 4s today?
         </motion.div>
         <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: [0, 1, 0, 0], scale: [0.8, 1, 1, 0.8], display: ['flex', 'flex', 'none', 'none'] }} transition={{ delay: 1.2, duration: 1.5, times: [0, 0.1, 0.9, 1] }} className="chat-bubble vector self-end bg-[#005C4B] mb-2 px-3 py-2 flex items-center gap-1.5 h-8">
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.7 }} className="chat-bubble vector self-end text-[15px]">
             Hey! Yes 👟 Today's Jordan 4s are ₵1200. We have sizes 42-45. Want one set aside?
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 4.5 }} className="chat-bubble customer self-start text-[15px]">
             Size 43. Hall 7. Sending momo
         </motion.div>
         <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 5.5 }} className="chat-bubble customer self-start flex flex-col gap-1 p-2 w-[200px]">
             <div className="w-full bg-[#128C7E]/20 border border-[#128C7E]/30 rounded p-2 flex flex-col gap-1 overflow-hidden relative text-left">
                <span className="text-[10px] font-bold text-[#128C7E] uppercase tracking-wide">MTN Mobile Money</span>
                <span className="text-[14px] font-black text-white/90">GH¢ 1,200.00</span>
                <span className="text-[10px] text-white/70">Payment to Sneaker Hub</span>
                <span className="text-[9px] text-white/50 mt-1">Trans ID: 1938472910</span>
             </div>
             <span className="text-[12px] text-[#8696A0] ml-1 mt-1">Screenshot_2026.jpg</span>
         </motion.div>
         <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: [0, 1, 0, 0], scale: [0.8, 1, 1, 0.8], display: ['flex', 'flex', 'none', 'none'] }} transition={{ delay: 6.5, duration: 1.5, times: [0, 0.1, 0.9, 1] }} className="chat-bubble vector self-end bg-[#005C4B] mb-2 px-3 py-2 flex items-center gap-1.5 h-8">
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 8.0 }} className="chat-bubble vector self-end bg-gradient-to-r from-[#005C4B] to-[#014d3f] border border-[#005C4B]/50 shadow-[0_0_15px_rgba(0,168,132,0.2)] text-[15px]">
             Got it ✅ Order #142 confirmed for 6:45pm. Payment received. See you soon!
         </motion.div>
     </div>
     <WhatsAppBottomBar />
  </motion.div>
);

export const SceneKicksLounge = () => (
  <motion.div
    key="scene1"
    initial={{ opacity: 0, scale: 0.8, rotate: 5, y: -50 }}
    animate={{ opacity: 1, scale: 1, rotate: 0, y: 0, zIndex: 10 }}
    exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)', transition: { duration: 0.5 } }}
    transition={{ type: "spring", stiffness: 200, damping: 20 }}
    className="absolute inset-0 w-full h-full glass-pill rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden flex flex-col bg-[#0B141A]"
  >
     <div className="bg-[#202C33] px-5 py-4 flex items-center gap-4 relative z-10 shadow-sm border-b border-[#0B141A] cursor-pointer">
        <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
          <img src="https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=100&h=100&fit=crop" alt="Customer" className="w-full h-full object-cover" />
        </div>
        <div>
          <h3 className="font-bold text-[#E9EDEF] text-[16px] leading-tight">+233 20 987 6543 <span className="text-[12px] font-normal text-[#8696A0] ml-1">~ Alex</span></h3>
          <p className="text-[13px] text-vector-primary font-medium tracking-widest">● LIVE CONVO</p>
        </div>
     </div>
     <div className="flex-1 px-4 py-6 overflow-hidden relative flex flex-col justify-center space-y-4 pb-[80px]"
          style={{ backgroundImage: 'radial-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), radial-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '30px 30px' }}>
         <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="chat-bubble customer self-start flex flex-col gap-1 p-2 w-[220px]">
             <div className="flex items-center gap-1 text-[11px] text-white/50 italic mb-1 px-1">
                 <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                 </svg>
                 Forwarded
             </div>
             <div className="w-full h-32 bg-white/5 rounded flex items-center justify-center overflow-hidden relative border border-white/10">
                 <img src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop" alt="Forwarded product" className="absolute inset-0 w-full h-full object-cover" />
             </div>
             <span className="text-[15px] px-1 mt-1 text-[#E9EDEF]">hey, do u guys have this? saw it in another group.</span>
         </motion.div>
         <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: [0, 1, 0, 0], scale: [0.8, 1, 1, 0.8], display: ['flex', 'flex', 'none', 'none'] }} transition={{ delay: 2.0, duration: 2.5, times: [0, 0.1, 0.9, 1] }} className="chat-bubble vector self-end bg-[#005C4B] mb-2 px-3 py-2 flex items-center gap-1.5 h-8">
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 4.8 }} className="chat-bubble vector self-end text-[15px] max-w-[85%] bg-gradient-to-br from-[#005C4B] to-[#014d3f] shadow-[0_0_20px_rgba(0,168,132,0.2)]">
             Yes we do! 👟 That's the Nike React in Red. It's GH¢420. We have sizes 40, 42, and 45 in stock.
             <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-1.5 tracking-wide">
                 <div className="flex justify-between items-center text-[10px] text-vector-primary font-bold uppercase">
                     <span>Vision Analysis</span>
                     <span className="text-black bg-vector-primary px-1.5 py-0.5 rounded-sm">99% MATCH</span>
                 </div>
                 <span className="text-[12px] text-[#E9EDEF]/80 font-medium leading-tight">Found in your catalogue: 'Nike React Phantom Run Flyknit 2'</span>
             </div>
         </motion.div>
     </div>
     <WhatsAppBottomBar />
  </motion.div>
);

export const SceneBraidsBooking = () => (
  <motion.div
    key="scene2"
    initial={{ opacity: 0, scale: 0.8, rotate: -5, y: -50 }}
    animate={{ opacity: 1, scale: 1, rotate: 0, y: 0, zIndex: 10 }}
    exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)', transition: { duration: 0.5 } }}
    transition={{ type: "spring", stiffness: 200, damping: 20 }}
    className="absolute inset-0 w-full h-full glass-pill rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden flex flex-col bg-[#0B141A]"
  >
     <div className="bg-[#202C33] px-5 py-4 flex items-center gap-4 relative z-10 shadow-sm border-b border-[#0B141A] cursor-pointer">
        <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
          <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop" alt="Sarah" className="w-full h-full object-cover" />
        </div>
        <div>
          <h3 className="font-bold text-[#E9EDEF] text-[16px]">Sarah 💅</h3>
          <p className="text-[13px] text-vector-primary font-medium tracking-widest">● LIVE CONVO</p>
        </div>
     </div>
     <div className="flex-1 px-4 py-6 overflow-hidden relative flex flex-col justify-center space-y-5 pb-[80px]"
          style={{ backgroundImage: 'radial-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), radial-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '30px 30px' }}>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="chat-bubble customer self-start text-[16px]">
             how much braids?
         </motion.div>
         <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: [0, 1, 0, 0], scale: [0.8, 1, 1, 0.8], display: ['flex', 'flex', 'none', 'none'] }} transition={{ delay: 1.2, duration: 1.5, times: [0, 0.1, 0.9, 1] }} className="chat-bubble vector self-end bg-[#005C4B] mb-2 px-3 py-2 flex items-center gap-1.5 h-8">
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.7 }} className="chat-bubble vector self-end text-[16px] max-w-[90%] bg-gradient-to-br from-[#005C4B] to-[#014d3f]">
             From ₵80 (knotless small) up to ₵250 (jumbo with curls). Want to book?
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 4.2 }} className="chat-bubble customer self-start text-[16px]">
             tomorrow 10am?
         </motion.div>
         <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: [0, 1, 0, 0], scale: [0.8, 1, 1, 0.8], display: ['flex', 'flex', 'none', 'none'] }} transition={{ delay: 5.0, duration: 1.5, times: [0, 0.1, 0.9, 1] }} className="chat-bubble vector self-end bg-[#005C4B] mb-2 px-3 py-2 flex items-center gap-1.5 h-8">
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 6.5 }} className="chat-bubble vector self-end text-[16px] shadow-[0_0_20px_rgba(0,168,132,0.2)]">
             10am Tue is open ✅ Booking now... done. See you tomorrow at 10!
             <div className="mt-4 pt-3 border-t border-white/10 text-xs text-vector-primary font-bold flex justify-between items-center tracking-wide">
                 <span>0.8s avg latency</span>
                 <span className="text-black bg-vector-primary px-2 py-0.5 rounded-md">+1 booking</span>
             </div>
         </motion.div>
     </div>
     <WhatsAppBottomBar />
  </motion.div>
);

export const ScenePaymentAlert = () => (
  <motion.div
    key="scene3"
    initial={{ opacity: 0, scale: 0.8, rotate: 5, y: -50 }}
    animate={{ opacity: 1, scale: 1, rotate: 0, y: 0, zIndex: 10 }}
    exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)', transition: { duration: 0.5 } }}
    transition={{ type: "spring", stiffness: 200, damping: 20 }}
    className="absolute inset-0 w-full h-full glass-pill rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden flex flex-col bg-[#0B141A]"
  >
     <div className="bg-[#202C33] px-5 py-4 flex items-center gap-4 relative z-10 shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
        <div className="w-10 h-10 rounded-full bg-vector-primary flex items-center justify-center">
          <Bot className="text-white w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-[#E9EDEF] text-[16px]">Vector Assistant</h3>
          <p className="text-[13px] text-vector-primary font-medium tracking-widest">● LIVE ALERT</p>
        </div>
     </div>
     <div className="flex-1 px-4 py-6 overflow-hidden relative flex flex-col space-y-4 pb-[80px]"
          style={{ backgroundImage: 'radial-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), radial-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="chat-bubble customer self-start text-[14.5px] leading-relaxed">
             New order placed! <b>#3029</b> for the 💻 MacBook Pro M3.<br/>
             Customer Michael sent a MoMo payment of <b>GH¢ 28,500</b>.
         </motion.div>
         <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: [0, 1, 0, 0], scale: [0.8, 1, 1, 0.8], display: ['flex', 'flex', 'none', 'none'] }} transition={{ delay: 2.0, duration: 1.5, times: [0, 0.1, 0.9, 1] }} className="chat-bubble vector self-end bg-[#005C4B] mb-2 px-3 py-2 flex items-center gap-1.5 h-8">
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 3.5 }} className="chat-bubble customer self-start text-[14.5px] leading-relaxed">
             Please check your MoMo app to confirm the funds. Reply with ✅ once confirmed so I can send his receipt and arrange dispatch.
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 5.5 }} className="chat-bubble vector self-end text-[14.5px] bg-[#005C4B]">
             ✅ Confirmed. Dropped.
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 7.0 }} className="chat-bubble customer self-start text-[14.5px] border border-vector-primary/30 shadow-[0_0_15px_rgba(0,255,102,0.1)] leading-relaxed">
             Perfect! Receipt sent to Michael. Dispatch rider assigned. 🚀
         </motion.div>
     </div>
     <WhatsAppBottomBar />
  </motion.div>
);

export const SceneStockAlert = () => (
  <motion.div
    key="scene4"
    initial={{ opacity: 0, scale: 0.8, rotate: -5, y: 100 }}
    animate={{ opacity: 1, scale: 1, rotate: 0, y: 0, zIndex: 10 }}
    exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)', transition: { duration: 0.5 } }}
    transition={{ type: "spring", stiffness: 200, damping: 20 }}
    className="absolute inset-0 w-full h-full glass-pill rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden flex flex-col bg-[#0B141A]"
  >
     <div className="bg-[#202C33] px-5 py-4 flex items-center gap-4 relative z-10 shadow-sm border-b border-[#0B141A]">
        <div className="w-10 h-10 rounded-full bg-vector-primary flex items-center justify-center glow-shadow">
          <TrendingUp className="text-black w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-[#E9EDEF] text-[16px]">Vector Assistant</h3>
          <p className="text-[13px] text-vector-primary font-medium tracking-widest">● INSIGHT</p>
        </div>
     </div>
     <div className="flex-1 px-4 py-6 overflow-hidden relative flex flex-col justify-center space-y-5 pb-[80px]"
          style={{ backgroundImage: 'radial-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), radial-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '30px 30px' }}>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="chat-bubble customer self-start text-[14.5px] leading-relaxed">
             Heads up! We've had 14 inquiries today for the <b>HP EliteBook 840 G8</b>, but we're down to just <b>2 units</b> in stock. 📉
         </motion.div>
         <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: [0, 1, 0, 0], scale: [0.8, 1, 1, 0.8], display: ['flex', 'flex', 'none', 'none'] }} transition={{ delay: 2.0, duration: 1.5, times: [0, 0.1, 0.9, 1] }} className="chat-bubble vector self-end bg-[#005C4B] mb-2 px-3 py-2 flex items-center gap-1.5 h-8">
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 3.5 }} className="chat-bubble customer self-start text-[14.5px] leading-relaxed">
             You might want to contact the supplier for a restock soon so we don't miss out on upcoming weekend sales.
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 5.0 }} className="chat-bubble vector self-end text-[14.5px] bg-[#005C4B]">
             Thanks! Calling them now.
         </motion.div>
     </div>
     <WhatsAppBottomBar />
  </motion.div>
);

export const SceneTechHub = () => (
  <motion.div
    key="scene5"
    initial={{ opacity: 0, scale: 0.8, rotate: -5, y: -50 }}
    animate={{ opacity: 1, scale: 1, rotate: 0, y: 0, zIndex: 10 }}
    exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)', transition: { duration: 0.5 } }}
    transition={{ type: "spring", stiffness: 200, damping: 20 }}
    className="absolute inset-0 w-full h-full glass-pill rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden flex flex-col bg-[#0B141A]"
  >
     <div className="bg-[#202C33] px-5 py-4 flex items-center gap-4 relative z-10 shadow-sm border-b border-[#0B141A] cursor-pointer">
        <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
          <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop" alt="Customer" className="w-full h-full object-cover" />
        </div>
        <div>
          <h3 className="font-bold text-[#E9EDEF] text-[16px] leading-tight">+234 81 234 5678</h3>
          <p className="text-[13px] text-vector-primary font-medium tracking-widest">● LIVE CONVO</p>
        </div>
     </div>
     <div className="flex-1 px-4 py-6 overflow-hidden relative flex flex-col space-y-3 pb-[80px] overflow-y-auto"
          style={{ backgroundImage: 'radial-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), radial-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '30px 30px' }}>
         <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="chat-bubble customer self-start flex flex-col gap-1 p-2 w-[220px]">
             <span className="text-[14.5px] px-1 text-[#E9EDEF]">Hi, do you have the Lenovo Legion 5 Pro in stock?</span>
         </motion.div>
         <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: [0, 1, 0, 0], scale: [0.8, 1, 1, 0.8], display: ['flex', 'flex', 'none', 'none'] }} transition={{ delay: 1.5, duration: 1.5, times: [0, 0.1, 0.9, 1] }} className="chat-bubble vector self-end bg-[#005C4B] mb-2 px-3 py-2 flex items-center gap-1.5 h-8">
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 3.0 }} className="chat-bubble vector self-end text-[14.5px] max-w-[85%] bg-gradient-to-br from-[#005C4B] to-[#014d3f] shadow-[0_0_20px_rgba(0,168,132,0.2)]">
             Unfortunately, the Legion 5 Pro is currently out of stock. 😔<br/><br/>However, we have these excellent alternatives available:
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 4.5 }} className="chat-bubble vector self-end text-[14.5px] max-w-[85%] bg-[#005C4B] p-2 flex flex-col gap-2">
             <div className="w-full h-24 bg-white/5 rounded flex items-center justify-center overflow-hidden relative border border-white/10">
                 <img src="https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=400&h=400&fit=crop" alt="Dell XPS" className="absolute inset-0 w-full h-full object-cover" />
             </div>
             <div className="px-1 text-[13.5px] leading-snug">
                 <b>Dell XPS 15 (2024)</b><br/>
                 Core i7, 16GB RAM, RTX 4050.<br/>
                 GH¢ 18,500
             </div>
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 5.5 }} className="chat-bubble vector self-end text-[14.5px] max-w-[85%] bg-[#005C4B] p-2 flex flex-col gap-2">
             <div className="w-full h-24 bg-white/5 rounded flex items-center justify-center overflow-hidden relative border border-white/10">
                 <img src="https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=400&h=400&fit=crop" alt="MacBook Pro" className="absolute inset-0 w-full h-full object-cover" />
             </div>
             <div className="px-1 text-[13.5px] leading-snug">
                 <b>MacBook Pro 14" (M3)</b><br/>
                 M3 Pro chip, 18GB RAM.<br/>
                 GH¢ 21,200
             </div>
         </motion.div>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 6.5 }} className="chat-bubble vector self-end text-[14.5px] max-w-[85%] bg-[#005C4B]">
             Would you like more details on either of these?
         </motion.div>
     </div>
     <WhatsAppBottomBar />
  </motion.div>
);

export const SceneNailVoiceNote = () => (
  <motion.div
    key="scene6"
    initial={{ opacity: 0, scale: 0.8, rotate: 5, y: -50 }}
    animate={{ opacity: 1, scale: 1, rotate: 0, y: 0, zIndex: 10 }}
    exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)', transition: { duration: 0.5 } }}
    transition={{ type: "spring", stiffness: 200, damping: 20 }}
    className="absolute inset-0 w-full h-full glass-pill rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden flex flex-col bg-[#0B141A]"
  >
     <div className="bg-[#202C33] px-5 py-4 flex items-center gap-4 relative z-10 shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
        <div className="w-10 h-10 rounded-full bg-vector-primary flex items-center justify-center">
          <Bot className="text-white w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-[#E9EDEF] text-[16px]">Vector Assistant</h3>
          <p className="text-[13px] text-vector-primary font-medium tracking-widest">● LIVE ALERT</p>
        </div>
     </div>
     <div className="flex-1 px-4 py-6 overflow-hidden relative flex flex-col space-y-4 pb-[80px]"
          style={{ backgroundImage: 'radial-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), radial-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="chat-bubble customer self-start text-[14.5px] leading-relaxed w-[260px]">
             <div className="text-[12px] text-[#128C7E] font-bold mb-1">New Voice Note from Chloe 💅</div>
             <div className="flex items-center gap-2 bg-black/20 p-2 rounded-full mb-2">
                <div className="w-8 h-8 rounded-full bg-vector-primary flex items-center justify-center">
                    <Play className="w-4 h-4 text-black ml-0.5" />
                </div>
                <div className="flex-1 h-1 bg-white/20 rounded-full relative">
                    <div className="absolute left-0 top-0 bottom-0 w-1/3 bg-vector-primary rounded-full"></div>
                </div>
                <div className="text-[11px] text-white/50">0:14</div>
             </div>
             <div className="text-[11px] text-white/50 italic mb-1">Transcription:</div>
             "Hey, um... I wanted to find out if I can pop in for a quick acrylic refill and maybe some french tips around 4pm today?"
         </motion.div>
         
         <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: [0, 1, 0, 0], scale: [0.8, 1, 1, 0.8], display: ['flex', 'flex', 'none', 'none'] }} transition={{ delay: 2.0, duration: 1.5, times: [0, 0.1, 0.9, 1] }} className="chat-bubble vector self-end bg-[#005C4B] mb-2 px-3 py-2 flex items-center gap-1.5 h-8">
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
             <span className="w-1.5 h-1.5 bg-vector-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
         </motion.div>
         
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 3.5 }} className="chat-bubble customer self-start text-[14.5px] leading-relaxed">
             Should I let her know we only have a slot at 4:30pm instead?
         </motion.div>
         
         <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 5.5 }} className="chat-bubble vector self-end text-[14.5px] bg-[#005C4B]">
             Yeah, 4:30 works. Tell her french tips are an extra ₵30.
         </motion.div>
         
         <motion.div initial={{ opacity: 0, y: 15, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 7.0 }} className="chat-bubble customer self-start text-[14.5px] border border-vector-primary/30 shadow-[0_0_15px_rgba(0,255,102,0.1)] leading-relaxed">
             Done! ✅ Booked her for 4:30pm and informed her about the ₵30 extra.
         </motion.div>
     </div>
     <WhatsAppBottomBar />
  </motion.div>
);

export const SceneMemoryEngine = () => (
  <motion.div
    key="scene7"
    initial={{ opacity: 0, scale: 0.8, y: 50 }}
    animate={{ opacity: 1, scale: 1, y: 0, zIndex: 10 }}
    exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)', transition: { duration: 0.5 } }}
    transition={{ type: "spring", stiffness: 200, damping: 20 }}
    className="absolute inset-0 w-full h-full glass-pill rounded-[2.5rem] shadow-2xl border border-white/10 flex flex-col p-8 bg-[#030303] items-center justify-center relative overflow-hidden"
  >
     <div className="absolute top-[-20%] right-[-20%] w-[80%] h-[80%] bg-vector-primary/10 rounded-full blur-[80px]" />
     <div className="absolute bottom-[-20%] left-[-20%] w-[80%] h-[80%] bg-emerald-600/10 rounded-full blur-[80px]" />
     <div className="w-full relative z-10">
        <div className="text-xs font-black tracking-[0.25em] text-vector-primary mb-4 inline-flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-vector-primary" />
          08 • MEMORY ENGINE
        </div>
        <h3 className="font-display text-[2.5rem] font-bold text-white mb-8 leading-[1.1] tracking-tight">
           Writes more like <br/>
           <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-vector-primary drop-shadow-[0_0_10px_rgba(0,255,102,0.3)]">you</span> every week.
        </h3>
        <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1 }}
            className="bg-[#0A1A21]/80 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)]"
        >
           <div className="text-[11px] font-bold text-zinc-400 mb-5 flex items-center gap-2 tracking-widest uppercase">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-vector-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-vector-primary"></span>
              </span>
              Dynamic Style Learned
           </div>
           <ul className="space-y-4">
              <motion.li initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.5 }} className="flex gap-3 text-[15px] font-medium text-[#E9EDEF]">
                 <Check className="w-5 h-5 text-vector-primary shrink-0" /> Use "boss" instead of "sir"
              </motion.li>
              <motion.li initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 2.2 }} className="flex gap-3 text-[15px] font-medium text-[#E9EDEF]">
                 <Check className="w-5 h-5 text-vector-primary shrink-0" /> Mention free delivery over ₵100
              </motion.li>
              <motion.li initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 2.9 }} className="flex gap-3 text-[15px] font-medium text-zinc-500 line-through">
                 <span className="text-orange-500 font-bold ml-1 font-mono">~</span> <span className="ml-[3px]">Avoid emojis on complaints</span>
              </motion.li>
           </ul>
           <div className="mt-5 pt-4 border-t border-white/5 text-[11px] font-medium text-zinc-500 tracking-wide text-center">
              Updated from 47 conversations
           </div>
        </motion.div>
     </div>
  </motion.div>
);

const WhatsAppBottomBar = () => (
   <div className="bg-[#202C33] px-3 py-3 flex items-center gap-2 absolute bottom-0 left-0 right-0 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
      <div className="flex-1 bg-[#2A3942] rounded-full px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smile className="w-6 h-6 text-[#8696A0]" />
          <span className="text-[#8696A0] text-[15px]">Message</span>
        </div>
        <Paperclip className="w-5 h-5 text-[#8696A0] opacity-80" />
      </div>
      <div className="w-[42px] h-[42px] rounded-full bg-vector-primary flex items-center justify-center shadow-lg shrink-0">
        <Mic className="w-5 h-5 text-[#0B141A] ml-0.5" />
      </div>
   </div>
);
