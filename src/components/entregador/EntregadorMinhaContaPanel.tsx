import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { User, Mail, Phone, Truck, Camera } from 'lucide-react';

export function EntregadorMinhaContaPanel() {
  const [perfil, setPerfil] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPerfil();
  }, []);

  async function fetchPerfil() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data, error } = await supabase
        .from('entregadores')
        .select('id, nome_completo, cpf, rg, data_nascimento, telefone, email, veiculo_tipo, veiculo_modelo, veiculo_placa, veiculo_ano, cnh_valida, tipo_entrega, taxa_entrega, status, created_at, updated_at, foto_url, foto_base64, cep, rua, numero, complemento, bairro, cidade, is_online, current_latitude, current_longitude, last_location_update, prioridade_busca, prioridade_tempo, heading')
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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !perfil) return;

    const file = e.target.files[0];
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `entregadores/${perfil.id}/foto-${Date.now()}.${fileExt}`;

      const { error: uploadError, data } = await supabase.storage
        .from('images')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(data.path);

      const { error: updateError } = await supabase
        .from('entregadores')
        .update({ foto_url: publicUrl })
        .eq('id', perfil.id);

      if (updateError) throw updateError;

      setPerfil({ ...perfil, foto_url: publicUrl });
      alert('Foto atualizada com sucesso!');
    } catch (error) {
      console.error('Erro ao atualizar foto:', error);
      alert('Erro ao atualizar foto. Tente novamente.');
    } finally {
      setUploading(false);
    }
  };

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
          <div className="relative group">
            <div className="w-24 h-24 bg-gray-200 rounded-full overflow-hidden border-2 border-white shadow-md">
               {perfil.foto_url || perfil.foto_base64 ? (
                 <img src={perfil.foto_url || perfil.foto_base64} alt={perfil.nome_completo} className="w-full h-full object-cover" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center text-gray-400 bg-slate-100">
                   <User size={40} />
                 </div>
               )}
            </div>
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 p-2 bg-sky-500 rounded-full text-white shadow-lg hover:bg-sky-600 transition-colors"
              title="Alterar foto"
            >
              <Camera size={16} />
            </button>
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*" 
              onChange={handlePhotoUpload} 
              className="hidden" 
            />
            {uploading && (
              <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
