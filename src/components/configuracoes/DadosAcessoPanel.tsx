import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { User, Shield, Search, Edit2, Check, AlertCircle } from 'lucide-react';
import { Database } from '../../lib/database.types';
import { Modal } from '../Modal';

type UserRow = Database['public']['Tables']['users']['Row'];

interface UserWithPermissions extends UserRow {
  permissoes_extras?: string[];
}

export function DadosAcessoPanel() {
  const [users, setUsers] = useState<UserWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<UserWithPermissions | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Available permissions (mock list for now, can be expanded)
  const availablePermissions = [
    { id: 'financeiro_full', label: 'Acesso total ao Financeiro' },
    { id: 'financeiro_view', label: 'Visualizar Financeiro' },
    { id: 'cadastro_edit', label: 'Editar Cadastros' },
    { id: 'relatorios_view', label: 'Visualizar Relatórios' },
    { id: 'config_edit', label: 'Editar Configurações' }
  ];

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      // Fetch users
      const { data: usersData, error: usersError } = await (supabase
        .from('users') as any)
        .select('*')
        .order('full_name');

      if (usersError) throw usersError;

      // Fetch permissions
      const { data: permsData, error: permsError } = await supabase
        .from('usuarios_permissoes')
        .select('*') as any;

      if (permsError && permsError.code !== 'PGRST116') {
        console.warn('Error fetching permissions', permsError);
      }

      // Merge data
      const merged = (usersData || []).map((u: any) => {
        const p = (permsData as any[])?.find((pd: any) => pd.user_id === u.id);
        return {
          ...u,
          permissoes_extras: p?.permissoes || []
        };
      });

      setUsers(merged);
    } catch (err: any) {
      console.error('Erro ao carregar usuários:', err);
      setError('Falha ao carregar lista de usuários');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user: UserWithPermissions) => {
    setEditingUser({...user});
    setIsModalOpen(true);
    setError(null);
    setSuccess(false);
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    setSaving(true);
    setError(null);

    try {
      // Update role in users table
      const { error: userError } = await (supabase
        .from('users') as any)
        .update({ role: editingUser.role })
        .eq('id', editingUser.id);

      if (userError) throw userError;

      // Update permissions in usuarios_permissoes table
      // Check if entry exists
      const { data: existingPerm } = await supabase
        .from('usuarios_permissoes')
        .select('id')
        .eq('user_id', editingUser.id)
        .single();

      if (existingPerm) {
        await (supabase
          .from('usuarios_permissoes') as any)
          .update({ permissoes: editingUser.permissoes_extras, updated_at: new Date().toISOString() })
          .eq('user_id', editingUser.id);
      } else {
        await (supabase
          .from('usuarios_permissoes') as any)
          .insert({ user_id: editingUser.id, permissoes: editingUser.permissoes_extras });
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      setIsModalOpen(false);
      fetchUsers(); // Refresh list
    } catch (err: any) {
      console.error('Erro ao salvar usuário:', err);
      setError(err.message || 'Falha ao salvar alterações');
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = (permId: string) => {
    if (!editingUser) return;
    const current = editingUser.permissoes_extras || [];
    if (current.includes(permId)) {
      setEditingUser({
        ...editingUser,
        permissoes_extras: current.filter(p => p !== permId)
      });
    } else {
      setEditingUser({
        ...editingUser,
        permissoes_extras: [...current, permId]
      });
    }
  };

  const filteredUsers = users.filter(u => 
    (u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || '') ||
    (u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || '')
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dados de Acesso</h1>
          <p className="text-slate-500">Gerencie usuários, administradores e permissões de acesso.</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 text-green-700 border border-green-200 rounded-lg">
          Alterações salvas com sucesso!
        </div>
      )}

      <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center gap-4 bg-slate-50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por nome ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <div className="text-sm text-slate-500">
            Total: {filteredUsers.length} usuários
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">Carregando usuários...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <th className="p-4 font-semibold border-b border-slate-200">Usuário</th>
                  <th className="p-4 font-semibold border-b border-slate-200">Email</th>
                  <th className="p-4 font-semibold border-b border-slate-200">Função</th>
                  <th className="p-4 font-semibold border-b border-slate-200">Permissões Extras</th>
                  <th className="p-4 font-semibold border-b border-slate-200 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-100">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold">
                          {user.full_name?.charAt(0).toUpperCase() || <User size={16} />}
                        </div>
                        <span className="font-medium text-slate-900">{user.full_name || 'Sem nome'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-slate-600">{user.email}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        user.role === 'admin' 
                          ? 'bg-purple-100 text-purple-700' 
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {user.role === 'admin' ? <Shield size={12} /> : <User size={12} />}
                        {user.role === 'admin' ? 'Administrador' : 'Usuário'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {user.permissoes_extras && user.permissoes_extras.length > 0 ? (
                          user.permissoes_extras.map(p => (
                            <span key={p} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] border border-blue-100">
                              {availablePermissions.find(ap => ap.id === p)?.label || p}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => handleEdit(user)}
                        className="p-1 text-slate-400 hover:text-sky-600 rounded transition-colors"
                        title="Editar acesso"
                      >
                        <Edit2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Editar Acesso do Usuário"
        confirmText={saving ? "Salvando..." : "Salvar Alterações"}
        onConfirm={handleSaveUser}
        maxWidth="max-w-lg"
      >
        {editingUser && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
              <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xl font-bold">
                {editingUser.full_name?.charAt(0).toUpperCase() || <User />}
              </div>
              <div>
                <div className="font-bold text-slate-900">{editingUser.full_name}</div>
                <div className="text-sm text-slate-500">{editingUser.email}</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Função do Sistema</label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`cursor-pointer border rounded-lg p-3 flex items-center gap-3 transition-all ${editingUser.role === 'user' ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input 
                    type="radio" 
                    name="role" 
                    className="sr-only"
                    checked={editingUser.role === 'user'}
                    onChange={() => setEditingUser({...editingUser, role: 'user'})}
                  />
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${editingUser.role === 'user' ? 'border-sky-500' : 'border-slate-400'}`}>
                    {editingUser.role === 'user' && <div className="w-2 h-2 rounded-full bg-sky-500" />}
                  </div>
                  <div>
                    <div className="font-medium text-sm text-slate-900">Usuário Padrão</div>
                    <div className="text-xs text-slate-500">Acesso básico ao sistema</div>
                  </div>
                </label>

                <label className={`cursor-pointer border rounded-lg p-3 flex items-center gap-3 transition-all ${editingUser.role === 'admin' ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input 
                    type="radio" 
                    name="role" 
                    className="sr-only"
                    checked={editingUser.role === 'admin'}
                    onChange={() => setEditingUser({...editingUser, role: 'admin'})}
                  />
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${editingUser.role === 'admin' ? 'border-purple-500' : 'border-slate-400'}`}>
                    {editingUser.role === 'admin' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                  </div>
                  <div>
                    <div className="font-medium text-sm text-slate-900">Administrador</div>
                    <div className="text-xs text-slate-500">Acesso total ao sistema</div>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Permissões Extras</label>
              <div className="space-y-2 border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                {availablePermissions.map(perm => (
                  <label key={perm.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded cursor-pointer">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${editingUser.permissoes_extras?.includes(perm.id) ? 'bg-sky-500 border-sky-500 text-white' : 'border-slate-300'}`}>
                      {editingUser.permissoes_extras?.includes(perm.id) && <Check size={14} />}
                    </div>
                    <input 
                      type="checkbox" 
                      className="hidden"
                      checked={editingUser.permissoes_extras?.includes(perm.id) || false}
                      onChange={() => togglePermission(perm.id)}
                    />
                    <span className="text-sm text-slate-700">{perm.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">Permissões granulares além da função principal.</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
