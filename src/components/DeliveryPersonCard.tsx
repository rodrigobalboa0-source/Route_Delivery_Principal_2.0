import { User, Phone, Clock } from 'lucide-react';
import type { Database } from '../lib/database.types';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

interface DeliveryPersonCardProps {
  person: DeliveryPerson;
}

export function DeliveryPersonCard({ person }: DeliveryPersonCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'disponivel':
        return 'bg-sky-100 text-sky-800 border-sky-300';
      case 'em_entrega':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'inativo':
        return 'bg-slate-100 text-slate-800 border-slate-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'disponivel':
        return 'Disponível';
      case 'em_entrega':
        return 'Em Entrega';
      case 'inativo':
        return 'Inativo';
      default:
        return status;
    }
  };

  const formatLastUpdate = (date: string | null) => {
    if (!date) return 'Nunca';
    const now = new Date();
    const updateDate = new Date(date);
    const diffMs = now.getTime() - updateDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}min atrás`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    return `${Math.floor(diffHours / 24)}d atrás`;
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
            <User size={24} className="text-slate-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{person.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Phone size={14} className="text-slate-400" />
              <span className="text-sm text-slate-600">{person.phone}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              person.is_online ? 'bg-sky-500' : 'bg-slate-400'
            }`}
            title={person.is_online ? 'Online' : 'Offline'}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
            person.status
          )}`}
        >
          {getStatusLabel(person.status)}
        </span>

        {person.last_location_update && (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Clock size={12} />
            <span>{formatLastUpdate(person.last_location_update)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
