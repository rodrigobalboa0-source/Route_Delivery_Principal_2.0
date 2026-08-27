/**
 * Helpers de intervalo de datas cientes de fuso horário.
 *
 * As telas de relatório/filtro do RouteDelivery trabalham com datas do
 * calendário de São Paulo — o operador escolhe "27/08" pensando no dia local.
 * As colunas `created_at` / `updated_at` são `timestamptz` e o Postgres de
 * produção roda em UTC. Comparar contra uma string local sem offset
 * (ex.: "2026-08-27T00:00:00") faz o Postgres interpretá-la como UTC,
 * deslocando a janela em 3h e "perdendo" as últimas horas de cada dia.
 *
 * Estes helpers convertem a data local (America/Sao_Paulo) para o instante
 * UTC correto, SEM depender do fuso do navegador de quem usa o sistema
 * (toda a conversão é feita via `Intl` com `timeZone` explícito).
 */

export const APP_TIME_ZONE = 'America/Sao_Paulo';

/**
 * Offset do fuso `timeZone` no instante `date`, em minutos.
 * Ex.: para America/Sao_Paulo (UTC-3) retorna -180.
 */
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return (wallAsUtc - date.getTime()) / 60000;
}

/**
 * Instante UTC correspondente à meia-noite (00:00:00) do dia `ymd`
 * ("YYYY-MM-DD") no fuso do app.
 */
function startOfDayUtc(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  // 1ª aproximação: trata a parede local como se fosse UTC.
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  // Corrige pelo offset do fuso naquele instante...
  const offset = tzOffsetMinutes(guess, timeZone);
  let result = new Date(guess.getTime() - offset * 60000);
  // ...e refina se o offset na virada for diferente (transição de horário de verão).
  const offset2 = tzOffsetMinutes(result, timeZone);
  if (offset2 !== offset) {
    result = new Date(guess.getTime() - offset2 * 60000);
  }
  return result;
}

/** Soma `days` a uma data "YYYY-MM-DD" e devolve outra "YYYY-MM-DD" (aritmética em UTC). */
function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export interface UtcRange {
  /** início inclusivo — usar com `.gte('created_at', gte)` */
  gte: string;
  /** fim EXCLUSIVO (00:00 do dia seguinte) — usar com `.lt('created_at', lt)` */
  lt: string;
}

/**
 * Converte um intervalo do calendário local (ambas as datas inclusivas) no par
 * de instantes UTC para filtrar colunas `timestamptz`.
 *
 *   toUtcRange('2026-08-27', '2026-08-27')
 *     => { gte: '2026-08-27T03:00:00.000Z', lt: '2026-08-28T03:00:00.000Z' }
 *
 * O limite superior é EXCLUSIVO (00:00 do dia seguinte a `endYmd`): use
 * `.lt(...)` e NÃO `.lte(...)`. Assim o dia inteiro é coberto sem depender de
 * acertar o último milissegundo (`23:59:59` deixava de fora `23:59:59.xxx`).
 */
export function toUtcRange(startYmd: string, endYmd: string): UtcRange {
  return {
    gte: startOfDayUtc(startYmd, APP_TIME_ZONE).toISOString(),
    lt: startOfDayUtc(addDaysYmd(endYmd, 1), APP_TIME_ZONE).toISOString(),
  };
}

/** Atalho para filtrar um único dia. */
export function toUtcDayRange(ymd: string): UtcRange {
  return toUtcRange(ymd, ymd);
}

/** "YYYY-MM-DD" de uma `Date` qualquer, no fuso do app. */
export function ymdInAppTz(date: Date): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * "YYYY-MM-DD" de hoje no fuso do app.
 * Substitui `new Date().toISOString().split('T')[0]`, que depois das 21h
 * (horário local) já retornava a data de amanhã.
 */
export function todayYmd(): string {
  return ymdInAppTz(new Date());
}

/** "YYYY-MM-DD" do primeiro dia do mês atual no fuso do app. */
export function firstOfMonthYmd(): string {
  return `${todayYmd().slice(0, 8)}01`;
}
