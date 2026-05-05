import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Button } from '@/src/components/ui/button';
import { QrCode, CheckCircle2, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/src/lib/utils';

const connectionTexts = [
  "Initializing Agent Personality...",
  "Bridging WhatsApp Securely...",
  "Syncing Vector Knowledge Base...",
  "Finalizing Core Setup..."
];

export default function OnboardingFlow() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    businessName: '',
    whatsappNumber: '',
    brandVoice: 'Professional',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deployProgress, setDeployProgress] = useState(0);
  const [deployText, setDeployText] = useState(connectionTexts[0]);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [whapiToken, setWhapiToken] = useState(import.meta.env.VITE_WHAPI_TOKEN || '');
  const [isFetchingQr, setIsFetchingQr] = useState(false);

  const handleNext = () => setStep(step + 1);
  const handleBack = () => setStep(step - 1);

  const fetchLiveQR = async () => {
    if (!whapiToken) return;
    setIsFetchingQr(true);
    setQrCodeData(null);
    try {
      const response = await fetch('https://gate.whapi.cloud/users/login', {
        headers: {
          'Authorization': `Bearer ${whapiToken}`,
          'Accept': 'application/json'
        }
      });
      const data = await response.json();
      if (data && data.qr) {
        setQrCodeData(data.qr);
      } else {
        alert("Could not fetch QR code. Please check if the token is valid, or if the instance is already connected.");
      }
    } catch (e) {
      console.error(e);
      alert("Error contacting Whapi.cloud API.");
    } finally {
      setIsFetchingQr(false);
    }
  };

  useEffect(() => {
    if (step === 2 && whapiToken) {
      fetchLiveQR();
    }
  }, [step]);

  const handleVerifyQR = () => {
    setIsVerifying(true);
    // Simulate connection delay
    setTimeout(() => {
      setIsVerifying(false);
      handleNext();
    }, 2500);
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    
    // Simulate real-time progress steps for UI polish
    for (let i = 0; i < connectionTexts.length; i++) {
        setDeployText(connectionTexts[i]);
        setDeployProgress((i / (connectionTexts.length - 1)) * 100);
        await new Promise(r => setTimeout(r, 800)); // 0.8s per step
    }

    try {
      // 1. Save to Supabase
      if (supabase) {
        // We'll ignore errors here to allow prototype to continue even if table schema is out of date
        await supabase.from('businesses').insert({
          business_name: formData.businessName,
          whatsapp_number: formData.whatsappNumber,
          status: 'active'
        }).catch(err => console.warn("Supabase insert warning:", err));
      }

      // 2. Trigger Eastern AI Core webhook
      const webhookUrl = import.meta.env.VITE_N8N_ONBOARDING_WEBHOOK;
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData) // Fire and forget
          });
        } catch (webhookErr) {
          console.warn("Webhook warning:", webhookErr);
        }
      }

      localStorage.setItem('ea_agent_status', 'active');
      window.dispatchEvent(new Event('agent_status_changed'));
      setStep(4); // Success step
    } catch (error) {
      console.error('Failed to initialize agent:', error);
      // Fallback success for prototype
      localStorage.setItem('ea_agent_status', 'active');
      window.dispatchEvent(new Event('agent_status_changed'));
      setStep(4);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="mb-8 relative flex items-center justify-between">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-secondary -z-10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500 ease-in-out" 
            style={{ width: `${((step - 1) / 3) * 100}%` }} 
          />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div 
            key={i} 
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 z-10 transition-colors
              ${step >= i ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-[#141417] text-slate-500 border-white/10'}`}
          >
            {i}
          </div>
        ))}
      </div>

      <Card>
        {step === 1 && (
          <>
            <CardHeader className="pb-4">
              <CardTitle>Business Details</CardTitle>
              <CardDescription>Tell us about your campus business.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name</Label>
                <Input 
                  id="businessName" 
                  placeholder="e.g. Eastern Apparel" 
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  className="bg-black/20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsappNumber">Primary WhatsApp Number</Label>
                <Input 
                  id="whatsappNumber" 
                  placeholder="+1 (555) 000-0000" 
                  value={formData.whatsappNumber}
                  onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                  className="bg-black/20"
                />
              </div>
              <div className="space-y-3 pt-2">
                <Label>Brand Voice</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {['Professional', 'Hype-Man', 'Problem Solver'].map(voice => (
                    <div 
                      key={voice}
                      onClick={() => setFormData({...formData, brandVoice: voice})}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${formData.brandVoice === voice ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-white/10 bg-black/20 text-slate-400 hover:border-white/20'}`}
                    >
                      <div className="font-semibold text-sm mb-1 text-slate-200">{voice}</div>
                      <div className="text-[10px] leading-tight opacity-80">
                        {voice === 'Professional' && "Clear, concise, executive tone."}
                        {voice === 'Hype-Man' && "Energetic, engaging, emoji-heavy."}
                        {voice === 'Problem Solver' && "Empathetic, detailed, helpful."}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end pt-4">
              <Button onClick={handleNext} disabled={!formData.businessName || !formData.whatsappNumber} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Next <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </CardFooter>
          </>
        )}

        {step === 2 && (
          <>
            <CardHeader className="pb-4">
              <CardTitle>WhatsApp Bridge</CardTitle>
              <CardDescription>Scan this QR code with your business WhatsApp to securely bridge your account.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-6 pt-2">
              <div className="w-full mb-6">
                <Label htmlFor="whapiToken" className="text-xs text-slate-400 mb-2 block">Whapi.Cloud API Token (for live QR code)</Label>
                <div className="flex gap-2">
                  <Input 
                    id="whapiToken" 
                    type="password"
                    placeholder="Enter your Whapi channel token..." 
                    value={whapiToken}
                    onChange={(e) => setWhapiToken(e.target.value)}
                    className="bg-black/20 text-sm"
                  />
                  <Button 
                    onClick={fetchLiveQR} 
                    disabled={!whapiToken || isFetchingQr}
                    className="bg-white/10 hover:bg-white/20"
                  >
                    {isFetchingQr ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fetch QR'}
                  </Button>
                </div>
              </div>

              <div className="w-64 h-64 bg-white rounded-2xl p-4 flex items-center justify-center shadow-inner border border-white/10 relative">
                {qrCodeData ? (
                  <div className={cn("transition-all duration-500", isVerifying ? "opacity-50 blur-sm" : "opacity-100")}>
                    <QRCodeSVG 
                      value={qrCodeData} 
                      size={220}
                      level={"L"}
                      includeMargin={false}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                    <span className="text-xs text-slate-500 font-medium px-4">Waiting for Token to fetch live Whapi QR...</span>
                  </div>
                )}
                {isVerifying && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/10 backdrop-blur-[2px] rounded-2xl">
                    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-2" />
                    <span className="text-sm font-semibold text-indigo-900 bg-white/80 px-3 py-1 rounded-full">Verifying...</span>
                  </div>
                )}
              </div>
              <p className="text-sm border border-indigo-500/20 bg-indigo-500/10 text-indigo-300 rounded-lg px-4 py-2 mt-6 font-medium">
                Powered by Whapi.cloud & Eastern AI
              </p>
            </CardContent>
            <CardFooter className="flex justify-between pt-4">
              <Button variant="outline" onClick={handleBack} disabled={isVerifying} className="bg-white/5 border-white/10 hover:bg-white/10">Back</Button>
              <Button onClick={handleVerifyQR} disabled={isVerifying || !qrCodeData} className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[140px]">
                {isVerifying ? 'Connecting...' : 'I have scanned the QR'}
              </Button>
            </CardFooter>
          </>
        )}

        {step === 3 && (
          <>
            <CardHeader className="pb-4">
              <CardTitle>Initialize Agent</CardTitle>
              <CardDescription>Review your details before we deploy your autonomous lead.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="bg-black/30 p-5 rounded-xl border border-white/10 text-sm space-y-3">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-slate-400">Business Name</span>
                  <span className="font-semibold text-slate-200">{formData.businessName}</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-slate-400">WhatsApp Number</span>
                  <span className="font-semibold text-slate-200 truncate ml-4">{formData.whatsappNumber}</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-slate-400">Brand Voice</span>
                  <span className="font-semibold text-slate-200">{formData.brandVoice}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Core Engine</span>
                  <span className="font-semibold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded">Eastern AI Core</span>
                </div>
              </div>

              {isSubmitting && (
                <div className="mt-8 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-indigo-400 font-medium flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {deployText}
                    </span>
                    <span className="text-slate-500">{Math.round(deployProgress)}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 transition-all duration-300 ease-out"
                      style={{ width: `${deployProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between pt-4">
              <Button variant="outline" onClick={handleBack} disabled={isSubmitting} className="bg-white/5 border-white/10 hover:bg-white/10">Back</Button>
              <Button onClick={handleComplete} disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white win-w-[140px]">
                {isSubmitting ? 'Deploying...' : 'Deploy Agent'}
              </Button>
            </CardFooter>
          </>
        )}

        {step === 4 && (
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <div className="w-20 h-20 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center mb-4 border border-indigo-500/20 shadow-[0_0_30px_rgba(79,70,229,0.2)]">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-semibold text-white">Agent Deployed Successfully</h3>
            <p className="text-slate-400 max-w-sm leading-relaxed">
              Your autonomous AI lead is now monitoring interactions for <span className="text-slate-200">{formData.whatsappNumber}</span>. You can view its activity on the dashboard.
            </p>
            <Button className="mt-8 bg-white text-black hover:bg-slate-200 font-semibold px-8" onClick={() => window.location.hash = '#/'}>
              Go to Dashboard
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
