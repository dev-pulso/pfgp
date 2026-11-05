import { ArrowRight, Copy, FileWarning, ListChecks } from "lucide-react";
import type { Dashboard } from "../api/schema";
import { amount, count } from "../lib/format";

export default function AuditPanel({
  data,
  onReview,
}: {
  data: Dashboard;
  onReview: () => void;
}) {
  const a = data.auditoriaCalidadDatos;
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
