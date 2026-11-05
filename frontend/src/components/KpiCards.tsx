import {
  Activity,
  ArrowUpRight,
  Coins,
  Gauge,
  Pill,
  Wallet,
} from "lucide-react";
import type { Dashboard } from "../api/schema";
import { amount, count, percent, ratio } from "../lib/format";

export default function KpiCards({ data }: { data: Dashboard }) {
  const k = data.kpisGlobales;
  const burn =
    k.presupuestoTotalLimite != null && k.presupuestoTotalLimite > 0
      ? k.burnRateGlobal
      : null;
  const execution =
    k.presupuestoTotalLimite != null && k.presupuestoTotalLimite > 0
      ? k.ejecucionGlobalPct
      : null;
  return (
    <div className="kpi-grid">
      <article className="card kpi kpi-billing">
        <div className="kpi-label">
          <Wallet size={17} />
          <h3>Facturación del contrato</h3>
          <span className="unit">COP</span>
        </div>
        <strong className="kpi-value">
          {amount(k.totalFacturadoContrato)}
        </strong>
        <div className="billing-caption">
          <span>de {amount(k.presupuestoTotalLimite)} de límite</span>
          <b>{percent(execution)}</b>
        </div>
        <div className="meter" aria-hidden="true">
          <span
            style={{ width: `${Math.max(0, Math.min(100, execution ?? 0))}%` }}
          />
        </div>
        <span className="kpi-note">
          Proyección lineal a 30 días: {amount(k.proyeccionFacturacion30Dias)}
        </span>
      </article>
      <article className="card kpi">
        <div className="kpi-label">
          <Gauge size={17} />
          <h3>Burn rate</h3>
        </div>
        <strong className="kpi-value">{ratio(burn)}</strong>
        <span
          className={`badge ${burn == null ? "" : burn > 1 ? "danger" : "success"}`}
        >
          {burn == null ? (
            "Sin base de cálculo"
          ) : burn > 1 ? (
            <>
              <ArrowUpRight size={13} />
              Sobre el ritmo
            </>
          ) : (
            "Dentro del ritmo"
          )}
        </span>
        <span className="kpi-note">Ejecución / avance de referencia</span>
      </article>
      <article className="card kpi">
        <div className="kpi-label">
          <Pill size={17} />
          <h3>Presión de insumos</h3>
        </div>
        <strong className="kpi-value">
          {percent(k.indicePresionInsumosGlobalPct)}
        </strong>
        <span className="kpi-caption">del detalle de servicios</span>
        <span className="kpi-note">Código de origen: MEDICAMENTOS</span>
      </article>
      <article className="card kpi">
        <div className="kpi-label">
          <Coins size={17} />
          <h3>Recuperación / copagos</h3>
        </div>
        <strong className="kpi-value">
          {percent(k.totalFacturadoContrato ? k.tasaRecuperacionPct : null)}
        </strong>
        <span className="kpi-caption">
          {amount(k.totalRecuperadoCopagos)} reportados
        </span>
        <span className="kpi-note">Clasificación como copago por validar</span>
      </article>
      <article className="card kpi">
        <div className="kpi-label">
          <Activity size={17} />
          <h3>Gasto en EVENTOS</h3>
        </div>
        <strong className="kpi-value compact">
          {amount(data.auditoriaCalidadDatos.gastoHuerfanoAgrupadorEventos)}
        </strong>
        <span className="badge neutral">Asignación por revisar</span>
        <span className="kpi-note">
          {count(k.totalEpisodiosAtendidos)} registros de episodio en el corte
        </span>
      </article>
    </div>
  );
}
