import { createClient } from '@supabase/supabase-js';
import { config } from '../config/config.js';
import ws from 'ws';

export const supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});