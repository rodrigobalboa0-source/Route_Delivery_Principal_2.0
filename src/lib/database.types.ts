export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      pedidos: {
        Row: {
          id: string
          cliente_id: string
          endereco_id: string | null
          numero: string | null
          ifood_order_id?: string | null
          ifood_info?: Json | null
          item_descricao: string | null
          endereco_texto: string | null
          origem: 'manual' | 'online'
          valor_total: number | null
          status: 'criado' | 'confirmado' | 'em_preparo' | 'pronto' | 'cancelado' | 'entregue'
          observacoes: string | null
          entrega_codigo_pedido?: string | null
          entrega_contato?: string | null
          entrega_telefone?: string | null
          valor_entrega?: number | null
          modal_tipo?: string | null
          agendar_em: string | null
          retirada_no_local: boolean
          pagamento_metodo: string | null
          pagamento_na_entrega: boolean
          troco_para: number | null
          documento_tipo: string | null
          documento_numero: string | null
          voucher_codigo: string | null
          voucher_tipo: string | null
          desconto_total: number | null
          desconto_entrega: number | null
          cancelamento_origem: string | null
          cancelamento_codigo: string | null
          cancelamento_motivo: string | null
          cancelado_em: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          endereco_id?: string | null
          numero?: string | null
          ifood_order_id?: string | null
          ifood_info?: Json | null
          item_descricao?: string | null
          endereco_texto?: string | null
          origem?: 'manual' | 'online'
          valor_total?: number | null
          status?: 'criado' | 'confirmado' | 'em_preparo' | 'pronto' | 'cancelado' | 'entregue'
          observacoes?: string | null
          entrega_codigo_pedido?: string | null
          entrega_contato?: string | null
          entrega_telefone?: string | null
          valor_entrega?: number | null
          modal_tipo?: string | null
          agendar_em?: string | null
          retirada_no_local?: boolean
          pagamento_metodo?: string | null
          pagamento_na_entrega?: boolean
          troco_para?: number | null
          documento_tipo?: string | null
          documento_numero?: string | null
          voucher_codigo?: string | null
          voucher_tipo?: string | null
          desconto_total?: number | null
          desconto_entrega?: number | null
          cancelamento_origem?: string | null
          cancelamento_codigo?: string | null
          cancelamento_motivo?: string | null
          cancelado_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          endereco_id?: string | null
          numero?: string | null
          ifood_order_id?: string | null
          ifood_info?: Json | null
          item_descricao?: string | null
          endereco_texto?: string | null
          origem?: 'manual' | 'online'
          valor_total?: number | null
          status?: 'criado' | 'confirmado' | 'em_preparo' | 'pronto' | 'cancelado' | 'entregue'
          observacoes?: string | null
          entrega_codigo_pedido?: string | null
          entrega_contato?: string | null
          entrega_telefone?: string | null
          valor_entrega?: number | null
          modal_tipo?: string | null
          agendar_em?: string | null
          retirada_no_local?: boolean
          pagamento_metodo?: string | null
          pagamento_na_entrega?: boolean
          troco_para?: number | null
          documento_tipo?: string | null
          documento_numero?: string | null
          voucher_codigo?: string | null
          voucher_tipo?: string | null
          desconto_total?: number | null
          desconto_entrega?: number | null
          cancelamento_origem?: string | null
          cancelamento_codigo?: string | null
          cancelamento_motivo?: string | null
          cancelado_em?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      integracoes_cardapioweb: {
        Row: {
          id: string
          cliente_id: string
          merchant_id: string
          merchant_secret: string | null
          status: 'ativo' | 'inativo' | 'erro'
          last_synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          merchant_id: string
          merchant_secret?: string | null
          status?: 'ativo' | 'inativo' | 'erro'
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          merchant_id?: string
          merchant_secret?: string | null
          status?: 'ativo' | 'inativo' | 'erro'
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      integracoes_ifood: {
        Row: {
          id: string
          cliente_id: string
          merchant_id: string | null
          access_token: string | null
          refresh_token: string | null
          token_expires_at: string | null
          authorization_code_used: string | null
          status: 'ativo' | 'inativo' | 'erro'
          last_synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          merchant_id?: string | null
          access_token?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          authorization_code_used?: string | null
          status?: 'ativo' | 'inativo' | 'erro'
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          merchant_id?: string | null
          access_token?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          authorization_code_used?: string | null
          status?: 'ativo' | 'inativo' | 'erro'
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      integracoes_ze: {
        Row: {
          id: string
          cliente_id: string
          merchant_id: string
          api_key: string | null
          status: 'ativo' | 'inativo' | 'erro'
          last_synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          merchant_id: string
          api_key?: string | null
          status?: 'ativo' | 'inativo' | 'erro'
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          merchant_id?: string
          api_key?: string | null
          status?: 'ativo' | 'inativo' | 'erro'
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      delivery_persons: {
        Row: {
          id: string
          name: string
          email: string
          phone: string
          status: 'disponivel' | 'em_entrega' | 'inativo'
          is_online: boolean
          current_latitude: number | null
          current_longitude: number | null
          last_location_update: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          phone: string
          status?: 'disponivel' | 'em_entrega' | 'inativo'
          is_online?: boolean
          current_latitude?: number | null
          current_longitude?: number | null
          last_location_update?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          phone?: string
          status?: 'disponivel' | 'em_entrega' | 'inativo'
          is_online?: boolean
          current_latitude?: number | null
          current_longitude?: number | null
          last_location_update?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      deliveries: {
        Row: {
          id: string
          delivery_person_id: string | null
          customer_name: string
          customer_phone: string
          delivery_address: string
          delivery_latitude: number
          delivery_longitude: number
          status: 'pendente' | 'em_rota' | 'entregue' | 'cancelada'
          created_at: string
          started_at: string | null
          completed_at: string | null
          cliente_id: string | null
        }
        Insert: {
          id?: string
          delivery_person_id?: string | null
          customer_name: string
          customer_phone: string
          delivery_address: string
          delivery_latitude: number
          delivery_longitude: number
          status?: 'pendente' | 'em_rota' | 'entregue' | 'cancelada'
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
          cliente_id?: string | null
        }
        Update: {
          id?: string
          delivery_person_id?: string | null
          customer_name?: string
          customer_phone?: string
          delivery_address?: string
          delivery_latitude?: number
          delivery_longitude?: number
          status?: 'pendente' | 'em_rota' | 'entregue' | 'cancelada'
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
          cliente_id?: string | null
        }
      }
      delivery_logs: {
        Row: {
          id: string
          delivery_id: string | null
          action: string
          description: string | null
          old_data: Json | null
          new_data: Json | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          delivery_id?: string | null
          action: string
          description?: string | null
          old_data?: Json | null
          new_data?: Json | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          delivery_id?: string | null
          action?: string
          description?: string | null
          old_data?: Json | null
          new_data?: Json | null
          created_at?: string
          created_by?: string | null
        }
      }
      users: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          role: 'user' | 'admin'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email?: string | null
          full_name?: string | null
          role?: 'user' | 'admin'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          role?: 'user' | 'admin'
          created_at?: string
          updated_at?: string
        }
      }
      clientes: {
        Row: {
          id: string
          nome_completo: string
          email: string | null
          telefone: string | null
          cpf: string | null
          data_nascimento: string | null
          metodo_pagamento_preferido: string | null
          observacoes: string | null
          foto_url: string | null
          foto_base64: string | null
          cep: string | null
          rua: string | null
          numero: string | null
          complemento: string | null
          bairro: string | null
          cidade: string | null
          referencia_entrega: string | null
          latitude: number | null
          longitude: number | null
          precificacao_config: Json | null
          saldo_creditos?: number
          created_at: string
          updated_at: string
          modo_faturamento?: string
          faturamento_periodo?: string
          faturamento_vencimento_dias?: number
          faturamento_tipo_cobranca?: string
          faturamento_adicional_1?: number
          faturamento_adicional_2?: number
          faturamento_cobrar_taxas_sem_entregas?: boolean
          faturamento_instrucoes?: string
          faturamento_observacoes?: string
          faturamento_emails?: string[]
        }
        Insert: {
          id?: string
          nome_completo: string
          email?: string | null
          telefone?: string | null
          cpf?: string | null
          data_nascimento?: string | null
          metodo_pagamento_preferido?: string | null
          observacoes?: string | null
          foto_url?: string | null
          foto_base64?: string | null
          cep?: string | null
          rua?: string | null
          numero?: string | null
          complemento?: string | null
          bairro?: string | null
          cidade?: string | null
          referencia_entrega?: string | null
          latitude?: number | null
          longitude?: number | null
          precificacao_config?: Json | null
          saldo_creditos?: number
          created_at: string
          updated_at?: string
          modo_faturamento?: string
          faturamento_periodo?: string
          faturamento_vencimento_dias?: number
          faturamento_tipo_cobranca?: string
          faturamento_adicional_1?: number
          faturamento_adicional_2?: number
          faturamento_cobrar_taxas_sem_entregas?: boolean
          faturamento_instrucoes?: string
          faturamento_observacoes?: string
          faturamento_emails?: string[]
        }
        Update: {
          id?: string
          nome_completo?: string
          email?: string | null
          telefone?: string | null
          cpf?: string | null
          data_nascimento?: string | null
          metodo_pagamento_preferido?: string | null
          observacoes?: string | null
          foto_url?: string | null
          foto_base64?: string | null
          cep?: string | null
          rua?: string | null
          numero?: string | null
          complemento?: string | null
          bairro?: string | null
          cidade?: string | null
          referencia_entrega?: string | null
          latitude?: number | null
          longitude?: number | null
          precificacao_config?: Json | null
          saldo_creditos?: number
          created_at?: string
          updated_at?: string
          modo_faturamento?: string
          faturamento_periodo?: string
          faturamento_vencimento_dias?: number
          faturamento_tipo_cobranca?: string
          faturamento_adicional_1?: number
          faturamento_adicional_2?: number
          faturamento_cobrar_taxas_sem_entregas?: boolean
          faturamento_instrucoes?: string
          faturamento_observacoes?: string
          faturamento_emails?: string[]
        }
      }
      creditos_clientes: {
        Row: {
          id: string
          cliente_id: string
          valor: number
          tipo: 'compra' | 'uso' | 'ajuste' | 'estorno'
          descricao: string | null
          saldo_anterior: number
          saldo_novo: number
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          cliente_id: string
          valor: number
          tipo: 'compra' | 'uso' | 'ajuste' | 'estorno'
          descricao?: string | null
          saldo_anterior: number
          saldo_novo: number
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          cliente_id?: string
          valor?: number
          tipo?: 'compra' | 'uso' | 'ajuste' | 'estorno'
          descricao?: string | null
          saldo_anterior?: number
          saldo_novo?: number
          created_at?: string
          created_by?: string | null
        }
      }
      faturamento_clientes: {
        Row: {
          id: string
          cliente_id: string
          periodo_inicio: string | null
          periodo_fim: string | null
          valor_total: number
          status: 'pendente' | 'pago' | 'vencido' | 'cancelado'
          vencimento: string | null
          link_boleto: string | null
          descricao: string | null
          observacoes: string | null
          instrucoes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          periodo_inicio?: string | null
          periodo_fim?: string | null
          valor_total: number
          status?: 'pendente' | 'pago' | 'vencido' | 'cancelado'
          vencimento?: string | null
          link_boleto?: string | null
          descricao?: string | null
          observacoes?: string | null
          instrucoes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          periodo_inicio?: string | null
          periodo_fim?: string | null
          valor_total?: number
          status?: 'pendente' | 'pago' | 'vencido' | 'cancelado'
          vencimento?: string | null
          link_boleto?: string | null
          descricao?: string | null
          observacoes?: string | null
          instrucoes?: string | null
          created_at?: string
        }
      }
      cliente_enderecos: {
        Row: {
          id: string
          cliente_id: string
          cep: string | null
          rua: string | null
          numero: string | null
          complemento: string | null
          bairro: string | null
          cidade: string | null
          referencia_entrega: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          cep?: string | null
          rua?: string | null
          numero?: string | null
          complemento?: string | null
          bairro?: string | null
          cidade?: string | null
          referencia_entrega?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          cep?: string | null
          rua?: string | null
          numero?: string | null
          complemento?: string | null
          bairro?: string | null
          cidade?: string | null
          referencia_entrega?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      contas_gerenciais: {
        Row: {
          id: string
          nome_completo: string
          cargo: string | null
          email_acesso: string | null
          telefone: string | null
          usuario_login: string | null
          senha_hash: string | null
          nivel_permissao: 'admin_geral' | 'supervisor' | 'financeiro' | 'atendimento' | 'operacional' | null
          status: 'ativa' | 'inativa' | null
          unidade_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome_completo: string
          cargo?: string | null
          email_acesso?: string | null
          telefone?: string | null
          usuario_login?: string | null
          senha_hash?: string | null
          nivel_permissao?: 'admin_geral' | 'supervisor' | 'financeiro' | 'atendimento' | 'operacional' | null
          status?: 'ativa' | 'inativa' | null
          unidade_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome_completo?: string
          cargo?: string | null
          email_acesso?: string | null
          telefone?: string | null
          usuario_login?: string | null
          senha_hash?: string | null
          nivel_permissao?: 'admin_geral' | 'supervisor' | 'financeiro' | 'atendimento' | 'operacional' | null
          status?: 'ativa' | 'inativa' | null
          unidade_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      contas_logs: {
        Row: {
          id: string
          conta_id: string
          acao: string | null
          detalhes: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          conta_id: string
          acao?: string | null
          detalhes?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          conta_id?: string
          acao?: string | null
          detalhes?: Json | null
          created_at?: string
        }
      }
      entregadores: {
        Row: {
          id: string
          nome_completo: string
          cpf: string | null
          rg: string | null
          data_nascimento: string | null
          telefone: string | null
          email: string | null
          is_online: boolean
          current_latitude: number | null
          current_longitude: number | null
          last_location_update: string | null
          cep: string | null
          rua: string | null
          numero: string | null
          complemento: string | null
          bairro: string | null
          cidade: string | null
          veiculo_tipo: 'moto' | 'bike' | 'carro' | null
          veiculo_modelo: string | null
          veiculo_placa: string | null
          veiculo_ano: number | null
          cnh_valida: boolean | null
          tipo_entrega: 'proprio' | 'terceirizado' | 'parceiro' | null
          taxa_entrega: number | null
          status: 'ativo' | 'inativo' | 'em_analise'
          foto_url: string | null
          foto_base64: string | null
          cnh_foto_url: string | null
          cnh_foto_base64: string | null
          comprovante_residencia_url: string | null
          comprovante_residencia_base64: string | null
          documento_veiculo_url: string | null
          documento_veiculo_base64: string | null
          restricao_clientes_modo: 'todos' | 'selecionados' | null
          clientes_permitidos: Json | null
          dados_bancarios: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome_completo: string
          cpf?: string | null
          rg?: string | null
          data_nascimento?: string | null
          telefone?: string | null
          email?: string | null
          is_online?: boolean
          current_latitude?: number | null
          current_longitude?: number | null
          last_location_update?: string | null
          cep?: string | null
          rua?: string | null
          numero?: string | null
          complemento?: string | null
          bairro?: string | null
          cidade?: string | null
          veiculo_tipo?: 'moto' | 'bike' | 'carro' | null
          veiculo_modelo?: string | null
          veiculo_placa?: string | null
          veiculo_ano?: number | null
          cnh_valida?: boolean | null
          tipo_entrega?: 'proprio' | 'terceirizado' | 'parceiro' | null
          taxa_entrega?: number | null
          status?: 'ativo' | 'inativo' | 'em_analise'
          foto_url?: string | null
          foto_base64?: string | null
          cnh_foto_url?: string | null
          cnh_foto_base64?: string | null
          comprovante_residencia_url?: string | null
          comprovante_residencia_base64?: string | null
          documento_veiculo_url?: string | null
          documento_veiculo_base64?: string | null
          restricao_clientes_modo?: 'todos' | 'selecionados' | null
          clientes_permitidos?: Json | null
          dados_bancarios?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome_completo?: string
          cpf?: string | null
          rg?: string | null
          data_nascimento?: string | null
          telefone?: string | null
          email?: string | null
          is_online?: boolean
          current_latitude?: number | null
          current_longitude?: number | null
          last_location_update?: string | null
          cep?: string | null
          rua?: string | null
          numero?: string | null
          complemento?: string | null
          bairro?: string | null
          cidade?: string | null
          veiculo_tipo?: 'moto' | 'bike' | 'carro' | null
          veiculo_modelo?: string | null
          veiculo_placa?: string | null
          veiculo_ano?: number | null
          cnh_valida?: boolean | null
          tipo_entrega?: 'proprio' | 'terceirizado' | 'parceiro' | null
          taxa_entrega?: number | null
          status?: 'ativo' | 'inativo' | 'em_analise'
          foto_url?: string | null
          foto_base64?: string | null
          cnh_foto_url?: string | null
          cnh_foto_base64?: string | null
          comprovante_residencia_url?: string | null
          comprovante_residencia_base64?: string | null
          restricao_clientes_modo?: 'todos' | 'selecionados' | null
          clientes_permitidos?: Json | null
          dados_bancarios?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      entregador_regioes: {
        Row: {
          id: string
          entregador_id: string
          regiao: string | null
          created_at: string
        }
        Insert: {
          id?: string
          entregador_id: string
          regiao?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          entregador_id?: string
          regiao?: string | null
          created_at?: string
        }
      }
      entregador_turnos: {
        Row: {
          id: string
          entregador_id: string
          dias: string | null
          inicio: string | null
          fim: string | null
        }
        Insert: {
          id?: string
          entregador_id: string
          dias?: string | null
          inicio?: string | null
          fim?: string | null
        }
        Update: {
          id?: string
          entregador_id?: string
          dias?: string | null
          inicio?: string | null
          fim?: string | null
        }
      }
      entregador_avaliacoes: {
        Row: {
          id: string
          entregador_id: string
          nota: number | null
          comentario: string | null
          created_at: string
        }
        Insert: {
          id?: string
          entregador_id: string
          nota?: number | null
          comentario?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          entregador_id?: string
          nota?: number | null
          comentario?: string | null
          created_at?: string
        }
      }
      grupos_operacionais: {
        Row: {
          id: string
          nome: string
          descricao: string | null
          tipo_funcao: 'operacional' | 'administrativo' | 'logistica' | null
          permissoes: Json | null
          responsavel_user_id: string | null
          regras_internas: string | null
          limite_permissoes: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome: string
          descricao?: string | null
          tipo_funcao?: 'operacional' | 'administrativo' | 'logistica' | null
          permissoes?: Json | null
          responsavel_user_id?: string | null
          regras_internas?: string | null
          limite_permissoes?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome?: string
          descricao?: string | null
          tipo_funcao?: 'operacional' | 'administrativo' | 'logistica' | null
          permissoes?: Json | null
          responsavel_user_id?: string | null
          regras_internas?: string | null
          limite_permissoes?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      grupo_usuarios: {
        Row: {
          id: string
          grupo_id: string
          user_id: string
        }
        Insert: {
          id?: string
          grupo_id: string
          user_id: string
        }
        Update: {
          id?: string
          grupo_id?: string
          user_id?: string
        }
      }
      grupo_horarios: {
        Row: {
          id: string
          grupo_id: string
          dia: string | null
          inicio: string | null
          fim: string | null
        }
        Insert: {
          id?: string
          grupo_id: string
          dia?: string | null
          inicio?: string | null
          fim?: string | null
        }
        Update: {
          id?: string
          grupo_id?: string
          dia?: string | null
          inicio?: string | null
          fim?: string | null
        }
      }
      modais: {
        Row: {
          id: string
          tipo: 'moto' | 'carro' | 'bike' | 'outro'
          descricao: string | null
          ativo: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tipo: 'moto' | 'carro' | 'bike' | 'outro'
          descricao?: string | null
          ativo?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tipo?: 'moto' | 'carro' | 'bike' | 'outro'
          descricao?: string | null
          ativo?: boolean | null
          created_at?: string
          updated_at?: string
        }
      }
      precificacoes: {
        Row: {
          id: string
          modal_tipo: 'moto' | 'carro' | 'bike' | 'outro'
          taxa_base: number | null
          valor_por_km: number | null
          valor_por_minuto: number | null
          taxa_minima: number | null
          ativa: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          modal_tipo: 'moto' | 'carro' | 'bike' | 'outro'
          taxa_base?: number | null
          valor_por_km?: number | null
          valor_por_minuto?: number | null
          taxa_minima?: number | null
          ativa?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          modal_tipo?: 'moto' | 'carro' | 'bike' | 'outro'
          taxa_base?: number | null
          valor_por_km?: number | null
          valor_por_minuto?: number | null
          taxa_minima?: number | null
          ativa?: boolean | null
          created_at?: string
          updated_at?: string
        }
      }
      preco_espera: {
        Row: {
          id: string
          modal_tipo: 'moto' | 'carro' | 'bike' | 'outro'
          tempo_gratis_minutos: number | null
          valor_por_minuto: number | null
          ativo: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          modal_tipo: 'moto' | 'carro' | 'bike' | 'outro'
          tempo_gratis_minutos?: number | null
          valor_por_minuto?: number | null
          ativo?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          modal_tipo?: 'moto' | 'carro' | 'bike' | 'outro'
          tempo_gratis_minutos?: number | null
          valor_por_minuto?: number | null
          ativo?: boolean | null
          created_at?: string
          updated_at?: string
        }
      }
      tabelas_comissoes: {
          Row: {
            id: string
            nome: string
            tipo_calculo: string | null
            valor_por_ponto: number | null
            tipo_retorno: string | null
            valor_retorno: number | null
            cliente_ids: string[] | null
            ativo?: boolean
            created_at: string
            updated_at: string
          }
          Insert: {
            id?: string
            nome: string
            tipo_calculo?: string | null
            valor_por_ponto?: number | null
            tipo_retorno?: string | null
            valor_retorno?: number | null
            cliente_ids?: string[] | null
            ativo?: boolean
            created_at?: string
            updated_at?: string
          }
          Update: {
            id?: string
            nome?: string
            tipo_calculo?: string | null
            valor_por_ponto?: number | null
            tipo_retorno?: string | null
            valor_retorno?: number | null
            cliente_ids?: string[] | null
            ativo?: boolean
            created_at?: string
            updated_at?: string
          }
        }
        tabelas_comissoes_faixas: {
          Row: {
            id: string
            tabela_id: string
            km_ate: number
            valor: number
            created_at: string
          }
          Insert: {
            id?: string
            tabela_id: string
            km_ate: number
            valor: number
            created_at?: string
          }
          Update: {
            id?: string
            tabela_id?: string
            km_ate?: number
            valor?: number
            created_at?: string
          }
        }
        tabelas_precos: {
        Row: {
          id: string
          nome: string
          tipo_calculo: string | null
          km_adicional: number | null
          tipo_retorno: string | null
          valor_retorno: number | null
          valor_por_ponto: number | null
          valor_minimo: number | null
          percentual_sobre_valor: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome: string
          tipo_calculo?: string | null
          km_adicional?: number | null
          tipo_retorno?: string | null
          valor_retorno?: number | null
          valor_por_ponto?: number | null
          valor_minimo?: number | null
          percentual_sobre_valor?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome?: string
          tipo_calculo?: string | null
          km_adicional?: number | null
          tipo_retorno?: string | null
          valor_retorno?: number | null
          valor_por_ponto?: number | null
          valor_minimo?: number | null
          percentual_sobre_valor?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      tabelas_precos_faixas: {
        Row: {
          id: string
          tabela_id: string
          km_ate: number
          valor: number
          created_at: string
        }
        Insert: {
          id?: string
          tabela_id: string
          km_ate: number
          valor: number
          created_at?: string
        }
        Update: {
          id?: string
          tabela_id?: string
          km_ate?: number
          valor?: number
          created_at?: string
        }
      }
      preco_dinamico_demanda: {
        Row: {
          id: string
          nome: string | null
          multiplicador: number | null
          criterio: string | null
          ativa: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome?: string | null
          multiplicador?: number | null
          criterio?: string | null
          ativa?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome?: string | null
          multiplicador?: number | null
          criterio?: string | null
          ativa?: boolean | null
          created_at?: string
          updated_at?: string
        }
      }
      preco_dinamico_entregador: {
        Row: {
          id: string
          entregador_id: string
          multiplicador: number | null
          ativa: boolean | null
          observacao: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          entregador_id: string
          multiplicador?: number | null
          ativa?: boolean | null
          observacao?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          entregador_id?: string
          multiplicador?: number | null
          ativa?: boolean | null
          observacao?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      servicos_opcionais: {
        Row: {
          id: string
          nome: string | null
          descricao: string | null
          valor_adicional: number | null
          ativo: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome?: string | null
          descricao?: string | null
          valor_adicional?: number | null
          ativo?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome?: string | null
          descricao?: string | null
          valor_adicional?: number | null
          ativo?: boolean | null
          created_at?: string
          updated_at?: string
        }
      }
      mensagens_entregadores: {
        Row: {
          id: string
          entregador_id: string
          canal: 'push'
          titulo: string | null
          corpo: string | null
          status: 'pendente' | 'enviado' | 'erro' | null
          erro: string | null
          scheduled_at: string | null
          sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          entregador_id: string
          canal: 'push'
          titulo?: string | null
          corpo?: string | null
          status?: 'pendente' | 'enviado' | 'erro' | null
          erro?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          entregador_id?: string
          canal?: 'push'
          titulo?: string | null
          corpo?: string | null
          status?: 'pendente' | 'enviado' | 'erro' | null
          erro?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      mensagens_clientes: {
        Row: {
          id: string
          cliente_id: string
          canal: 'email' | 'sms' | 'push'
          titulo: string | null
          corpo: string | null
          status: 'pendente' | 'enviado' | 'erro' | null
          erro: string | null
          scheduled_at: string | null
          sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          canal: 'email' | 'sms' | 'push'
          titulo?: string | null
          corpo?: string | null
          status?: 'pendente' | 'enviado' | 'erro' | null
          erro?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          canal?: 'email' | 'sms' | 'push'
          titulo?: string | null
          corpo?: string | null
          status?: 'pendente' | 'enviado' | 'erro' | null
          erro?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      conversas: {
        Row: {
          id: string
          tipo_alvo: 'entregador' | 'cliente'
          alvo_id: string
          assunto: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tipo_alvo: 'entregador' | 'cliente'
          alvo_id: string
          assunto?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tipo_alvo?: 'entregador' | 'cliente'
          alvo_id?: string
          assunto?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      conversa_mensagens: {
        Row: {
          id: string
          conversa_id: string
          autor_tipo: 'operador' | 'entregador' | 'cliente' | 'sistema' | null
          canal: 'email' | 'sms' | 'push' | 'app' | null
          conteudo: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          conversa_id: string
          autor_tipo?: 'operador' | 'entregador' | 'cliente' | 'sistema' | null
          canal?: 'email' | 'sms' | 'push' | 'app' | null
          conteudo?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          conversa_id?: string
          autor_tipo?: 'operador' | 'entregador' | 'cliente' | 'sistema' | null
          canal?: 'email' | 'sms' | 'push' | 'app' | null
          conteudo?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      tipo_servicos: {
        Row: {
          id: string
          nome: string
          descricao: string | null
          ativo: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome: string
          descricao?: string | null
          ativo?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome?: string
          descricao?: string | null
          ativo?: boolean | null
          created_at?: string
          updated_at?: string
        }
      }
      nova_entrega: {
        Row: {
          id: string
          pedido_id: string | null
          cliente_id: string
          endereco_id: string
          tipo_servico_id: string | null
          modal_tipo: 'moto' | 'carro' | 'bike' | 'outro' | null
          atribuicao_modo: 'manual' | 'automatica'
          entregador_id: string | null
          opcionais: unknown | null
          observacoes: string | null
          solicitar_comprovante: boolean | null
          agendar_em: string | null
          retirada_no_local: boolean
          valor_manual: boolean | null
          valor_entrega: number | null
          valor_entregador: number | null
          valor_mercadoria: number | null
          tipo_cobranca: 'fatura' | 'avista' | 'pix' | 'cartao' | null
          pagamento_metodo: string | null
          pagamento_na_entrega: boolean
          troco_para: number | null
          documento_tipo: string | null
          documento_numero: string | null
          cobrar_destinatario: boolean | null
          coleta_usa_endereco_cadastro: boolean | null
          coleta_contato: string | null
          coleta_telefone: string | null
          coleta_cep: string | null
          coleta_endereco_texto: string | null
          coleta_complemento: string | null
          coleta_observacoes: string | null
          entrega_usa_endereco_cadastro: boolean | null
          entrega_contato: string | null
          entrega_telefone: string | null
          entrega_codigo_pedido: string | null
          entrega_centro_custo: string | null
          entrega_solicitante: string | null
          entrega_cep: string | null
          entrega_endereco_texto: string | null
          entrega_complemento: string | null
          entrega_observacoes: string | null
          retorno: boolean | null
          pontos_adicionais: unknown | null
          status: 'criada' | 'atribuida' | 'em_rota' | 'entregue' | 'cancelada' | null
          fatura_cliente_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          pedido_id?: string | null
          cliente_id: string
          endereco_id: string
          tipo_servico_id?: string | null
          modal_tipo?: 'moto' | 'carro' | 'bike' | 'outro' | null
          atribuicao_modo: 'manual' | 'automatica'
          entregador_id?: string | null
          opcionais?: unknown | null
          observacoes?: string | null
          solicitar_comprovante?: boolean | null
          agendar_em?: string | null
          retirada_no_local?: boolean
          valor_manual?: boolean | null
          valor_entrega?: number | null
          valor_entregador?: number | null
          valor_mercadoria?: number | null
          tipo_cobranca?: 'fatura' | 'avista' | 'pix' | 'cartao' | null
          pagamento_metodo?: string | null
          pagamento_na_entrega?: boolean
          troco_para?: number | null
          documento_tipo?: string | null
          documento_numero?: string | null
          cobrar_destinatario?: boolean | null
          coleta_usa_endereco_cadastro?: boolean | null
          coleta_contato?: string | null
          coleta_telefone?: string | null
          coleta_cep?: string | null
          coleta_endereco_texto?: string | null
          coleta_complemento?: string | null
          coleta_observacoes?: string | null
          entrega_usa_endereco_cadastro?: boolean | null
          entrega_contato?: string | null
          entrega_telefone?: string | null
          entrega_codigo_pedido?: string | null
          entrega_centro_custo?: string | null
          entrega_solicitante?: string | null
          entrega_cep?: string | null
          entrega_endereco_texto?: string | null
          entrega_complemento?: string | null
          entrega_observacoes?: string | null
          retorno?: boolean | null
          pontos_adicionais?: unknown | null
          status?: 'criada' | 'atribuida' | 'em_rota' | 'entregue' | 'cancelada' | null
          fatura_cliente_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          pedido_id?: string | null
          cliente_id?: string
          endereco_id?: string
          tipo_servico_id?: string | null
          modal_tipo?: 'moto' | 'carro' | 'bike' | 'outro' | null
          atribuicao_modo?: 'manual' | 'automatica'
          entregador_id?: string | null
          opcionais?: unknown | null
          observacoes?: string | null
          solicitar_comprovante?: boolean | null
          agendar_em?: string | null
          retirada_no_local?: boolean
          valor_manual?: boolean | null
          valor_entrega?: number | null
          valor_entregador?: number | null
          valor_mercadoria?: number | null
          tipo_cobranca?: 'fatura' | 'avista' | 'pix' | 'cartao' | null
          pagamento_metodo?: string | null
          pagamento_na_entrega?: boolean
          troco_para?: number | null
          documento_tipo?: string | null
          documento_numero?: string | null
          cobrar_destinatario?: boolean | null
          coleta_usa_endereco_cadastro?: boolean | null
          coleta_contato?: string | null
          coleta_telefone?: string | null
          coleta_cep?: string | null
          coleta_endereco_texto?: string | null
          coleta_complemento?: string | null
          coleta_observacoes?: string | null
          entrega_usa_endereco_cadastro?: boolean | null
          entrega_contato?: string | null
          entrega_telefone?: string | null
          entrega_codigo_pedido?: string | null
          entrega_centro_custo?: string | null
          entrega_solicitante?: string | null
          entrega_cep?: string | null
          entrega_endereco_texto?: string | null
          entrega_complemento?: string | null
          entrega_observacoes?: string | null
          retorno?: boolean | null
          pontos_adicionais?: unknown | null
          status?: 'criada' | 'atribuida' | 'em_rota' | 'entregue' | 'cancelada' | null
          fatura_cliente_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      acertos_entregadores: {
        Row: {
          id: string
          entregador_id: string
          entrega_id: string
          valor_pago: number | null
          status: 'pendente' | 'pago' | null
          pago_em: string | null
          tipo_saque: 'normal' | 'rapido' | null
          taxa_aplicada: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          entregador_id: string
          entrega_id: string
          valor_pago?: number | null
          status?: 'pendente' | 'pago' | null
          pago_em?: string | null
          tipo_saque?: 'normal' | 'rapido' | null
          taxa_aplicada?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          entregador_id?: string
          entrega_id?: string
          valor_pago?: number | null
          status?: 'pendente' | 'pago' | null
          pago_em?: string | null
          tipo_saque?: 'normal' | 'rapido' | null
          taxa_aplicada?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      comissoes_entregadores: {
        Row: {
          id: string
          entregador_id: string
          competencia: string | null
          total_entregas: number | null
          valor_total: number | null
          status: 'aberto' | 'pago' | null
          pago_em: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          entregador_id: string
          competencia?: string | null
          total_entregas?: number | null
          valor_total?: number | null
          status?: 'aberto' | 'pago' | null
          pago_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          entregador_id?: string
          competencia?: string | null
          total_entregas?: number | null
          valor_total?: number | null
          status?: 'aberto' | 'pago' | null
          pago_em?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      contas_pagar: {
        Row: {
          id: string
          fornecedor: string | null
          descricao: string | null
          valor: number | null
          vencimento: string | null
          status: 'pendente' | 'pago' | 'atrasado' | null
          pago_em: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          fornecedor?: string | null
          descricao?: string | null
          valor?: number | null
          vencimento?: string | null
          status?: 'pendente' | 'pago' | 'atrasado' | null
          pago_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          fornecedor?: string | null
          descricao?: string | null
          valor?: number | null
          vencimento?: string | null
          status?: 'pendente' | 'pago' | 'atrasado' | null
          pago_em?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      contas_receber: {
        Row: {
          id: string
          cliente_id: string
          descricao: string | null
          valor: number | null
          vencimento: string | null
          status: 'pendente' | 'recebido' | 'atrasado' | null
          recebido_em: string | null
          fatura_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          descricao?: string | null
          valor?: number | null
          vencimento?: string | null
          status?: 'pendente' | 'recebido' | 'atrasado' | null
          recebido_em?: string | null
          fatura_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          descricao?: string | null
          valor?: number | null
          vencimento?: string | null
          status?: 'pendente' | 'recebido' | 'atrasado' | null
          recebido_em?: string | null
          fatura_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      revisoes_agendamentos: {
        Row: {
          id: string
          entrega_id: string
          motivo: string | null
          valor_original: number | null
          valor_corrigido: number | null
          status: 'pendente' | 'corrigido' | null
          revisado_em: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          entrega_id: string
          motivo?: string | null
          valor_original?: number | null
          valor_corrigido?: number | null
          status?: 'pendente' | 'corrigido' | null
          revisado_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          entrega_id?: string
          motivo?: string | null
          valor_original?: number | null
          valor_corrigido?: number | null
          status?: 'pendente' | 'corrigido' | null
          revisado_em?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      faturamento_mensal: {
        Row: {
          id: string
          competencia: string | null
          total_faturado: number | null
          total_recebido: number | null
          status: 'aberto' | 'fechado' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          competencia?: string | null
          total_faturado?: number | null
          total_recebido?: number | null
          status?: 'aberto' | 'fechado' | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          competencia?: string | null
          total_faturado?: number | null
          total_recebido?: number | null
          status?: 'aberto' | 'fechado' | null
          created_at?: string
          updated_at?: string
        }
      }
      notas_fiscais: {
        Row: {
          id: string
          cliente_id: string
          descricao: string | null
          valor: number | null
          numero: string | null
          serie: string | null
          protocolo: string | null
          chave_nfe: string | null
          ambiente: 'homologacao' | 'producao' | null
          xml_assinado: string | null
          status: 'emitida' | 'erro' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          descricao?: string | null
          valor?: number | null
          numero?: string | null
          serie?: string | null
          protocolo?: string | null
          chave_nfe?: string | null
          ambiente?: 'homologacao' | 'producao' | null
          xml_assinado?: string | null
          status?: 'emitida' | 'erro' | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          descricao?: string | null
          valor?: number | null
          numero?: string | null
          serie?: string | null
          protocolo?: string | null
          chave_nfe?: string | null
          ambiente?: 'homologacao' | 'producao' | null
          xml_assinado?: string | null
          status?: 'emitida' | 'erro' | null
          created_at?: string
          updated_at?: string
        }
      }
      recibos: {
        Row: {
          id: string
          cliente_id: string
          descricao: string | null
          valor: number | null
          status: 'emitido' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          descricao?: string | null
          valor?: number | null
          status?: 'emitido' | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          descricao?: string | null
          valor?: number | null
          status?: 'emitido' | null
          created_at?: string
          updated_at?: string
        }
      }
      configuracoes_comercio: {
        Row: {
          id: string
          permitir_cadastro_entregador: boolean
          exigir_aprovacao_entregador: boolean
          limite_entregas_simultaneas: number
          raio_busca_entregador: number
          tempo_aceite_pedido: number
          permissoes_padrao_cliente: string[] | null
          permitir_alocar_entregador: boolean
          permitir_pedido_pronto: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          permitir_cadastro_entregador?: boolean
          exigir_aprovacao_entregador?: boolean
          limite_entregas_simultaneas?: number
          raio_busca_entregador?: number
          tempo_aceite_pedido?: number
          permissoes_padrao_cliente?: string[] | null
          permitir_alocar_entregador?: boolean
          permitir_pedido_pronto?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          permitir_cadastro_entregador?: boolean
          exigir_aprovacao_entregador?: boolean
          limite_entregas_simultaneas?: number
          raio_busca_entregador?: number
          tempo_aceite_pedido?: number
          permissoes_padrao_cliente?: string[] | null
          permitir_alocar_entregador?: boolean
          permitir_pedido_pronto?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      customizacao_app: {
        Row: {
          id: string
          nome_app: string | null
          cor_primaria: string | null
          cor_secundaria: string | null
          logotipo_url: string | null
          texto_boas_vindas: string | null
          texto_rodape: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome_app?: string | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          logotipo_url?: string | null
          texto_boas_vindas?: string | null
          texto_rodape?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome_app?: string | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          logotipo_url?: string | null
          texto_boas_vindas?: string | null
          texto_rodape?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      usuarios_permissoes: {
        Row: {
          id: string
          user_id: string
          permissoes: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          permissoes?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          permissoes?: string[] | null
          created_at?: string
          updated_at?: string
        }
      }
      config_fiscal: {
        Row: {
          id: string
          user_id: string
          cert_pfx_base64: string | null
          cert_password: string | null
          cfop_padrao: string | null
          ncm_padrao: string | null
          impostos_padrao: Json | null
          ambiente: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          cert_pfx_base64?: string | null
          cert_password?: string | null
          cfop_padrao?: string | null
          ncm_padrao?: string | null
          impostos_padrao?: Json | null
          ambiente?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          cert_pfx_base64?: string | null
          cert_password?: string | null
          cfop_padrao?: string | null
          ncm_padrao?: string | null
          impostos_padrao?: Json | null
          ambiente?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      integracoes_externas: {
        Row: {
          id: string
          tipo: string
          nome: string
          api_key: string | null
          api_secret: string | null
          webhook_url: string | null
          ativo: boolean | null
          config: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tipo: string
          nome: string
          api_key?: string | null
          api_secret?: string | null
          webhook_url?: string | null
          ativo?: boolean | null
          config?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tipo?: string
          nome?: string
          api_key?: string | null
          api_secret?: string | null
          webhook_url?: string | null
          ativo?: boolean | null
          config?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      integracoes_open_delivery: {
        Row: {
          id: string
          merchant_id: string | null
          client_id: string | null
          client_secret: string | null
          polling_interval: number | null
          ativo: boolean | null
          status_mapping: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          merchant_id?: string | null
          client_id?: string | null
          client_secret?: string | null
          polling_interval?: number | null
          ativo?: boolean | null
          status_mapping?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          merchant_id?: string | null
          client_id?: string | null
          client_secret?: string | null
          polling_interval?: number | null
          ativo?: boolean | null
          status_mapping?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      configuracoes_operacao: {
        Row: {
          id: string
          horario_funcionamento: Json | null
          taxa_servico: number | null
          pedido_minimo: number | null
          tempo_preparo_padrao: number | null
          modo_automatico: boolean | null
          regras_auto_cancelamento: Json | null
          regras_saque: Json | null
          taxa_saque_rapido: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          horario_funcionamento?: Json | null
          taxa_servico?: number | null
          pedido_minimo?: number | null
          tempo_preparo_padrao?: number | null
          modo_automatico?: boolean | null
          regras_auto_cancelamento?: Json | null
          regras_saque?: Json | null
          taxa_saque_rapido?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          horario_funcionamento?: Json | null
          taxa_servico?: number | null
          pedido_minimo?: number | null
          tempo_preparo_padrao?: number | null
          modo_automatico?: boolean | null
          regras_auto_cancelamento?: Json | null
          regras_saque?: Json | null
          taxa_saque_rapido?: number | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Functions: {
      get_cliente_public_info: {
        Args: {
          cid: string
        }
        Returns: {
          nome_completo: string
          foto_url: string | null
        }[]
      }
      get_entrega_comissao: {
        Args: {
          entrega_id: string
        }
        Returns: Json
      }
      integracoes_ze: {
        Row: {
          id: string
          cliente_id: string
          merchant_id: string
          api_key: string | null
          status: 'ativo' | 'inativo' | 'erro'
          last_synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          merchant_id: string
          api_key?: string | null
          status?: 'ativo' | 'inativo' | 'erro'
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          merchant_id?: string
          api_key?: string | null
          status?: 'ativo' | 'inativo' | 'erro'
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
