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
        }
      }
    }
  }
}
