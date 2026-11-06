import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { HttpException, ValidationPipe } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CrearContratoPfgpDto, validPositiveDecimal, MONEY_MAX, EVENTS_MAX } from '../src/application/dto/crear-contrato-pfgp.dto';
import { ContratosPfgpService } from '../src/infrastructure/services/contratos-pfgp.service';
import { configuredContractCodes } from '../src/infrastructure/services/configured-contract-codes';
import { groupByContractDetail } from '../src/infrastructure/services/group-by-contract-detail';

const originalAuthority = process.env.PFGP_CONTRACT_WRITE_AUTHORITY;
afterEach(() => {
  if (originalAuthority === undefined) delete process.env.PFGP_CONTRACT_WRITE_AUTHORITY;
  else process.env.PFGP_CONTRACT_WRITE_AUTHORITY = originalAuthority;
});
const input = (): CrearContratoPfgpDto => ({
  centroId: 99, contratoId: 55, valor: '1000.1234', fechaInicio: '2026-10-01', fechaFin: '2026-10-31',
  keyAgrupadorServicio: 2, agrupadores: [{ agrupadorId: 4, limite: '650.1250', cantidadEventosContratados: '8.33' }],
});
class Harness extends ContratosPfgpService {
  constructor(connection: DataSource, private allowed = true) { super(); this.conn = connection; }
  protected async hasAnyAuthority(): Promise<boolean> { return this.allowed; }
}
function fixture(options: { exists?: boolean; missing?: boolean; failChild?: boolean; mapped?: readonly number[] } = {}) {
  const calls: { sql: string; args: unknown[] }[] = [];
  let committed = false, rolledBack = false;
  const manager = { query: async (sql: string, args: unknown[] = []) => {
    calls.push({ sql, args });
    if (sql.includes('FROM GENDETCON WITH')) return options.missing ? [] : [{ id: 55, codigo: 'N055 ', nombre: 'Contrato sintético ' }];
    if (sql.includes('FROM EKSLNCHPTCONT WITH')) return options.exists ? [{ id: 8 }] : [];
    if (sql.includes('SELECT DISTINCT s.EKSLNAGRUPD')) return (options.mapped ?? [4]).map(agrupadorId => ({ agrupadorId }));
    if (sql.includes('INSERT INTO EKSLNCHPTCONT')) return [{ id: 88 }];
    if (sql.includes('INSERT INTO EKSLNAGRUCONT') && options.failChild) throw new Error('Synthetic child failure');
    return [];
  } } as unknown as EntityManager;
  const conn = { transaction: async (isolation: string, operation: (manager: EntityManager) => Promise<unknown>) => {
    assert.equal(isolation, 'SERIALIZABLE');
    try { const value = await operation(manager); committed = true; return value; }
    catch (error) { rolledBack = true; throw error; }
  } } as unknown as DataSource;
  process.env.PFGP_CONTRACT_WRITE_AUTHORITY = 'synthetic-write';
  return { service: new Harness(conn), conn, calls, state: () => ({ committed, rolledBack }) };
}
const errorCode = (code: string) => (error: unknown) => error instanceof HttpException &&
  (error.getResponse() as { code: string }).code === code;

test('decimal strings enforce SQL bounds without Number rounding', () => {
  for (const value of ['0', '-1', 'NaN', '1e3', '1,25', '01', '1.12345', '922337203685477.5808']) {
    assert.equal(validPositiveDecimal(value, 4, MONEY_MAX), false, value);
  }
  assert.equal(validPositiveDecimal(MONEY_MAX, 4, MONEY_MAX), true);
  assert.equal(validPositiveDecimal('0.0001', 4, MONEY_MAX), true);
  assert.equal(validPositiveDecimal(EVENTS_MAX, 2, EVENTS_MAX), true);
  assert.equal(validPositiveDecimal('0.01', 2, EVENTS_MAX), true);
});

test('creates only checkpoint and children, preserves decimals and accepts unequal budgets', async () => {
  const f = fixture();
  const result = await f.service.crear(input());
  assert.equal(result.configuracionId, 88);
  assert.equal(result.contratoId, 55);
  assert.equal(result.valor, '1000.1234');
  assert.equal(result.codigoContrato, 'N055');
  assert.deepEqual(f.calls.find(c => c.sql.includes('INSERT INTO EKSLNAGRUCONT'))?.args, [88, 4, '650.1250', '8.33']);
  assert.deepEqual(f.state(), { committed: true, rolledBack: false });
  assert.ok(f.calls[0].sql.includes('UPDLOCK, HOLDLOCK'));
  assert.ok(f.calls.every(c => !/INSERT INTO GEN(CONTRA|DETCON)/.test(c.sql)));
});

test('rejects previous checkpoint even with a disjoint range', async () => {
  const f = fixture({ exists: true });
  await assert.rejects(f.service.crear({ ...input(), fechaInicio: '2027-01-01', fechaFin: '2027-12-31' }), errorCode('CONTRACT_ALREADY_CONFIGURED'));
  assert.ok(!f.calls.some(c => c.sql.includes('INSERT')));
});

test('propagates child failure out of transaction (real SQL rollback requires staging)', async () => {
  const f = fixture({ failChild: true });
  await assert.rejects(f.service.crear(input()), /Synthetic child failure/);
  assert.deepEqual(f.state(), { committed: false, rolledBack: true });
});

test('checks missing contract and classification/group references before writing', async () => {
  for (const [options, code] of [
    [{ missing: true }, 'INVALID_CONTRACT_REFERENCE'],
    [{ mapped: [] }, 'INVALID_SERVICE_TYPE'],
    [{ mapped: [8] }, 'INVALID_GROUP_REFERENCE'],
  ] as const) {
    const f = fixture({ ...options, ...('mapped' in options ? { mapped: [...options.mapped] } : {}) });
    await assert.rejects(f.service.crear(input()), errorCode(code));
    assert.ok(!f.calls.some(c => c.sql.includes('INSERT')));
  }
});

