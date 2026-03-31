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

  static async acceptOrder(pedidoId: string, clienteId?: string, ifoodOrderId?: string) {
    const { data, error } = await supabase.functions.invoke('ifood-update-status', {
      body: { action: 'confirm', pedidoId, clienteId, ifoodOrderId }
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || data?.message || 'Falha ao aceitar pedido no iFood');
    return data;
  }
}
