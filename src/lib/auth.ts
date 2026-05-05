import { supabase } from './supabase';

export interface UserData {
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  whatsappNumber: string;
  trialStartDate?: string;
  isVerified?: boolean;
}

export const AuthContext = {
  user: null as UserData | null,
  login: (data: UserData) => {
    AuthContext.user = {
      ...data,
      trialStartDate: new Date().toISOString(),
      isVerified: true
    };
    localStorage.setItem('ea_user_v3', JSON.stringify(AuthContext.user));
    window.dispatchEvent(new Event('auth_changed'));
  },
  logout: async () => {
    AuthContext.user = null;
    localStorage.removeItem('ea_user_v3');
    window.dispatchEvent(new Event('auth_changed'));
    if (supabase) {
      await supabase.auth.signOut();
    }
  },
  load: async () => {
    const saved = localStorage.getItem('ea_user_v3');
    if (saved) {
      AuthContext.user = JSON.parse(saved);
    }
    
    // Sync with Supabase session if available
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        const sbUser = data.session.user;
        if (!AuthContext.user || AuthContext.user.email !== sbUser.email) {
          AuthContext.user = {
            firstName: sbUser.user_metadata?.full_name?.split(' ')[0] || 'User',
            lastName: sbUser.user_metadata?.full_name?.split(' ')[1] || '',
            businessName: 'My Business',
            email: sbUser.email || '',
            whatsappNumber: '+1234567890',
            isVerified: true,
            trialStartDate: sbUser.created_at
          };
          localStorage.setItem('ea_user_v3', JSON.stringify(AuthContext.user));
        }
      }
    }
  }
};

// Listen to Supabase changes
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      const sbUser = session.user;
      AuthContext.user = {
        firstName: sbUser.user_metadata?.full_name?.split(' ')[0] || 'User',
        lastName: sbUser.user_metadata?.full_name?.split(' ')[1] || '',
        businessName: 'My Business',
        email: sbUser.email || '',
        whatsappNumber: '+1234567890',
        isVerified: true,
        trialStartDate: sbUser.created_at
      };
      localStorage.setItem('ea_user_v3', JSON.stringify(AuthContext.user));
      window.dispatchEvent(new Event('auth_changed'));
    } else if (event === 'SIGNED_OUT') {
      AuthContext.user = null;
      localStorage.removeItem('ea_user_v3');
      window.dispatchEvent(new Event('auth_changed'));
    }
  });
}
