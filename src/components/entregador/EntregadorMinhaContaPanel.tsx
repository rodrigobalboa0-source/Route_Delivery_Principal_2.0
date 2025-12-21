import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { User, Mail, Phone, Truck } from 'lucide-react';

export function EntregadorMinhaContaPanel() {
  const [perfil, setPerfil] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPerfil();
  }, []);

  async function fetchPerfil() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data, error } = await supabase
        .from('entregadores')
        .select('*')
        .eq('email', user.email)
        .single();

      if (error) throw error;
      setPerfil(data);
    } catch (error) {
      console.error('Erro ao buscar perfil:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="p-6">Carregando...</div>;
  if (!perfil) return <div className="p-6">Perfil não encontrado.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <User className="w-6 h-6" />
        Minha Conta
      </h1>
      
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <div className="flex items-center gap-6 mb-8">
          <div className="w-24 h-24 bg-gray-200 rounded-full overflow-hidden">
             {perfil.foto_url ? (
               <img src={perfil.foto_url} alt={perfil.nome_completo} className="w-full h-full object-cover" />
             ) : (
               <div className="w-full h-full flex items-center justify-center text-gray-400">
                 <User size={40} />
               </div>
             )}
          </div>
          <div>
            <h2 className="text-xl font-bold">{perfil.nome_completo}</h2>
            <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold uppercase ${
              perfil.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {perfil.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
             <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
               <Mail className="text-gray-400" size={20} />
               <div>
                 <p className="text-xs text-gray-500">Email</p>
                 <p className="text-sm font-medium">{perfil.email}</p>
               </div>
             </div>
             <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
               <Phone className="text-gray-400" size={20} />
               <div>
                 <p className="text-xs text-gray-500">Telefone</p>
                 <p className="text-sm font-medium">{perfil.telefone || '-'}</p>
               </div>
             </div>
          </div>
          
          <div className="space-y-4">
             <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
               <Truck className="text-gray-400" size={20} />
               <div>
                 <p className="text-xs text-gray-500">Modal</p>
                 <p className="text-sm font-medium">{perfil.modal || '-'}</p>
               </div>
             </div>
             <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
               <User className="text-gray-400" size={20} />
               <div>
                 <p className="text-xs text-gray-500">CPF</p>
                 <p className="text-sm font-medium">{perfil.cpf || '-'}</p>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
