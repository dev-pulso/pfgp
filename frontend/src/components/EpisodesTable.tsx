import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Episode } from "../api/schema";
import { filterEpisodes } from "../lib/analytics";
import { amount, count, ratio } from "../lib/format";

type Sort = "totalFacturadoCabecera" | "diasEstancia" | "ratioSeveridadCME";
export default function EpisodesTable({
  episodes,
  onSelect,
  reviewToken,
}: {
  episodes: Episode[];
  onSelect: (episode: Episode) => void;
  reviewToken: number;
}) {
  const [search, setSearch] = useState("");
  const [alerts, setAlerts] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>("totalFacturadoCabecera");
  const [ascending, setAscending] = useState(false);
  useEffect(() => {
    if (reviewToken) {
      setAlerts(true);
      setPage(1);
    }
  }, [reviewToken]);
  const rows = useMemo(
    () =>
      filterEpisodes(episodes, search, alerts).sort((a, b) => {
        const av = a[sort],
          bv = b[sort];
        if (av == null) return bv == null ? 0 : 1;
        if (bv == null) return -1;
        return (av - bv) * (ascending ? 1 : -1);
      }),
    [episodes, search, alerts, sort, ascending],
  );
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  const activePage = Math.min(page, pages);
  function changeSort(key: Sort) {
    setSort(key);
    setAscending(sort === key ? !ascending : false);
    setPage(1);
  }
  const sortHeader = (key: Sort, text: string) => (
    <th
      aria-sort={
        sort === key ? (ascending ? "ascending" : "descending") : "none"
      }
    >
      <button onClick={() => changeSort(key)}>
        {text}
        <ArrowDownUp size={13} />
      </button>
    </th>
  );
  return (
    <section id="episodios" className="section-anchor">
      <div className="section-heading">
        <div>
          <span className="eyebrow">TRAZABILIDAD DEL CORTE</span>
          <h2>Del contrato al episodio</h2>
        </div>
        <span className="privacy-label">
          <ShieldCheck size={15} />
          Identidades protegidas
        </span>
      </div>
      <div className="card episodes-card">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              type="search"
              aria-label="Buscar episodio o agrupador"
              placeholder="Buscar alias o agrupador…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={alerts}
              onChange={(e) => {
                setAlerts(e.target.checked);
                setPage(1);
              }}
            />
            Solo con alertas
          </label>
          <span className="section-meta" aria-live="polite">
            {count(rows.length)} registros
          </span>
        </div>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Tabla de episodios, desplazable horizontalmente"
        >
          <table className="episode-table">
            <caption className="sr-only">
              Episodios del informe con alias temporal; seleccione Ver detalle
              para consultar sus métricas.
            </caption>
            <thead>
              <tr>
                <th>Episodio / agrupador</th>
                {sortHeader("diasEstancia", "Estancia")}
                {sortHeader("totalFacturadoCabecera", "Facturado (COP)")}
                <th>Integridad (COP)</th>
                {sortHeader("ratioSeveridadCME", "Facturado / CME")}
                <th>
                  <span className="sr-only">Detalle</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice((activePage - 1) * 8, activePage * 8).map((e) => (
                <tr key={e.consecutivoIngreso}>
                  <td>
                    <button
                      className="text-button episode-open"
                      onClick={() => onSelect(e)}
                      aria-haspopup="dialog"
                      aria-label={`Abrir servicios de ${e.paciente}`}
                    >
                      {e.paciente}
                    </button>
                    <span className="cell-secondary">{e.agrupador}</span>
                  </td>
                  <td>
                    {count(e.diasEstancia)} <span className="muted">días</span>
                  </td>
                  <td className="money-cell">
                    {amount(e.totalFacturadoCabecera)}
                  </td>
                  <td>
                    <span
                      className={
                        e.discrepanciaIntegridad ? "integrity-warning" : ""
                      }
                    >
                      {amount(e.discrepanciaIntegridad)}
                    </span>
                    <span className="cell-secondary">
                      {e.discrepanciaIntegridad == null
                        ? "Sin dato"
                        : e.discrepanciaIntegridad === 0
                          ? "Coincide"
                          : e.discrepanciaIntegridad > 0
                            ? "Detalle mayor"
                            : "Cabecera mayor"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${e.ratioSeveridadCME != null && e.ratioSeveridadCME > 1.5 ? "danger" : "neutral"}`}
                    >
                      {ratio(e.ratioSeveridadCME)}
                      {e.ratioSeveridadCME != null && e.ratioSeveridadCME > 1.5
                        ? " · Alto"
                        : ""}
                    </span>
                  </td>
                  <td>
                    <button
                      className="row-action"
                      aria-label={`Ver detalle de ${e.paciente}`}
                      aria-haspopup="dialog"
                      onClick={() => onSelect(e)}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="inline-empty">
            <Search size={24} />
            <h3>No hay episodios que coincidan</h3>
            <p>
              Prueba otro alias o agrupador, o desactiva el filtro de alertas.
            </p>
          </div>
        )}
        <div className="table-footer">
          <span>
            {rows.length
              ? `${(activePage - 1) * 8 + 1}–${Math.min(activePage * 8, rows.length)}`
              : "0"}{" "}
            de {count(rows.length)} registros
          </span>
          <div className="pagination">
            <button
              className="icon-button"
              aria-label="Página anterior"
              disabled={activePage <= 1}
              onClick={() => setPage(activePage - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Página {activePage} de {pages}
            </span>
            <button
              className="icon-button"
              aria-label="Página siguiente"
              disabled={activePage >= pages}
              onClick={() => setPage(activePage + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
      <p className="footnote">
        Los alias solo identifican filas dentro de esta consulta; no representan
        personas únicas ni permiten seguirlas entre cortes.
      </p>
    </section>
  );
}
