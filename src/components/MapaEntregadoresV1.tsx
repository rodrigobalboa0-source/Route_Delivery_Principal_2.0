// Mapa da Operação — portado fielmente do admin V1 (MapaEntregadores.jsx).
// react-leaflet + OpenStreetMap, avatares dos entregadores com status, pinos de
// pedido por status, ícone de loja, rótulos fixos e legenda.
import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapaEntregadoresV1.css';

const CENTRO_PADRAO: [number, number] = [-22.9056, -47.0608]; // Campinas
const NOVO_MS = 2 * 60 * 1000;

const VEICULOS: Record<string, string> = {
  MOTO: 'Moto', CARRO: 'Carro', BIKE: 'Bicicleta', BICICLETA: 'Bicicleta', PES: 'A pé', VAN: 'Van',
};

function escapar(texto = ''): string {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function iniciais(nome = ''): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}
const primeiroNome = (nome = '') => nome.trim().split(/\s+/).slice(0, 2).join(' ');

function tempoRelativo(data?: string | number | Date | null): string {
  if (!data) return '—';
  const ms = Date.now() - new Date(data).getTime();
  if (!Number.isFinite(ms)) return '—';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

function iconeAvatar(e: any, emCorrida: boolean): L.DivIcon {
  const miolo = e.fotoUrl
    ? `<img src="${escapar(e.fotoUrl)}" alt="" />`
    : `<span>${escapar(iniciais(e.nomeCompleto))}</span>`;
  return L.divIcon({
    className: 'marcador-avatar',
    html: `<div class="avatar-mapa">${miolo}<i class="${emCorrida ? 'status-corrida' : 'status-livre'}"></i></div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    tooltipAnchor: [0, -24],
  });
}

function iconePedido(p: any, novo: boolean): L.DivIcon {
  return L.divIcon({
    className: 'marcador-pedido',
    html: `<div class="pino-pedido st-${p.status}${p.destino ? '' : ' sem-local'}${novo ? ' novo' : ''}"><span></span></div>`,
    iconSize: [26, 34],
    iconAnchor: [13, 32],
    tooltipAnchor: [12, -20],
  });
}

const ICONE_LOJA = L.divIcon({
  className: 'marcador-loja',
  html: `<div class="loja-mapa"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6"/></svg></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  tooltipAnchor: [0, -16],
});

function enquadrarTudo(map: L.Map, pontos: Array<[number, number]>) {
  if (pontos.length === 1) map.setView(pontos[0], 15);
  else if (pontos.length) map.fitBounds(L.latLngBounds(pontos as any), { padding: [60, 60], maxZoom: 15 });
}

function Enquadrar({ pontos, carregado, novos }: { pontos: Array<[number, number]>; carregado: boolean; novos: Array<[number, number]> }) {
  const map = useMap();
  const feito = useRef(false);
  useEffect(() => {
    if (feito.current || !carregado) return;
    feito.current = true;
    enquadrarTudo(map, pontos);
  }, [carregado, pontos, map]);
  useEffect(() => {
    if (!feito.current || !novos.length) return;
    const area = map.getBounds();
    novos.filter((p) => !area.contains(p as any)).forEach((p) => (map as any).panInside(p, { padding: [60, 60] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novos.map((p) => p.join()).join('|'), map]);
  useEffect(() => {
    const aplicar = () => map.getContainer().classList.toggle('zoom-longe', map.getZoom() < 14);
    aplicar();
    map.on('zoomend', aplicar);
    return () => { map.off('zoomend', aplicar); };
  }, [map]);
  return (
    <div className="leaflet-top leaflet-right">
      <div className="leaflet-control">
        <button type="button" className="mapa-botao" onClick={() => enquadrarTudo(map, pontos)}>Ver todos</button>
      </div>
    </div>
  );
}

const temPos = (o: any) => o && o.lat != null && o.lng != null;

interface Props {
  entregadores?: any[];
  pedidos?: any[];
  altura?: number | string;
  onPedido?: (p: any) => void;
  onOffline?: (e: any) => void;
  carregado?: boolean;
}

export default function MapaEntregadoresV1({ entregadores = [], pedidos = [], altura = '100%', onPedido, onOffline, carregado = true }: Props) {
  const agora = Date.now();

  const pedidosNoMapa = useMemo(() => {
    const porLoja: Record<string, number> = {};
    return pedidos
      .map((p: any) => {
        if (temPos(p.destino)) return { ...p, pos: [p.destino.lat, p.destino.lng] as [number, number] };
        if (!temPos(p.loja)) return null;
        const i = (porLoja[p.loja.id] = (porLoja[p.loja.id] ?? -1) + 1);
        const ang = (i * 2 * Math.PI) / 8, raio = 0.0012 * (1 + Math.floor(i / 8));
        return { ...p, pos: [p.loja.lat + raio * Math.sin(ang), p.loja.lng + raio * Math.cos(ang)] as [number, number] };
      })
      .filter(Boolean) as any[];
  }, [pedidos]);

  const lojas = useMemo(() => {
    const m = new Map<any, any>();
    pedidos.forEach((p: any) => {
      if (!temPos(p.loja)) return;
      const l = m.get(p.loja.id) || { ...p.loja, qtd: 0 };
      l.qtd++;
      m.set(p.loja.id, l);
    });
    return [...m.values()];
  }, [pedidos]);

  const motoboys = useMemo(() => {
    const m = new Map<any, any>(entregadores.filter(temPos).map((e: any) => [e.id, { ...e, levando: [] }]));
    pedidos.forEach((p: any) => {
      if (!p.entregador) return;
      if (!m.has(p.entregador.id) && temPos(p.entregador)) m.set(p.entregador.id, { ...p.entregador, levando: [] });
      m.get(p.entregador.id)?.levando.push(p);
    });
    return [...m.values()];
  }, [entregadores, pedidos]);

  const pontos = useMemo<Array<[number, number]>>(
    () => [...motoboys.map((e: any) => [e.lat, e.lng] as [number, number]), ...pedidosNoMapa.map((p: any) => p.pos), ...lojas.map((l: any) => [l.lat, l.lng] as [number, number])],
    [motoboys, pedidosNoMapa, lojas],
  );

  const iconesMotoboy = useMemo(
    () => Object.fromEntries(motoboys.map((e: any) => [e.id, iconeAvatar(e, e.levando.length > 0 || e.pedidos?.length > 0)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [motoboys.map((e: any) => `${e.id}:${e.fotoUrl}:${e.levando.length}:${e.pedidos?.length}`).join('|')],
  );

  return (
    <div className="mapa mapa-v1" style={{ height: altura }}>
      <MapContainer center={pontos[0] || CENTRO_PADRAO} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Enquadrar
          pontos={pontos}
          carregado={carregado}
          novos={pedidosNoMapa.filter((p: any) => agora - new Date(p.createdAt).getTime() < NOVO_MS).map((p: any) => p.pos)}
        />

        {lojas.map((l: any) => (
          <Marker key={`loja-${l.id}`} position={[l.lat, l.lng]} icon={ICONE_LOJA}>
            <Tooltip direction="top"><strong>{l.nome}</strong><br />{l.qtd} pedido(s) em aberto</Tooltip>
          </Marker>
        ))}

        {pedidosNoMapa.map((p: any) => (
          <Marker
            key={`p-${p.id}`}
            position={p.pos}
            icon={iconePedido(p, agora - new Date(p.createdAt).getTime() < NOVO_MS)}
            eventHandlers={onPedido ? { click: () => onPedido(p) } : undefined}
            zIndexOffset={p.entregador ? 0 : 500}
          >
            <Tooltip permanent direction="right" className={`rotulo-pedido st-${p.status}`} interactive={false}>
              <strong>{p.clienteNome}</strong>
              {p.entregador && <span className="rotulo-linha">🏍 {primeiroNome(p.entregador.nomeCompleto)}</span>}
            </Tooltip>
          </Marker>
        ))}

        {motoboys.map((e: any) => {
          const info = (
            <>
              <strong>{e.nomeCompleto}</strong> · {VEICULOS[e.veiculoTipo] || e.veiculoTipo || ''}
              <br />
              {e.levando.length
                ? `Levando: ${e.levando.map((p: any) => `${p.clienteNome} (${p.codigo})`).join(', ')}`
                : e.pedidos?.length ? `Em corrida: ${e.pedidos.map((p: any) => p.codigo).join(', ')}` : 'Livre'}
              <br />
              Posição {tempoRelativo(e.localizacaoEm)}
            </>
          );
          return (
            <Marker key={`e-${e.id}`} position={[e.lat, e.lng]} icon={iconesMotoboy[e.id]} zIndexOffset={1000}>
              {onOffline ? (
                <Popup offset={[0, -18]} className="popup-motoboy" autoPanPadding={[24, 24]} closeOnClick={false}>
                  {info}
                  {e.online !== false && (
                    <span className="popup-offline">
                      <label className="chave-online" title="Deixar offline">
                        <input
                          type="checkbox"
                          checked
                          onChange={() => {
                            const msg = e.levando.length || e.pedidos?.length ? 'Tem pedido em andamento. Deixar offline?' : 'Deixar offline?';
                            if (window.confirm(msg)) onOffline(e);
                          }}
                        />
                        <span className="chave-trilho" aria-hidden="true" />
                        <span className="chave-texto">Online</span>
                      </label>
                    </span>
                  )}
                </Popup>
              ) : (
                <Tooltip direction="top">{info}</Tooltip>
              )}
            </Marker>
          );
        })}
      </MapContainer>
      <div className="mapa-legenda">
        <span><i className="ponto" style={{ background: '#8a93a1' }} /> Criado</span>
        <span><i className="ponto" style={{ background: '#d98a00' }} /> Pronto (sem motoboy)</span>
        <span><i className="ponto" style={{ background: '#7c5cc4' }} /> Atribuída / na loja</span>
        <span><i className="ponto" style={{ background: '#2a78d6' }} /> Em rota / no cliente</span>
        <span><i className="ponto" style={{ background: '#d03b3b' }} /> Atrasado</span>
        <span><i className="ponto" style={{ background: '#22c55e' }} /> Motoboy livre</span>
        <span>▣ Loja</span>
      </div>
    </div>
  );
}
