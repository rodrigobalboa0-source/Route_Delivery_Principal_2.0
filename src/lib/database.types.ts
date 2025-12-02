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
          created_at: string
          updated_at: string
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
          created_at?: string
          updated_at?: string
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
          created_at?: string
          updated_at?: string
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
          veiculo_tipo: 'moto' | 'bike' | 'carro' | null
          veiculo_modelo: string | null
          veiculo_placa: string | null
          veiculo_ano: number | null
          cnh_valida: boolean | null
          tipo_entrega: 'proprio' | 'terceirizado' | 'parceiro' | null
          taxa_entrega: number | null
          status: 'ativo' | 'inativo'
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
          veiculo_tipo?: 'moto' | 'bike' | 'carro' | null
          veiculo_modelo?: string | null
          veiculo_placa?: string | null
          veiculo_ano?: number | null
          cnh_valida?: boolean | null
          tipo_entrega?: 'proprio' | 'terceirizado' | 'parceiro' | null
          taxa_entrega?: number | null
          status?: 'ativo' | 'inativo'
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
          veiculo_tipo?: 'moto' | 'bike' | 'carro' | null
          veiculo_modelo?: string | null
          veiculo_placa?: string | null
          veiculo_ano?: number | null
          cnh_valida?: boolean | null
          tipo_entrega?: 'proprio' | 'terceirizado' | 'parceiro' | null
          taxa_entrega?: number | null
          status?: 'ativo' | 'inativo'
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
          valor_por_minuto: number
          ativa: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          modal_tipo: 'moto' | 'carro' | 'bike' | 'outro'
          valor_por_minuto: number
          ativa?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          modal_tipo?: 'moto' | 'carro' | 'bike' | 'outro'
          valor_por_minuto?: number
          ativa?: boolean | null
          created_at?: string
          updated_at?: string
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
          cliente_id: string
          endereco_id: string
          tipo_servico_id: string | null
          modal_tipo: 'moto' | 'carro' | 'bike' | 'outro' | null
          atribuicao_modo: 'manual' | 'automatica'
          entregador_id: string | null
          opcionais: unknown | null
          observacoes: string | null
          status: 'criada' | 'atribuida' | 'em_rota' | 'entregue' | 'cancelada' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          endereco_id: string
          tipo_servico_id?: string | null
          modal_tipo?: 'moto' | 'carro' | 'bike' | 'outro' | null
          atribuicao_modo: 'manual' | 'automatica'
          entregador_id?: string | null
          opcionais?: unknown | null
          observacoes?: string | null
          status?: 'criada' | 'atribuida' | 'em_rota' | 'entregue' | 'cancelada' | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          endereco_id?: string
          tipo_servico_id?: string | null
          modal_tipo?: 'moto' | 'carro' | 'bike' | 'outro' | null
          atribuicao_modo?: 'manual' | 'automatica'
          entregador_id?: string | null
          opcionais?: unknown | null
          observacoes?: string | null
          status?: 'criada' | 'atribuida' | 'em_rota' | 'entregue' | 'cancelada' | null
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
      creditos_clientes: {
        Row: {
          id: string
          cliente_id: string
          valor: number | null
          motivo: string | null
          status: 'disponivel' | 'utilizado' | 'expirado' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          valor?: number | null
          motivo?: string | null
          status?: 'disponivel' | 'utilizado' | 'expirado' | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          valor?: number | null
          motivo?: string | null
          status?: 'disponivel' | 'utilizado' | 'expirado' | null
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
      config_fiscal: {
        Row: {
          id: string
          user_id: string
          cert_pfx_base64: string | null
          cert_password: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          cert_pfx_base64?: string | null
          cert_password?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          cert_pfx_base64?: string | null
          cert_password?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
