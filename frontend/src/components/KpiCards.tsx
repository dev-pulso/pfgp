import { Activity, Coins, Gauge, Layers, Pill, Wallet } from "lucide-react";
import type { Dashboard, TemporalBasis } from "../api/schema";
import { amount, count, percent } from "../lib/format";

export default function KpiCards({ data, basis }: { data: Dashboard; basis: TemporalBasis }) {
  const k = data.kpisGlobales;
  const f = data.resumenFinanciero;
  const e = data.exposicion;
  const reference = data.referenciasTemporales[basis];
  return (
    <>
      <div className="kpi-grid executive-kpis">
        <article className="card kpi kpi-billing">
          <div className="kpi-label"><Wallet size={17} /><h3>Facturación del contrato</h3><span className="unit">COP</span></div>
          <strong className="kpi-value">{amount(k.totalFacturadoContrato)}</strong>
          <div className="billing-caption"><span>Registros de la respuesta consultada</span></div>
          <span className="kpi-note">{count(k.totalEpisodiosAtendidos)} registros de episodio · {count(data.auditoriaCalidadDatos.totalServiciosAnalizados)} servicios</span>
        </article>
        <article className="card kpi">
          <div className="kpi-label"><Wallet size={17} /><h3>Presupuesto reportado</h3></div>
          <strong className="kpi-value compact">{amount(f.presupuestoContractualReportado)}</strong>
          <span className="kpi-caption">Total contratado del origen</span>
          <span className="kpi-note">Periodicidad pendiente de confirmar</span>
        </article>
        <article className="card kpi">
          <div className="kpi-label"><Gauge size={17} /><h3>Ejecución contractual</h3></div>
          <strong className="kpi-value">{percent(f.ejecucionContractualPct)}</strong>
          <span className={`badge ${f.ejecucionContractualPct == null ? "neutral" : f.ejecucionContractualPct > 100 ? "danger" : "neutral"}`}>
            {f.ejecucionContractualPct == null ? "Sin base de cálculo" : f.ejecucionContractualPct > 100 ? "Supera el presupuesto reportado" : "Base: presupuesto reportado"}
          </span>
          <span className="kpi-note">Facturado / total contratado</span>
        </article>
        <article className="card kpi">
          <div className="kpi-label"><Layers size={17} /><h3>Valor en acostado</h3></div>
          <strong className="kpi-value compact">{amount(e.totalAcostado)}</strong>
          <span className="kpi-caption">{count(e.registrosAcostado)} registros reportados</span>
          <span className="kpi-note">Componente de la misma consulta</span>
        </article>
        <article className="card kpi">
          <div className="kpi-label"><Wallet size={17} /><h3>Disponibilidad combinada</h3></div>
          <strong className={`kpi-value compact ${e.disponibilidadCalculada != null && e.disponibilidadCalculada < 0 ? "integrity-warning" : ""}`}>{amount(e.disponibilidadCalculada)}</strong>
          <span className="kpi-caption">Ejecución combinada: {percent(e.ejecucionCombinadaPct)}</span>
          <span className="kpi-note">Presupuesto − facturado − acostado</span>
        </article>
      </div>
      <div className="card financial-context">
        <div>
          <h3>Facturación normalizada · {basis === "dias30" ? "30 días" : "mes calendario"}</h3>
          <strong>{amount(reference?.facturacionNormalizada ?? null)}</strong>
          <p>{reference ? `Facturado / ${count(data.metadata.diasCorteAnalizados)} días consultados × ${count(reference.diasReferencia)} días de referencia.` : data.referenciasTemporales.motivoCalendario}</p>
          <p>Referencia lineal; no acredita déficit mensual ni cierre contractual.</p>
        </div>
        <div>
          <h3>Presupuestos diferenciados</h3>
          <dl className="financial-facts">
            <div><dt>Suma de límites de agrupadores</dt><dd>{amount(f.sumaLimitesAgrupadores)}</dd></div>
            <div><dt>Representación del presupuesto</dt><dd>{percent(f.coberturaLimitesPct)}</dd></div>
            <div><dt>Presupuesto reportado − límites</dt><dd>{amount(f.diferenciaPresupuestos)}</dd></div>
          </dl>
          <p>La diferencia entre bases no representa dinero perdido.</p>
        </div>
        <div>
          <h3>Exposición de la consulta</h3>
          <dl className="financial-facts">
            <div><dt>Facturado + acostado</dt><dd>{amount(e.totalCombinado)}</dd></div>
            <div><dt>Disponibilidad reportada</dt><dd>{amount(e.disponibilidadReportada)}</dd></div>
            <div><dt>Calculada − reportada</dt><dd>{amount(e.diferenciaDisponibilidad)}</dd></div>
          </dl>
          <p>{e.estado === "solapamiento" ? `${count(e.ingresosCompartidos)} ingresos aparecen en ambos componentes. La suma queda pendiente de conciliación.` : e.estado === "no_disponible" ? "No hay información suficiente para sumar ambos componentes." : "Se asume que facturado y acostado corresponden al mismo corte por llegar en una consulta. El corte histórico del origen está pendiente de confirmar."}</p>
        </div>
      </div>
      <div className="complementary-kpis">
        <article className="card kpi"><div className="kpi-label"><Coins size={17} /><h3>Recuperación reportada</h3></div><strong>{amount(k.totalRecuperadoCopagos)}</strong><span className="kpi-note">{percent(k.totalFacturadoContrato ? k.tasaRecuperacionPct : null)} del facturado. No acredita recaudo efectivo.</span></article>
        <article className="card kpi"><div className="kpi-label"><Pill size={17} /><h3>Presión de insumos</h3></div><strong>{percent(k.indicePresionInsumosGlobalPct)}</strong><span className="kpi-note">Sobre el detalle bruto de servicios. Código MEDICAMENTOS.</span></article>
        <article className="card kpi"><div className="kpi-label"><Activity size={17} /><h3>Participación de EVENTOS</h3></div><strong>{amount(data.auditoriaCalidadDatos.gastoHuerfanoAgrupadorEventos)}</strong><span className="kpi-note">{percent(f.participacionEventosPct)} de la facturación del contrato. Agrupador 1.</span></article>
      </div>
    </>
  );
}