test('rejects invalid center, calendar dates, repeated groups, EVENTOS and unknown input', async () => {
  const cases = [
    { ...input(), centroId: 0 }, { ...input(), fechaInicio: '2026-02-29' },
    { ...input(), fechaInicio: '1752-12-31' }, { ...input(), fechaInicio: '2027-01-01' },
    { ...input(), agrupadores: [input().agrupadores[0], input().agrupadores[0]] },
    { ...input(), agrupadores: [{ ...input().agrupadores[0], agrupadorId: 1 }] },
    { ...input(), userId: 99 }, { ...input(), valor: 1000 },
    { ...input(), agrupadores: [{ ...input().agrupadores[0], limite: '0' }] },
  ];
  for (const value of cases) {
    const f = fixture();
    await assert.rejects(f.service.crear(value as unknown as CrearContratoPfgpDto), errorCode('INVALID_CONTRACT_INPUT'));
    assert.equal(f.calls.length, 0);
  }
});

test('Nest ValidationPipe validates nested DTO instead of silently coercing values', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const metadata = { type: 'body' as const, metatype: CrearContratoPfgpDto };
  await assert.rejects(pipe.transform({ ...input(), agrupadores: [{ ...input().agrupadores[0], limite: 22 }] }, metadata));
  assert.equal((await pipe.transform(input(), metadata)).agrupadores[0].cantidadEventosContratados, '8.33');
});

test('registration disabled without write authority and denied without matching permission', async () => {
  const f = fixture();
  delete process.env.PFGP_CONTRACT_WRITE_AUTHORITY;
  await assert.rejects(f.service.crear(input()), errorCode('CONTRACT_REGISTRATION_UNAVAILABLE'));
  process.env.PFGP_CONTRACT_WRITE_AUTHORITY = 'synthetic-write';
  await assert.rejects(new Harness(f.conn, false).crear(input()), errorCode('CONTRACT_WRITE_FORBIDDEN'));
  assert.equal(f.calls.length, 0);
});

test('options include configured contracts without depending on activity and group types', async () => {
  process.env.PFGP_CONTRACT_WRITE_AUTHORITY = 'synthetic-write';
  const connection = { query: async (sql: string) => {
    if (sql.includes('FROM GENDETCON d')) return [{ id: 55, codigo: 'NEW ', nombre: 'Sintético ', configurado: 0 }, { id: 56, codigo: 'OLD', nombre: 'Existente', configurado: 1 }];
    if (sql.includes('SELECT OID AS id')) return [{ id: 4, nombre: 'Grupo ' }];
    return [{ tipo: 2, agrupadorId: 4 }];
  } } as unknown as DataSource;
  const response = await new Harness(connection).opciones(99);
  assert.equal(response.contratos[0].configurado, false);
  assert.equal(response.contratos[1].configurado, true);
  assert.deepEqual(response.tipos, [{ id: 2, agrupadorIds: [4] }]);
  await assert.rejects(new Harness(connection).opciones(0), errorCode('INVALID_CONTRACT_INPUT'));
});

test('reader helper preserves legacy codes and includes configured codes once', async () => {
  const connection = { query: async () => [{ codigo: 'NEW ' }, { codigo: 'OLD' }, { codigo: 'NEW' }] } as unknown as DataSource;
  assert.deepEqual(await configuredContractCodes(connection, ['OLD']), ['OLD', 'NEW']);
});

test('reader discovery uses the supplied checkpoint snapshot without another SQL query', async () => {
  const connection = { query: async () => { throw new Error('Must use the existing report snapshot'); } } as unknown as DataSource;
  assert.deepEqual(await configuredContractCodes(connection, ['OLD'], [
    { codigoContrato: 'NEW ' }, { codigoContrato: 'OLD' }, { codigoContrato: 'NEW' },
  ]), ['OLD', 'NEW']);
  assert.deepEqual(await configuredContractCodes(connection, ['OLD'], []), ['OLD']);
});

test('permission transport failure is unavailable before any SQL write', async () => {
  const f = fixture();
  class FailingAuthority extends Harness {
    protected async hasAnyAuthority(): Promise<boolean> { throw new Error('Synthetic transport failure'); }
  }
  await assert.rejects(new FailingAuthority(f.conn).crear(input()), errorCode('CONTRACT_REGISTRATION_UNAVAILABLE'));
  assert.equal(f.calls.length, 0);
});

test('reader grouping keeps distinct detail IDs apart even when codes and parent match', () => {
  const parent = { id: 7, codigo: 'MASTER' };
  const rows = [
    { detalleContratoId: 55, codigoContrato: 'SAME', nombreContrato: 'Detalle A', parent, importe: 10 },
    { detalleContratoId: 56, codigoContrato: 'SAME', nombreContrato: 'Detalle B', parent, importe: 20 },
    { detalleContratoId: 55, codigoContrato: 'SAME', nombreContrato: 'Detalle A', parent, importe: 30 },
  ];
  const grouped = groupByContractDetail(rows);
  assert.deepEqual(grouped.map(group => ({ key: group.key, name: group.name, total: group.rows.reduce((sum, row) => sum + row.importe, 0) })), [
    { key: 55, name: 'Detalle A', total: 40 },
    { key: 56, name: 'Detalle B', total: 20 },
  ]);
  assert.equal(grouped[0].rows[0], rows[0]);
  assert.equal(rows.length, 3);
  assert.deepEqual(groupByContractDetail([]), []);
});
