import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { AuthContext, UserData } from '@/src/lib/auth';
import { BackgroundNodes } from '@/src/components/BackgroundNodes';
import { supabase } from '@/src/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ShieldCheck, Mail, MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';

export default function LandingAuth() {
  const [step, setStep] = useState(1); // 1 = Pricing/Landing, 2 = Signup, 3 = OTP
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    businessName: '',
    email: '',
    whatsappNumber: '',
    password: ''
  });
  const [otpCode, setOtpCode] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);
  const navigate = useNavigate();

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const p = e.target.value;
    setFormData({ ...formData, password: p });
    let strength = 0;
    if (p.length > 5) strength += 25;
    if (p.match(/[A-Z]/)) strength += 25;
    if (p.match(/[0-9]/)) strength += 25;
    if (p.match(/[^A-Za-z0-9]/)) strength += 25;
    setPasswordStrength(strength);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const RequestAuth = async () => {
    if (!formData.email || !formData.password || !formData.businessName) return;
    
    if (supabase) {
      setIsSubmitting(true);
      
      // Try to sign up first
      let { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            business_name: formData.businessName,
            whatsapp_number: formData.whatsappNumber
          }
        }
      });
      
      // If user exists, try signing in with OTP instead of password
      if (error && error.message.includes('User already registered')) {
        const otpRes = await supabase.auth.signInWithOtp({
          email: formData.email,
          options: {
            emailRedirectTo: window.location.origin,
          }
        });
        error = otpRes.error;
      }
      
      setIsSubmitting(false);
      
      if (error) {
        if (error.message.includes('rate limit')) {
           alert(`Supabase Email Rate Limit Reached: ${error.message}\n\nTip: You can use a different email to test, or disable "Enable email confirmations" in your Supabase Auth dashboard temporarily.`);
           return;
        }
        alert(`Authentication failed: ${error.message}\nIf using OTP, please ensure Email OTP is enabled in Supabase Auth config.`);
        return;
      }
      
      setStep(3);
    } else {
      // Demo fallback
      setStep(3);
    }
  };

  const VerifyOTP = async () => {
    if (otpCode.length === 6) {
      if (supabase) {
        setIsSubmitting(true);
        // Try verifying as signup
        let { data, error } = await supabase.auth.verifyOtp({
          email: formData.email,
          token: otpCode,
          type: 'signup'
        });
        
        // If it fails, try verifying as email login (magic link OTP)
        if (error) {
          const loginVerify = await supabase.auth.verifyOtp({
             email: formData.email,
             token: otpCode,
             type: 'email'
          });
          data = loginVerify.data;
          error = loginVerify.error;
        }

        setIsSubmitting(false);

        if (error) {
          alert(`Verification Failed: ${error.message}`);
          return;
        }

        if (data.session || data.user) {
          const sbUser = data.session?.user || data.user;
          AuthContext.login({
            firstName: sbUser?.user_metadata?.first_name || formData.firstName,
            lastName: sbUser?.user_metadata?.last_name || formData.lastName,
            businessName: sbUser?.user_metadata?.business_name || formData.businessName,
            email: sbUser?.email || formData.email,
            whatsappNumber: sbUser?.user_metadata?.whatsapp_number || formData.whatsappNumber
          });
          navigate('/');
        } else {
          alert("Unexpected auth result. Please try again.");
        }
      } else {
        // Fallback demo mode behavior
        if (otpCode === '123456') {
          AuthContext.login(formData as UserData);
          navigate('/');
        } else {
          alert("Demo Mode: Please enter '123456' as the OTP.");
        }
      }
    }
  };

  const handleGoogleAuth = async () => {
    if (supabase) {
      // Use standard Supabase OAuth redirect for actual Supabase configuration
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          skipBrowserRedirect: false,
          redirectTo: `${window.location.origin}/`,
        }
      });
      
      if (error) {
        console.error('OAuth error:', error);
        alert(`Supabase OAuth Error: ${error.message}\n\nPlease ensure you have enabled the "Google" Auth Provider in your Supabase project dashboard.`);
      }
    } else {
      // Demo mode fallback when no valid URL is provided via .env
      const authWindow = window.open('https://accounts.google.com/signin/v2/identifier', 'mock_google', 'width=600,height=700');
      
      const timer = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(timer);
          AuthContext.login({
            firstName: 'Chief',
            lastName: 'Google',
            businessName: 'My Awesome Biz',
            email: 'user@example.com',
            whatsappNumber: '+1234567890'
          });
          navigate('/');
        }
      }, 500);
      
      setTimeout(() => {
        if (!authWindow?.closed) {
          authWindow?.close();
        }
      }, 3500);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <BackgroundNodes />
      
      <div className="relative z-10 w-full max-w-5xl">
        {step === 1 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center font-bold text-white text-3xl mx-auto mb-6 shadow-[0_0_40px_rgba(99,102,241,0.5)]">
              E
            </div>
            <h1 className="text-5xl font-semibold tracking-tight text-white mb-4">Eastern AI</h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-12">
              Autonomous AI Ops for Campus Entrepreneurs. Deploy a highly tuned AI agent that manages WhatsApp sales while you sleep.
            </p>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <Card className="bg-black/50 border-white/10 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-2xl text-white">15-Day Free Trial</CardTitle>
                  <CardDescription>Test the waters zero risk.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-4xl font-light text-white">0 GHS</div>
                  <ul className="space-y-3 text-sm text-slate-300 text-left">
                     <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 text-indigo-400"/> 15 Days Duration</li>
                     <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 text-indigo-400"/> 50 Total Messages Cap</li>
                     <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 text-indigo-400"/> Standard AI Voice</li>
                     <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 text-indigo-400"/> Email Support</li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => setStep(2)}>
                    Start Free Trial
                  </Button>
                </CardFooter>
              </Card>

              <Card className="bg-indigo-950/20 border-indigo-500/30 backdrop-blur-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] uppercase font-bold py-1 px-3 rounded-bl-xl">
                  Pro Plan
                </div>
                <CardHeader>
                  <CardTitle className="text-2xl text-indigo-100">Executive</CardTitle>
                  <CardDescription className="text-indigo-200/70">For growing campus businesses.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-4xl font-light text-white">100 GHS <span className="text-sm text-slate-400">/ month</span></div>
                  <ul className="space-y-3 text-sm text-slate-300 text-left">
                     <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 text-indigo-400"/> Permanent Access</li>
                     <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 text-indigo-400"/> Unlimited Messages</li>
                     <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 text-indigo-400"/> Full Brand Voice Customization</li>
                     <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 text-indigo-400"/> Priority WhatsApp Concierge</li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" className="w-full bg-white/5 border-indigo-500/50 hover:bg-white/10 text-white" onClick={() => setStep(2)}>
                    Sign Up Now
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="max-w-md mx-auto">
            <Card className="bg-[#0a0a0b]/80 border-white/10 backdrop-blur-2xl">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Create Account</CardTitle>
                <CardDescription>Join Eastern AI to deploy your agent.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button variant="outline" className="w-full bg-white text-black hover:bg-slate-200 font-semibold" onClick={handleGoogleAuth}>
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                  Continue with Google
                </Button>
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/10" /></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#0a0a0b] px-2 text-slate-500">Or register with email</span></div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input className="bg-white/5 border-white/10 text-white" value={formData.firstName} onChange={e=>setFormData({...formData, firstName: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input className="bg-white/5 border-white/10 text-white" value={formData.lastName} onChange={e=>setFormData({...formData, lastName: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Business Name</Label>
                  <Input placeholder="Eastern Apparel" className="bg-white/5 border-white/10 text-white" value={formData.businessName} onChange={e=>setFormData({...formData, businessName: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp Number</Label>
                  <Input placeholder="+233 24 123 4567" className="bg-white/5 border-white/10 text-white" value={formData.whatsappNumber} onChange={e=>setFormData({...formData, whatsappNumber: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" placeholder="chief@eastern.ai" className="bg-white/5 border-white/10 text-white" value={formData.email} onChange={e=>setFormData({...formData, email: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Secure Password</Label>
                  <Input type="password" placeholder="••••••••" className="bg-white/5 border-white/10 text-white" value={formData.password} onChange={handlePasswordChange} />
                  <div className="h-1.5 w-full bg-slate-800 rounded-full mt-2 overflow-hidden">
                    <div className="h-full transition-all" style={{
                      width: `${passwordStrength}%`,
                      backgroundColor: passwordStrength < 50 ? '#ef4444' : passwordStrength < 100 ? '#f59e0b' : '#10b981'
                    }}></div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between items-center gap-4">
                <Button variant="ghost" onClick={() => setStep(1)} className="text-slate-400 hover:text-white" disabled={isSubmitting}>Cancel</Button>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white flex-1" onClick={RequestAuth} disabled={isSubmitting || !formData.businessName || !formData.whatsappNumber || !formData.email || !formData.password}>
                  {isSubmitting ? 'Registering...' : <><span className="mr-2">Register & Continute</span> <ArrowRight className="w-4 h-4" /></>}
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md mx-auto">
            <Card className="bg-[#0a0a0b]/90 border-white/10 backdrop-blur-3xl p-4">
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-6">
                <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center relative">
                  <ShieldCheck className="w-8 h-8 text-indigo-400" />
                  <span className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full animate-ping"></span>
                </div>
                
                <div>
                  <h3 className="text-2xl font-semibold text-white mb-2">Email Verification</h3>
                  <p className="text-slate-400 text-sm mb-2">
                    Enter the 6-digit code sent to <span className="text-slate-200">{formData.email}</span>
                  </p>
                  <p className="text-amber-500/80 text-xs bg-amber-500/10 p-2 rounded border border-amber-500/20 text-left">
                    💡 <strong>Note:</strong> The OTP code was sent to your <strong>email inbox</strong>, not your WhatsApp. Check your spam folder if you don't see it.
                  </p>
                </div>

                <div className="w-full space-y-4">
                  <Input 
                    type="text" 
                    placeholder="000000" 
                    maxLength={6}
                    className="text-center text-3xl font-mono tracking-[0.5em] h-16 bg-white/5 border-white/10 text-white" 
                    value={otpCode}
                    onChange={e=>setOtpCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <div className="flex justify-center text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3"/> Email Sent ✓</span>
                  </div>
                </div>

                <Button className="w-full h-12 text-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)]" onClick={VerifyOTP} disabled={otpCode.length !== 6 || isSubmitting}>
                  {isSubmitting ? 'Verifying...' : 'Verify & Enter Dashboard'}
                </Button>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded p-4 text-xs text-blue-200 mt-4 text-left space-y-2 w-full">
                  <p><strong>⚠️ Did you receive a link instead of a 6-digit code?</strong></p>
                  <p>Clicking the link may result in a <strong>403 error</strong> in this preview environment.</p>
                  <p><strong>To fix this for your production app:</strong></p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Go to your Supabase Dashboard &gt; Authentication &gt; Email Templates</li>
                    <li>Edit the <strong>Confirm signup</strong> template</li>
                    <li>Replace <code className="bg-black/30 px-1 rounded">{"{{"} .ConfirmationURL {"}}"}</code> with <code className="bg-amber-500/20 text-amber-300 px-1 rounded font-bold">{"{{"} .Token {"}}"}</code></li>
                  </ol>
                  <p className="border-t border-blue-500/20 pt-2 mt-2 flex flex-col gap-2">
                    <span>Or for testing right now:</span>
                    <Button 
                      variant="outline" 
                      className="w-full border-amber-500/30 text-amber-500 hover:bg-amber-500/10 h-8 text-xs" 
                      onClick={() => {
                        AuthContext.login({
                          firstName: formData.firstName,
                          lastName: formData.lastName,
                          businessName: formData.businessName,
                          email: formData.email,
                          whatsappNumber: formData.whatsappNumber
                        });
                        navigate('/');
                      }}
                    >
                      Bypass Verification (Demo Mode)
                    </Button>
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
