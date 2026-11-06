import { useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  RefreshCw,
  Search,
} from "lucide-react";
import type { Contracts } from "../api/schema";
import { amount, count, percent, receivedAtBogota, shortDate } from "../lib/format";

export default function ContractsPanel({
  catalog,
  onSelect,
  onRefresh,
  refreshing,
}: {
  catalog: Contracts;
  onSelect: (id: number) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [order, setOrder] = useState("nombre");
  const rows = useMemo(() => {
    const normalize = (s: string) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const query = normalize(search.trim());
    return catalog.contratos
      .filter((c) =>
        normalize(
          `${c.idContrato} ${c.codigoContrato} ${c.nombreContrato}`,
        ).includes(query),
      )
      .sort((a, b) => {
        if (order === "facturado") {
          if (a.totalFacturadoContrato == null)
            return b.totalFacturadoContrato == null ? 0 : 1;
          if (b.totalFacturadoContrato == null) return -1;
          return b.totalFacturadoContrato - a.totalFacturadoContrato;
        }
        return (
          order === "codigo" ? a.codigoContrato : a.nombreContrato
        ).localeCompare(
          order === "codigo" ? b.codigoContrato : b.nombreContrato,
          "es",
          { numeric: true },
        );
      });
  }, [catalog.contratos, search, order]);
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  const current = Math.min(page, pages);
  return (
    <div className="contracts-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CENTRO 99 · CATÁLOGO DE CONTRATOS</span>
          <h2>{count(catalog.totalContratos)} contratos disponibles</h2>
        </div>
        <button
          className="text-button"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw size={14} className={refreshing ? "spinning" : ""} />
          {refreshing ? "Actualizando listado…" : "Actualizar listado"}
        </button>
      </div>
      <div className="query-provenance">
        <dl>
          <div><dt>Rango solicitado</dt><dd>{shortDate(catalog.inicio)} — {shortDate(catalog.final)}</dd></div>
          <div><dt>Consulta recibida</dt><dd><time dateTime={catalog.consultaRecibidaEn}>{receivedAtBogota(catalog.consultaRecibidaEn)}</time></dd></div>
          <div><dt>Centro</dt><dd>{catalog.centroId}</dd></div>
        </dl>
        <p>Las fechas de actualización y corte histórico del origen están pendientes de confirmar.</p>
      </div>
      <div className="card episodes-card">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              type="search"
              aria-label="Buscar contrato por nombre, código o ID"
              placeholder="Buscar nombre, código o ID…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="catalog-order">
            Ordenar por
            <select
              value={order}
              onChange={(e) => {
                setOrder(e.target.value);
                setPage(1);
              }}
            >
              <option value="nombre">Nombre</option>
              <option value="codigo">Código</option>
              <option value="facturado">Mayor facturación</option>
            </select>
          </label>
          <span className="section-meta" role="status">
            {count(rows.length)} resultados
          </span>
        </div>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Lista de contratos, desplazable horizontalmente"
        >
          <table className="contracts-table">
            <caption className="sr-only">
              Todos los contratos devueltos para el período, con un botón para
              abrir cada informe.
            </caption>
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Facturado  </th>
                <th>Presupuesto reportado  </th>
                <th>Ejecución contractual</th>
                <th>Agrupadores</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice((current - 1) * 8, current * 8).map((c) => (
                <tr key={c.idContrato}>
                  <td>
                    <strong>
                      {c.nombreContrato || "Contrato sin nombre reportado"}
                    </strong>
                    <span className="cell-secondary">
                      {c.codigoContrato || "Sin código"} · ID {c.idContrato}
                    </span>
                  </td>
                  <td className="money-cell">
                    <span className="catalog-mobile-label">
                      Facturado
                    </span>
                    {amount(c.totalFacturadoContrato)}
                  </td>
                  <td>
                    <span className="catalog-mobile-label">
                      Presupuesto reportado
                    </span>
                    {amount(c.resumenFinanciero.presupuestoContractualReportado)}
                    <span className="cell-secondary">Límites: {amount(c.presupuestoTotalLimite)}</span>
                  </td>
                  <td>
                    <span className="catalog-mobile-label">Ejecución contractual</span>
                    {percent(c.resumenFinanciero.ejecucionContractualPct)}
                  </td>
                  <td>
                    <span className="catalog-mobile-label">Agrupadores</span>
                    {count(c.cantidadAgrupadores)}
                  </td>
                  <td>
                    <button
                      className="button secondary contract-open"
                      disabled={refreshing}
                      aria-label={`Ver contrato ${c.codigoContrato || c.idContrato}`}
                      onClick={() => onSelect(c.idContrato)}
                    >
                      Ver contrato
                      <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="inline-empty">
            <FileSearch size={25} />
            <h3>
              {catalog.totalContratos
                ? "No hay contratos que coincidan"
                : "No hay contratos en este período"}
            </h3>
            <p>
              {catalog.totalContratos
                ? "Prueba otro nombre, código o ID."
                : "Selecciona otro rango de fechas y vuelve a consultar."}
            </p>
          </div>
        )}
        <div className="table-footer">
          <span>
            {rows.length
              ? `${(current - 1) * 8 + 1}–${Math.min(current * 8, rows.length)}`
              : "0"}{" "}
            de {count(rows.length)} contratos
          </span>
          <div className="pagination">
            <button
              className="icon-button"
              aria-label="Página anterior de contratos"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Página {current} de {pages}
            </span>
            <button
              className="icon-button"
              aria-label="Página siguiente de contratos"
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
      <p className="footnote">
        Selecciona Ver contrato para consultar sus indicadores, auditoría y
        episodios. El detalle consulta nuevamente el origen y puede reflejar
        cambios posteriores al listado.
      </p>
    </div>
  );
}
