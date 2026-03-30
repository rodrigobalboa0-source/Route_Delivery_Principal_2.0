import { supabase } from '../lib/supabase';

export class IfoodService {
  static async syncOrders() {
    console.log('Starting iFood sync (Edge Function)...');
    
    try {
      const { data, error } = await supabase.functions.invoke('ifood-sync', {
        body: { mode: 'manual' }
      });

      if (error) throw error;
      
      console.log('Sync result:', data);
      return data;
    } catch (error: any) {
      console.error('Sync error:', error);
      return { success: false, message: error.message };
    }
  }

  static async acceptOrder(pedidoId: string) {
    try {
      const { data, error } = await supabase.functions.invoke('ifood-update-status', {
        body: { action: 'confirm', pedidoId }
      });
      if (error) throw error;
      return data;
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
}
