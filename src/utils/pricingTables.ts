export interface TabelaPrecoLike {
  id: string;
  nome?: string | null;
  is_default?: boolean | null;
}

/**
 * Escolhe a tabela de preço a usar quando não há tabela vinculada ao
 * cliente/modal selecionado (ex: admin ainda não escolheu um cliente).
 * Prioriza a tabela marcada como `is_default`, desde que ela tenha faixas
 * cadastradas; caso contrário usa a primeira tabela (na ordem recebida) que
 * tenha faixas. Retorna '' se nenhuma tabela válida existir.
 */
export function pickFallbackTabelaId<T extends TabelaPrecoLike>(
  tabelas: T[],
  tabelasComFaixas: Set<string>
): string {
  const defaultTable = tabelas.find((t) => t.is_default === true);
  if (defaultTable && tabelasComFaixas.has(defaultTable.id)) return defaultTable.id;

  const firstComFaixas = tabelas.find((t) => tabelasComFaixas.has(t.id));
  if (firstComFaixas) return firstComFaixas.id;

  return '';
}
