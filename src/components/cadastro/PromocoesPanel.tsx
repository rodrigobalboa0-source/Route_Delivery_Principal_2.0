import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Trash2, Upload, AlertCircle, CheckCircle, Pencil, X } from 'lucide-react';

interface Promocao {
  id: string;
  descricao: string;
  imagem_url: string;
  ativa: boolean;
  created_at: string;
}

export function PromocoesPanel() {
  const [promocoes, setPromocoes] = useState<Promocao[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [descricao, setDescricao] = useState('');
  const [imagemFile, setImagemFile] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPromocoes();
  }, []);

  const fetchPromocoes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('promocoes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar promoções:', error);
      setError('Erro ao carregar promoções.');
    } else {
      setPromocoes(data || []);
    }
    setLoading(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImagemFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagemPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEdit = (promocao: Promocao) => {
    setEditingId(promocao.id);
    setDescricao(promocao.descricao);
    setImagemPreview(promocao.imagem_url);
    setImagemFile(null); 
    setError(null);
    setSuccess(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setDescricao('');
    setImagemFile(null);
    setImagemPreview(null);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao || (!imagemFile && !editingId)) {
      setError('Por favor, preencha a descrição e selecione uma imagem.');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      let publicUrl = imagemPreview;

      
      if (imagemFile) {
        const fileExt = imagemFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('promocoes')
          .upload(filePath, imagemFile);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from('promocoes')
          .getPublicUrl(filePath);
          
        publicUrl = data.publicUrl;
      }

      if (editingId) {
        
        const { error: updateError } = await supabase
          .from('promocoes')
          .update({ 
            descricao, 
            ...(imagemFile ? { imagem_url: publicUrl } : {}) 
          })
          .eq('id', editingId);

        if (updateError) throw updateError;
        setSuccess('Promoção atualizada com sucesso!');
        setEditingId(null);
      } else {
        
        const { error: insertError } = await supabase
          .from('promocoes')
          .insert([{ descricao, imagem_url: publicUrl, ativa: true }]);

        if (insertError) throw insertError;
        setSuccess('Promoção cadastrada com sucesso!');
      }

      setDescricao('');
      setImagemFile(null);
      setImagemPreview(null);
      fetchPromocoes();
    } catch (err: any) {
      console.error('Erro ao salvar promoção:', err);
      setError(err.message || 'Erro ao salvar promoção.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, imagemUrl: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta promoção?')) return;

    try {
      
      const { error: deleteError } = await supabase
        .from('promocoes')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      

      setPromocoes(promocoes.filter(p => p.id !== id));
    } catch (err: any) {
      console.error('Erro ao excluir:', err);
      alert('Erro ao excluir promoção.');
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
        const { data, error } = await supabase
            .from('promocoes')
            .update({ ativa: !currentStatus })
            .eq('id', id)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            console.error('Update de status não afetou nenhuma linha (id:', id, ')');
            alert('Não foi possível alterar o status: nenhuma linha foi atualizada. Verifique suas permissões ou recarregue a página.');
            return;
        }

        setPromocoes(promocoes.map(p => p.id === id ? { ...p, ativa: !currentStatus } : p));
    } catch (err) {
        console.error('Erro ao atualizar status:', err);
        alert('Erro ao atualizar status.');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Gerenciar Promoções</h1>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-slate-700">
            {editingId ? 'Editar Promoção' : 'Nova Promoção'}
          </h2>
          {editingId && (
            <button
              onClick={handleCancelEdit}
              className="text-slate-500 hover:text-slate-700 flex items-center gap-1 text-sm"
            >
              <X size={16} /> Cancelar Edição
            </button>
          )}
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center gap-2 text-sm">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        
        {success && (
          <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center gap-2 text-sm">
            <CheckCircle size={18} />
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descrição da Promoção</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
              rows={3}
              placeholder="Descreva os detalhes da promoção..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Imagem</label>
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-3 text-slate-400" />
                    <p className="mb-2 text-sm text-slate-500"><span className="font-semibold">Clique para enviar</span></p>
                    <p className="text-xs text-slate-500">PNG, JPG ou GIF</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                </label>
              </div>
              {imagemPreview && (
                <div className="w-32 h-32 border border-slate-200 rounded-lg overflow-hidden bg-slate-100">
                  <img src={imagemPreview} alt="Preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploading}
              className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {uploading ? 'Salvando...' : (editingId ? 'Atualizar Promoção' : 'Cadastrar Promoção')}
            </button>
          </div>
        </form>
      </div>

      <h2 className="text-lg font-semibold text-slate-700 mb-4">Promoções Cadastradas</h2>
      
      {loading ? (
        <div className="text-center py-8 text-slate-500">Carregando promoções...</div>
      ) : promocoes.length === 0 ? (
        <div className="text-center py-8 text-slate-500 bg-white rounded-lg border border-slate-200">
          Nenhuma promoção cadastrada.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {promocoes.map((promocao) => (
            <div key={promocao.id} className={`bg-white rounded-lg shadow-sm border ${promocao.ativa ? 'border-slate-200' : 'border-slate-200 opacity-75'} overflow-hidden`}>
              <div className="aspect-video w-full bg-slate-100 relative">
                <img src={promocao.imagem_url} alt="Promoção" className="w-full h-full object-cover" />
                {!promocao.ativa && (
                    <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
                        <span className="bg-slate-800 text-white px-3 py-1 rounded-full text-xs font-bold">INATIVA</span>
                    </div>
                )}
              </div>
              <div className="p-4">
                <p className="text-slate-800 text-sm mb-4 line-clamp-3">{promocao.descricao}</p>
                <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                  <button 
                    onClick={() => handleToggleStatus(promocao.id, promocao.ativa)}
                    className={`text-xs font-medium px-2 py-1 rounded ${promocao.ativa ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {promocao.ativa ? 'Ativa' : 'Inativa'}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(promocao)}
                      className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                      title="Editar"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(promocao.id, promocao.imagem_url)}
                      className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
                      title="Excluir"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}