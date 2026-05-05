import { createClient } from '@supabase/supabase-js';

// Using the keys provided by the user from the image
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kabjhlkuaaavaiyzmozm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthYmpobGt1YWFhdmFpYXptb3ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTU3ODQsImV4cCI6MjA5MzEzMTc4Mn0.3x8XwoQ33QOL_slrW49Lz3nD7PRIZsey1UP7ErmejaY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
