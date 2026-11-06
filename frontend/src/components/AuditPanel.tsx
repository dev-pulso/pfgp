import { ArrowRight, Copy, FileWarning, ListChecks } from "lucide-react";
import type { Dashboard } from "../api/schema";
import { amount, count, percent, residualAmount } from "../lib/format";

type Balance = Dashboard["conciliacionNiveles"]["contratoAgrupadores"];
const balanceValue = (value: number | null) =>
  value == null ? <abbr title="No disponible">N/D</abbr> : residualAmount(value);

function BalanceCells({ balance }: { balance: Balance }) {
  const label = balance.estado === "conciliado"
    ? "Conciliado"
    : balance.estado === "con_diferencia" ? "Con diferencia" : "No evaluable";
  return (
    <>
      <td className="money-cell">{balanceValue(balance.cabecera)}</td>
      <td className="money-cell">{balanceValue(balance.sumaComponentes)}</td>
      <td className={balance.estado === "con_diferencia" ? "money-cell integrity-warning" : "money-cell"}>{balanceValue(balance.diferencia)}</td>
      <td><span className={`badge ${balance.estado === "con_diferencia" ? "warning" : "neutral"}`}>{label}</span></td>
    </>
  );
}

export default function AuditPanel({
  data,
  onReview,
}: {
  data: Dashboard;
  onReview: () => void;
}) {
  const a = data.auditoriaCalidadDatos;
  const levels = data.conciliacionNiveles;
  const different = data.agrupadores.filter(
    (g) => g.discrepanciaConteoEventos !== 0,
  );
  const totalGap = different.reduce(
    (sum, g) => sum + Math.abs(g.discrepanciaConteoEventos),
    0,
  );
  const findings = [
    {
      icon: Copy,
      count: a.serviciosConIdDuplicado,
      title: "Servicios con ID repetido",
      value: amount(a.montoInfladoPorDuplicidad),
      detail:
        "Valor asociado a repeticiones. Confirmar si son duplicados antes de ajustar la facturación.",
    },
    {
      icon: FileWarning,
      count: a.serviciosFacturadosEnCero,
      title: "Servicios facturados en $ 0",
      value: amount(a.lucroCesantePorServiciosEnCero),
      detail:
        "Valor potencial según cantidad × valor unitario. No acredita lucro cesante ni cobro exigible.",
    },
    {
      icon: ListChecks,
      count: different.length,
      title: "Agrupadores con conteos distintos",
      value: `${count(totalGap)} de diferencia absoluta`,
      detail:
        "Compara iteraciones reportadas y registros JSON. Una diferencia no prueba eventos omitidos.",
    },
  ];
  return (
    <section id="auditoria" className="section-anchor">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CALIDAD DEL DATO</span>
          <h2>Alertas para una auditoría informada</h2>
        </div>
        <span className="section-meta">
          {count(a.totalServiciosAnalizados)} servicios analizados
        </span>
      </div>
      <div className="card level-reconciliation">
        <div className="level-reconciliation-heading">
          <div>
            <span className="eyebrow">CONTRATO, AGRUPADORES Y EPISODIOS</span>
            <h3>Conciliación entre niveles</h3>
            <p>Compara la facturación de cada cabecera con sus componentes. Diferencia = suma de componentes − cabecera; tolerancia $0,01.</p>
          </div>
          <div className="level-reconciliation-total">
            <span>Monto absoluto de diferencias por agrupador</span>
            <strong className={levels.agrupadoresConDiferencia ? "integrity-warning" : ""}>{balanceValue(levels.montoAbsolutoDiferenciasAgrupadores)}</strong>
          </div>
        </div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Conciliación del contrato">
          <table className="balance-table">
            <caption className="sr-only">Facturación del contrato frente a agrupadores y episodios. Importes en COP.</caption>
            <thead><tr><th scope="col">Relación</th><th scope="col">Cabecera COP</th><th scope="col">Suma de componentes COP</th><th scope="col">Diferencia COP</th><th scope="col">Estado</th></tr></thead>
            <tbody>
              <tr><th scope="row">Contrato → agrupadores</th><BalanceCells balance={levels.contratoAgrupadores} /></tr>
              <tr><th scope="row">Contrato → episodios</th><BalanceCells balance={levels.contratoEpisodios} /></tr>
            </tbody>
          </table>
        </div>
        <p className="level-reconciliation-counts">
          {count(levels.agrupadoresConciliados)} agrupadores conciliados · {count(levels.agrupadoresConDiferencia)} con diferencia · {count(levels.agrupadoresNoEvaluables)} no evaluables.
          Las diferencias positivas y negativas se evalúan por separado; no se compensan.
        </p>
        <details className="disclosure">
          <summary>Ver conciliación monetaria por agrupador</summary>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Conciliación monetaria por agrupador">
            <table className="balance-table">
              <caption className="sr-only">Cabecera de cada agrupador frente a la suma de cabeceras de sus episodios. Importes en COP.</caption>
              <thead><tr><th scope="col">Agrupador</th><th scope="col">Episodios</th><th scope="col">Cabecera COP</th><th scope="col">Suma de episodios COP</th><th scope="col">Diferencia COP</th><th scope="col">Estado</th></tr></thead>
              <tbody>
                {levels.agrupadores.map((group) => (
                  <tr key={group.idAgrupador}>
                    <th scope="row">{group.nombre || "Sin nombre reportado"}</th>
                    <td>{count(group.cantidadEpisodios)}</td>
                    <BalanceCells balance={group} />
                  </tr>
                ))}
                {!levels.agrupadores.length && <tr><td colSpan={6}>Sin agrupadores reportados para evaluar.</td></tr>}
              </tbody>
            </table>
          </div>
        </details>
        <p className="level-reconciliation-method">N/D indica un importe no disponible. La conciliación del contrato no sustituye la revisión de cada agrupador ni la comparación de episodios con servicios.</p>
      </div>
      <div className="card reconciliation-summary">
        <div>
          <span className="eyebrow">CONCILIACIÓN EPISODIO → SERVICIOS</span>
          <h3>{percent(data.conciliacion.porcentajeConciliadoPct)} de episodios evaluables conciliados</h3>
          <p>{count(data.conciliacion.episodiosConciliados)} conciliados de {count(data.conciliacion.episodiosEvaluables)} evaluables · {count(data.conciliacion.episodiosNoEvaluables)} no evaluables.</p>
        </div>
        <div>
          <strong className={data.conciliacion.episodiosConDiferencia ? "integrity-warning" : ""}>{residualAmount(data.conciliacion.montoAbsolutoSinExplicar)}</strong>
          <p>Monto absoluto sin explicar en {count(data.conciliacion.episodiosConDiferencia)} episodios.</p>
        </div>
        <p className="reconciliation-method">Detalle − facturado − recuperado. Tolerancia: $0,01. La recuperación explica diferencias de base; no acredita recaudo efectivo.</p>
      </div>
      <div className="audit-grid">
        {findings.map(({ icon: Icon, ...f }) => (
          <article
            className={`card audit-card ${f.count > 0 ? "has-findings" : ""}`}
            key={f.title}
          >
            <div className="audit-top">
              <span className="audit-icon">
                <Icon size={19} />
              </span>
              <span className={`badge ${f.count > 0 ? "warning" : "success"}`}>
                {f.count > 0
                  ? `${count(f.count)} por revisar`
                  : "Sin hallazgos"}
              </span>
            </div>
            <h3>{f.title}</h3>
            <strong className="audit-value">{f.value}</strong>
            <p>{f.detail}</p>
          </article>
        ))}
      </div>
      <div className="audit-bottom">
        <span>
          {count(a.agrupadoresConCaracteresSucios)} nombres de agrupador con
          saltos de línea detectados en origen.
        </span>
        <button className="text-button" onClick={onReview}>
          Revisar episodios <ArrowRight size={15} />
        </button>
      </div>
      {different.length > 0 && (
        <details className="disclosure">
          <summary>Ver conciliación de conteos por agrupador</summary>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Conciliación de conteos"
          >
            <table>
              <thead>
                <tr>
                  <th>Agrupador</th>
                  <th>Reportado API</th>
                  <th>Registros JSON</th>
                  <th>Diferencia con signo</th>
                </tr>
              </thead>
              <tbody>
                {different.map((g) => (
                  <tr key={g.idAgrupador}>
                    <td>{g.nombre}</td>
                    <td>{count(g.iteracionesReportadasAPI)}</td>
                    <td>{count(g.iteracionesRealesJSON)}</td>
                    <td>{count(g.discrepanciaConteoEventos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
