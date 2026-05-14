import { supabase } from '../lib/supabase';

export class IfoodService {
  static async syncOrders() {
    try {
      const { data, error } = await supabase.functions.invoke('ifood-sync', {
        body: { mode: 'manual' }
      });

      if (error) throw error;
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

  static async handleCancellation(pedidoId: string, ifoodOrderId?: string, cancellationReason?: string, cancellationCode?: string) {
    try {
      const body: any = { action: 'requestCancellation', pedidoId, ifoodOrderId };
      
      
      if (cancellationReason && cancellationCode) {
        body.cancellationReason = cancellationReason;
        body.cancellationCode = cancellationCode;
      }
      
      const { data, error } = await supabase.functions.invoke('ifood-update-status', {
        body
      });
      
      if (error) throw error;
      if (data?.success === false) {
        throw new Error(data?.error || data?.message || 'Falha ao cancelar pedido no iFood');
      }
      
      
      const cancelamentoData: any = {
        cancelamento_codigo: cancellationCode || data?.cancellationCode || null,
        cancelamento_origem: 'ifood',
        cancelado_em: new Date().toISOString()
      };
      
      
      let motivoCompleto = '';
      
      if (data?.cancellationTitle && data?.cancellationDescription) {
        
        motivoCompleto = `${data.cancellationTitle}\n\n${data.cancellationDescription}`;
      } else if (cancellationReason) {
        
        motivoCompleto = cancellationReason;
      } else if (data?.cancellationReason) {
        
        motivoCompleto = data.cancellationReason;
      } else if (data?.reason) {
        
        motivoCompleto = data.reason;
      }
      
      if (motivoCompleto) {
        cancelamentoData.cancelamento_motivo = motivoCompleto;
      }
      
      
      await supabase.from('pedidos').update({
        ...cancelamentoData,
        status: 'cancelado',
        updated_at: new Date().toISOString(),
      }).eq('id', pedidoId);
      
      return {
        ...data,
        showModal: true, 
        cancellationData: cancelamentoData
      };
    } catch (error: any) {
      console.error('iFood cancellation error:', error);
      return { success: false, message: error.message };
    }
  }

  static async getCancellationReasons(pedidoId: string, clienteId?: string, ifoodOrderId?: string) {
    try {
      console.log('[iFood Service] Fetching cancellation reasons:', { pedidoId, clienteId, ifoodOrderId });
      const { data, error } = await supabase.functions.invoke('ifood-update-status', {
        body: { action: 'getCancellationReasons', pedidoId, clienteId, ifoodOrderId }
      });
      
      console.log('[iFood Service] Response from edge function:', { data, error });
      
      if (error) {
        console.error('Erro na edge function:', error);
        throw error;
      }
      
      const rawReasons = Array.isArray(data?.reasons) ? data.reasons : [];
      console.log('[iFood Service] Raw reasons:', rawReasons);
      
      const reasons = rawReasons
        .map((r: any) => {
          const code = String(r?.code ?? r?.cancellationCode ?? r?.id ?? '').trim();
          const title = String(r?.description ?? r?.title ?? r?.reason ?? '').trim();
          const description = String(r?.details ?? '').trim();
          if (!code || !title) return null;
          return { code, title, description: description || undefined };
        })
        .filter(Boolean) as Array<{ code: string; title: string; description?: string }>;
      
      console.log('[iFood Service] Formatted reasons:', reasons);
      return reasons;
    } catch (error: any) {
      console.error('iFood get cancellation reasons error:', error);
      return [];
    }
  }
}
