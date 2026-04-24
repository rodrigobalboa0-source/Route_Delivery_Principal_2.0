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

  static async handleCancellation(pedidoId: string, ifoodOrderId?: string, cancellationReason?: string, cancellationCode?: string) {
    try {
      const body: any = { action: 'requestCancellation', pedidoId, ifoodOrderId };
      
      // Se motivo e código foram fornecidos, enviar para a API
      if (cancellationReason && cancellationCode) {
        body.cancellationReason = cancellationReason;
        body.cancellationCode = cancellationCode;
      }
      
      const { data, error } = await supabase.functions.invoke('ifood-update-status', {
        body
      });
      
      if (error) throw error;
      
      // Capturar informações detalhadas do cancelamento do iFood
      const cancelamentoData: any = {
        cancelamento_codigo: cancellationCode || data?.cancellationCode || null,
        cancelamento_origem: 'ifood',
        cancelado_em: new Date().toISOString()
      };
      
      // Verificar se o iFood enviou título e descrição separados
      let motivoCompleto = '';
      
      if (data?.cancellationTitle && data?.cancellationDescription) {
        // Se tiver título e descrição separados, formatar bonito
        motivoCompleto = `${data.cancellationTitle}\n\n${data.cancellationDescription}`;
      } else if (cancellationReason) {
        // Usar o motivo fornecido
        motivoCompleto = cancellationReason;
      } else if (data?.cancellationReason) {
        // Se só tiver motivo completo, usar como está
        motivoCompleto = data.cancellationReason;
      } else if (data?.reason) {
        // Campo alternativo para motivo
        motivoCompleto = data.reason;
      }
      
      if (motivoCompleto) {
        cancelamentoData.cancelamento_motivo = motivoCompleto;
      }
      
      // Atualizar o pedido com as informações de cancelamento
      if (motivoCompleto || cancelamentoData.cancelamento_codigo) {
        await supabase.from('pedidos').update(cancelamentoData).eq('id', pedidoId);
      }
      
      return {
        ...data,
        showModal: true, // Indicar que deve mostrar o modal
        cancellationData: cancelamentoData
      };
    } catch (error: any) {
      console.error('iFood cancellation error:', error);
      return { success: false, message: error.message };
    }
  }

  static async getCancellationReasons() {
    try {
      const { data, error } = await supabase.functions.invoke('ifood-update-status', {
        body: { action: 'getCancellationReasons' }
      });
      
      if (error) throw error;
      
      return data?.reasons || [];
    } catch (error: any) {
      console.error('iFood get cancellation reasons error:', error);
      return [];
    }
  }
}
