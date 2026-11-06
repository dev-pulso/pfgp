// Local synthetic verification only. The reference checkout stays unchanged.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const integration = path.resolve(__dirname, '..');
const ts = require(path.join(integration, 'node_modules/typescript'));
if (!process.argv[2]) throw new Error('Pass the path to the unmodified Eklipse reference checkout (commit 7ab7479).');
const reference = path.resolve(process.argv[2]);
const patch = fs.readFileSync(path.join(integration, 'readers-and-module.patch'), 'utf8').replace(/\r\n/g, '\n');
const base = '8004/sln/apps/estadistico-pfgp/src/';
const read = relative => fs.readFileSync(path.join(reference, base, relative), 'utf8').replace(/\r\n/g, '\n');
function patched(relative) {
  const marker = `+++ b/${base}${relative}\n`;
  const start = patch.indexOf(marker);
  assert.notEqual(start, -1);
  const next = patch.indexOf('\n--- a/', start + marker.length);
  const diff = patch.slice(start + marker.length, next < 0 ? undefined : next).split('\n');
  const source = read(relative).split('\n');
  const output = [];
  let cursor = 0;
  for (const line of diff) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      const position = Number(hunk[1]) - 1;
      output.push(...source.slice(cursor, position));
      cursor = position;
    } else if (line.startsWith(' ') || line.startsWith('-')) {
      assert.equal(source[cursor++], line.slice(1), `Patch context: ${relative}`);
      if (line.startsWith(' ')) output.push(line.slice(1));
    } else if (line.startsWith('+')) output.push(line.slice(1));
  }
  output.push(...source.slice(cursor));
  return output.join('\n');
}
const groupByKey = (rows, key, name) => {
  const grouped = new Map();
  rows.forEach(row => {
    if (!grouped.has(row[key])) grouped.set(row[key], { key: row[key], name: row[name], rows: [] });
    grouped.get(row[key]).rows.push(row);
  });
  return [...grouped.values()];
};
const orderBy = (rows, key, direction) => [...rows].sort((a, b) => (a[key] - b[key]) * (direction === 'desc' ? -1 : 1));
const helper = require(path.join(integration, 'build/src/infrastructure/services/group-by-contract-detail'));
const codesHelper = require(path.join(integration, 'build/src/infrastructure/services/configured-contract-codes'));
class CheckPointContratoOrm {}
class ServicioIpsOrm {}
class DetalleContratoOrm {}
class IngresoOrm {}
class EstanciaOrm {}
const orm = { CheckPointContratoOrm, ServicioIpsOrm, DetalleContratoOrm };
function load(source, extra = {}) {
  const exports = {};
  const modules = {
    '@common/application/services': { groupByKey, getDiffInDays: () => 3 },
    '../../orm': orm,
    'lodash': { orderBy },
    '@sln/pfgp/application/constants': {
      generateFakeAgrupador: () => ({ id: 1, nombre: 'EVENTOS', peso: 1 }),
      CONTRATOS_PFGP: () => ['LEGACY'],
    },
    '../../services/group-by-contract-detail': helper,
    '../group-by-contract-detail': helper,
    '../configured-contract-codes': codesHelper,
    ...extra,
  };
  const compiled = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS, experimentalDecorators: true,
  } }).outputText;
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.ok(name in modules, `Unexpected module ${name}`);
    return modules[name];
  }, Date, Map, Set });
  return exports;
}
const checkpoints = () => [55, 56].map((id, index) => ({
  contratoId: id, codigoContrato: 'SAME', valor: (index + 1) * 1000,
  keyAgrupadorServicio: index + 2,
  agrupadores: [{ agrupadorId: (index + 1) * 4, limite: (index + 1) * 600, cantidadEventosContratados: 10 }],
}));
function invoices(distinctParents = false) {
  return [[55, 11, 2], [56, 13, 3], [56, 17, 5]].map(([id, entity, patient], index) => ({
    detalleContratoId: id,
    detalleContrato: { id, codigo: 'SAME', nombre: `Detalle ${id}`, contrato: {
      codigo: distinctParents ? `MASTER${id}` : 'MASTER', nombre: 'Padre sintético',
    } },
    valorFacturado: 0, valorRecuperado: 0,
    ingreso: {
      paciente: { id: 9, nombreCompleto: 'Persona sintética', setTypes() {} },
      fechaIngreso: new Date('2026-10-01T00:00:00Z'), consecutivo: index + 1,
      servicios: [], hojasProducto: [{ detalle: [{
        cantidad: 2, valorEntidad: entity, valorPaciente: patient, valorProducto: entity + patient,
        servicio: { servicioIps: { id: 501 } },
      }] }],
    },
  }));
}
const mappings = [2, 3].map((tipo, index) => ({
  tipo, servicioId: 501, agrupador: { id: (index + 1) * 4, nombre: `Grupo ${tipo}`, peso: tipo },
}));
const relativeFactory = 'infrastructure/factories/facturado/facturas-to-contratos.ts';
const original = load(read(relativeFactory));
assert.equal(original.FACTfacturasToContratos(invoices(), checkpoints(), mappings).length, 1, 'Negative control: original merges details under one parent');
assert.equal(original.FACTfacturasToContratos(invoices(true), checkpoints(), mappings)[1].totalFacturado, 26, 'Negative control: original discards second invoice of later contract');
const fact = load(patched(relativeFactory));
const factResults = fact.FACTaddDataToContratos(fact.FACTfacturasToContratos(invoices(), checkpoints(), mappings), checkpoints());
assert.deepEqual(JSON.parse(JSON.stringify(factResults.map(c => ({
  id: c.idContrato, codigo: c.codigoContrato, nombre: c.nombreContrato,
  total: c.totalFacturado, recuperado: c.totalRecuperado, presupuesto: c.totalContratado,
  grupo: c.agrupadores[0].id, servicios: c.agrupadores[0].iteracciones[0].servicios.length,
})))), [
  { id: 55, codigo: 'SAME', nombre: 'Detalle 55', total: 22, recuperado: 4, presupuesto: 1000, grupo: 4, servicios: 1 },
  { id: 56, codigo: 'SAME', nombre: 'Detalle 56', total: 60, recuperado: 16, presupuesto: 2000, grupo: 8, servicios: 2 },
]);
async function checkAcostado(withSnapshot) {
  const seen = [];
  let codeQueries = 0, checkpointQuery;
  const incomeRows = [55, 56].map(id => ({
    id, detalleContratoId: id, consecutivo: id,
    fechaIngreso: new Date('2026-10-01T00:00:00Z'), setTypes() {},
    paciente: { nombreCompleto: 'Persona sintética', documento: { numero: 'SINTETICO' }, setTypes() {} },
    ingresoPor: { getForHumans: () => 'Sintético' },
    estancias: [{ fechaIngreso: 1, cama: { codigo: 'S', nombre: 'Sintética', subgrupo: { nombre: 'Sintético' } } }],
  }));
  const acos = load(patched('infrastructure/services/acostado/fetch.impl.ts'), {
    '@nestjs/common': { Injectable: () => target => target },
    '@common/infrastructure/services': { BaseSource: class {} },
    '@sln/orm/adn': { IngresoOrm }, '@sln/orm/hpn': { EstanciaOrm },
    'typeorm': { In: value => value, IsNull: () => null },
    '../../factories': { GENEAutoCompleteServicios: (income, _fake, checkpoint) => {
      assert.equal(checkpoint.contratoId, income.detalleContratoId);
      seen.push(checkpoint.contratoId);
      income.servicios = [{ valorProducto: checkpoint.contratoId, cantidad: 1 }];
      return income;
    } },
  });
  const service = new acos.FetchAcostadoImpl();
  service.auth = { context: 'synthetic' };
  service.conn = {
    query: async () => { codeQueries++; return [{ codigo: 'SAME' }]; },
    getRepository: type => ({ find: async args => {
      if (type === DetalleContratoOrm) return [55, 56].map(id => ({ id, codigo: 'SAME', nombre: `Detalle ${id}` }));
      if (type === EstanciaOrm) return [55, 56].map(ingresoId => ({ ingresoId }));
      if (type === IngresoOrm) return incomeRows;
      if (type === CheckPointContratoOrm) { checkpointQuery = args; return checkpoints(); }
      throw new Error('Unexpected repository');
    } }),
  };
  const result = await service.execute(99, new Date('2026-10-01T00:00:00Z'), [], withSnapshot ? checkpoints() : undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(result.map(c => [c.idContrato, c.totalContratado, c.totalFacturado]))), [[55, 1000, 55], [56, 2000, 56]]);
  assert.deepEqual(seen, [55, 56]);
  assert.equal(codeQueries, withSnapshot ? 0 : 1);
  if (!withSnapshot) assert.deepEqual(JSON.parse(JSON.stringify(checkpointQuery.where.contratoId)), [55, 56]);
}
Promise.all([checkAcostado(true), checkAcostado(false)]).then(() => {
  console.log('PASS: real FACT source patched in memory separates details, budgets and recovery; later duplicate invoices preserved. Original-source negative controls reproduce both defects.');
  console.log('PASS: real ACOS source patched in memory matches checkpoints by detail ID, with or without supplied snapshot. No reference file or database changed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
