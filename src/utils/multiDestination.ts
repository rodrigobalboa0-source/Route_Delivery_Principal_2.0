export type ExtraDeliveryPoint = {
  contato?: string;
  telefone?: string;
  cep?: string;
  endereco_texto?: string;
  numero?: string;
  complemento?: string;
  observacoes?: string;
};

export type TimelineEntry = {
  [key: string]: string;
};

export type Opcionais = {
  destino_atual_indice?: number;
  timeline?: TimelineEntry;
  [key: string]: any;
};

export type Entrega = {
  id: string;
  pontos_adicionais?: any[];
  opcionais?: Opcionais;
  entrega_endereco_texto?: string;
  entrega_contato?: string | null;
  entrega_telefone?: string | null;
  entrega_cep?: string | null;
  entrega_complemento?: string | null;
  entrega_observacoes?: string | null;
  status?: string;
  pedido_id?: string;
  [key: string]: any;
};


export type EntregaInput = any;

export type AdvanceDestinationResult = {
  success: boolean;
  shouldFinalize: boolean;
  nextStatus?: string;
  updatedOpcionais?: Opcionais;
  updatedFields?: Partial<Entrega>;
  error?: string;
};


export function parseExtraDeliveryPoints(entrega: any): ExtraDeliveryPoint[] {
  const raw = entrega?.pontos_adicionais;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => ({
      contato: p?.contato || '',
      telefone: p?.telefone || '',
      cep: p?.cep || '',
      endereco_texto: p?.endereco_texto || '',
      numero: p?.numero || '',
      complemento: p?.complemento || '',
      observacoes: p?.observacoes || '',
    }))
    .filter((p) => String(p.endereco_texto || '').trim().length > 0);
}


export function getCurrentDestinationIndex(entrega: any): number {
  const idx = entrega?.opcionais?.destino_atual_indice;
  if (typeof idx !== 'number' || !Number.isFinite(idx) || idx < 0) return 0;
  return Math.floor(idx);
}


export function hasMultipleDestinations(entrega: any): boolean {
  const points = parseExtraDeliveryPoints(entrega);
  return points.length > 0;
}


export function getTotalDestinations(entrega: any): number {
  const points = parseExtraDeliveryPoints(entrega);
  return 1 + points.length;
}


export function hasNextDestination(entrega: any): boolean {
  const currentIdx = getCurrentDestinationIndex(entrega);
  const points = parseExtraDeliveryPoints(entrega);
  return currentIdx < points.length;
}


export function isLastDestination(entrega: any): boolean {
  return !hasNextDestination(entrega);
}


export function getNextDestination(entrega: any): ExtraDeliveryPoint | null {
  const currentIdx = getCurrentDestinationIndex(entrega);
  const points = parseExtraDeliveryPoints(entrega);
  
  if (currentIdx >= points.length) return null;
  
  return points[currentIdx];
}


export function buildFullAddress(point: ExtraDeliveryPoint): string {
  const base = String(point.endereco_texto || '').trim();
  const numero = point.numero ? String(point.numero).trim() : '';
  
  if (!base) return '';
  return numero ? `${base}, ${numero}` : base;
}


export function calculateAdvanceDestination(
  entrega: any,
  nowIso: string = new Date().toISOString()
): AdvanceDestinationResult {
  const opcionais = entrega.opcionais || {};
  const timeline = opcionais.timeline || {};
  const currentDestinoIdx = getCurrentDestinationIndex(entrega);
  const extras = parseExtraDeliveryPoints(entrega);
  

  if (currentDestinoIdx >= extras.length) {
    return {
      success: false,
      shouldFinalize: false,
      error: 'Não há mais destinos para avançar'
    };
  }
  
  const nextPoint = extras[currentDestinoIdx];
  if (!nextPoint) {
    return {
      success: false,
      shouldFinalize: false,
      error: 'Próximo destino inválido'
    };
  }
  
  const nextAddr = buildFullAddress(nextPoint);
  if (!nextAddr || nextAddr === ',') {
    return {
      success: false,
      shouldFinalize: false,
      error: 'Próximo destino sem endereço válido'
    };
  }
  
  const advanceTimeline = {
    ...timeline,
    [`destino_${currentDestinoIdx + 1}_concluido_em`]: nowIso,
    [`destino_${currentDestinoIdx + 2}_iniciado_em`]: nowIso,
  };
  

  const advancedOpcionais: Opcionais = {
    ...opcionais,
    timeline: advanceTimeline,
    destino_atual_indice: currentDestinoIdx + 1,
  };
  

  const isLast = currentDestinoIdx + 1 >= extras.length;
  
  const updatedFields: Partial<Entrega> = {
    status: isLast ? 'entregue' : 'em_rota',
    updated_at: nowIso,
    opcionais: advancedOpcionais,
    entrega_contato: nextPoint.contato || null,
    entrega_telefone: nextPoint.telefone || null,
    entrega_cep: nextPoint.cep || null,
    entrega_endereco_texto: nextAddr,
    entrega_complemento: nextPoint.complemento || null,
    entrega_observacoes: nextPoint.observacoes || null,
  };
  
  
  return {
    success: true,
    shouldFinalize: isLast,
    nextStatus: isLast ? 'entregue' : 'em_rota',
    updatedOpcionais: advancedOpcionais,
    updatedFields,
  };
}


export function safeParseArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}