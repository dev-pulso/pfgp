import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Pill,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  X,
} from "lucide-react";
import { DashboardError, fetchPatientDrillDown } from "../api/dashboard";
import { amount, count, ratio, residualAmount } from "../lib/format";

interface DrillDownProps {
  consecutivoIngreso: number | null;
  onClose: () => void;
  fechaInicio: string;
  fechaFinal: string;
  centroId: number;
  idContrato: number;
  revision: string;
}

const filters = [
  { id: "TODOS", label: "Todos", icon: Layers },
  { id: "CUPS", label: "CUPS", icon: Stethoscope },
  { id: "MEDS", label: "Medicamentos / Insumos", icon: Pill },
  { id: "ALERTAS", label: "Con alertas", icon: AlertCircle },
] as const;
const pageSize = 20;

export function PatientDrillDownModal({
  consecutivoIngreso,
  onClose,
  fechaInicio,
  fechaFinal,
  centroId,
  idContrato,
  revision,
}: DrillDownProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [filterType, setFilterType] = useState<typeof filters[number]["id"]>("TODOS");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const request = {
    inicio: fechaInicio,
    final: fechaFinal,
    centroId,
    idContrato,
    consecutivoIngreso: consecutivoIngreso!,
    revision,
  };
  const query = useQuery({
    queryKey: ["pfgp-episode", request],
    queryFn: ({ signal }) => fetchPatientDrillDown(request, signal),
    enabled: consecutivoIngreso !== null,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (consecutivoIngreso === null) return;
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [consecutivoIngreso]);

  if (consecutivoIngreso === null) return null;

  const data = query.isError || query.isFetching ? undefined : query.data;
  const episode = data?.episodio;
  const term = searchTerm.trim().toLocaleLowerCase("es");
  const services = data?.servicios.filter((service) => {
    const matches = `${service.nombre} ${service.codigo} ${service.id}`
      .toLocaleLowerCase("es").includes(term);
    if (!matches) return false;
    if (filterType === "CUPS") return service.tipo === "PROCEDIMIENTO/CUPS";
    if (filterType === "MEDS") return service.tipo === "INSUMO/MEDICAMENTO";
    if (filterType === "ALERTAS") return service.es_duplicado || service.es_cero;
    return true;
  }) ?? [];
  const pages = Math.max(1, Math.ceil(services.length / pageSize));
  const activePage = Math.min(page, pages);
  const alias = `Episodio ${String(consecutivoIngreso).padStart(4, "0")}`;

  return (
    <dialog
      ref={dialog}
      className="episode-dialog drilldown-dialog"
      aria-labelledby="drilldown-title"
      aria-describedby="drilldown-privacy"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        const target = event.shiftKey && document.activeElement === first
          ? last
          : !event.shiftKey && document.activeElement === last ? first : null;
        if (target) {
          event.preventDefault();
          target.focus();
        }
      }}
    >
      <div className="drilldown-shell">
        <header className="dialog-head drilldown-header">
          <div>
            <span className="eyebrow">TRAZABILIDAD DE SERVICIOS · CONTRATO {idContrato}</span>
            <h2 id="drilldown-title">{episode?.paciente ?? alias}</h2>
            <p>{episode?.agrupador ?? "Detalle del corte seleccionado"}</p>
          </div>
          <button className="icon-button" aria-label="Cerrar detalle" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <p className="drilldown-privacy" id="drilldown-privacy">
          <ShieldCheck size={16} aria-hidden="true" />
          Alias temporal de este informe. Identidad y fecha de ingreso suprimidas.
        </p>

        <div className="drilldown-body" aria-busy={query.isFetching}>
          {query.isFetching && (
            <div className="drilldown-state" role="status">
              <RefreshCw className="spinning" size={25} aria-hidden="true" />
              <h3>Cargando trazabilidad…</h3>
              <p>Consultando y auditando los servicios de este episodio.</p>
            </div>
          )}
          {query.isError && (
            <div className="drilldown-state" role="alert">
              <TriangleAlert size={27} aria-hidden="true" />
              <h3>No pudimos abrir los servicios</h3>
              <p>{query.error instanceof DashboardError
                ? query.error.message
                : "Ocurrió un error al consultar el detalle. Vuelve a intentarlo."}</p>
              {query.error instanceof DashboardError && query.error.kind === "stale" ? (
                <button className="button secondary" onClick={onClose}>Cerrar y revisar corte</button>
              ) : (
                <button className="button secondary" onClick={() => { void query.refetch(); }}>
                  <RefreshCw size={15} aria-hidden="true" /> Reintentar detalle
                </button>
              )}
            </div>
          )}

          {data && episode && (
            <>
              <dl className="drilldown-metrics">
                <div>
                  <dt>Facturación de cabecera</dt>
                  <dd>{amount(episode.totalFacturadoCabecera)}</dd>
                  <dd className="drilldown-caption">
                    {count(episode.diasEstancia)} {episode.diasEstancia === 1 ? "día" : "días"} de estancia
                  </dd>
                </div>
                <div>
                  <dt>CME contratado</dt>
                  <dd>{amount(episode.cmeContratado)}</dd>
                  <dd className="drilldown-caption">Facturado / CME: <strong>{ratio(episode.ratioSeveridadCME)}</strong></dd>
                </div>
                <div>
                  <dt>Servicios con ID repetido</dt>
                  <dd className={data.auditoriaEpisodio.serviciosDuplicados ? "integrity-warning" : ""}>
                    {count(data.auditoriaEpisodio.serviciosDuplicados)} {data.auditoriaEpisodio.serviciosDuplicados === 1 ? "ítem" : "ítems"}
                  </dd>
                  <dd className="drilldown-caption">Monto: {amount(data.auditoriaEpisodio.montoDuplicado)}</dd>
                </div>
                <div>
                  <dt>Diferencia residual</dt>
                  <dd className={episode.discrepanciaResidual != null && Math.abs(episode.discrepanciaResidual) > 0.01 ? "integrity-warning" : ""}>
                    {episode.discrepanciaResidual != null && Math.abs(episode.discrepanciaResidual) <= 0.01 ? "Conciliado" : residualAmount(episode.discrepanciaResidual)}
                  </dd>
                  <dd className="drilldown-caption">Detalle − facturado − recuperado; tolerancia $0,01.</dd>
                </div>
                <div>
                  <dt>Total bruto de servicios</dt>
                  <dd>{amount(episode.sumaServiciosDetalle)}</dd>
                  <dd className="drilldown-caption">Diferencia bruta con cabecera: {amount(episode.discrepanciaIntegridad)}</dd>
                </div>
                <div>
                  <dt>Recuperación reportada</dt>
                  <dd>{amount(episode.totalRecuperado)}</dd>
                  <dd className="drilldown-caption">No acredita recaudo efectivo.</dd>
                </div>
                <div>
                  <dt>Porción entidad del detalle</dt>
                  <dd>{amount(episode.importeEntidadServicios)}</dd>
                  <dd className="drilldown-caption">Suma de cantidad × valor entidad.</dd>
                </div>
                <div>
                  <dt>Porción paciente del detalle</dt>
                  <dd>{amount(episode.importePacienteServicios)}</dd>
                  <dd className="drilldown-caption">Suma de cantidad × valor paciente.</dd>
                </div>
              </dl>

              {data.auditoriaEpisodio.serviciosDuplicados > 0 && (
                <div className="drilldown-finding">
                  <TriangleAlert size={19} aria-hidden="true" />
                  <p>
                    <strong>Hallazgo de integridad:</strong>{" "}
                    {data.auditoriaEpisodio.serviciosDuplicados === 1
                      ? "Un registro repite un ID de servicio dentro de este episodio."
                      : `${count(data.auditoriaEpisodio.serviciosDuplicados)} registros repiten un ID de servicio dentro de este episodio.`}{" "}
                    Los importes se muestran sin descontar repeticiones.
                  </p>
                </div>
              )}

              <div className="drilldown-toolbar">
                <div className="drilldown-filters" role="group" aria-label="Filtrar servicios por tipo o alerta">
                  {filters.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      aria-pressed={filterType === id}
                      onClick={() => { setFilterType(id); setPage(1); }}
                    >
                      <Icon size={15} aria-hidden="true" />
                      {label}{id === "TODOS" ? ` (${count(data.servicios.length)})` : ""}
                    </button>
                  ))}
                </div>
                <label className="search-field">
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Buscar servicio por nombre, código o ID"
                    placeholder="Buscar servicio, código o ID…"
                    value={searchTerm}
                    onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }}
                  />
                </label>
              </div>

              <div
                className="table-scroll drilldown-table-scroll"
                role="region"
                tabIndex={0}
                aria-label="Servicios auditados, tabla desplazable"
              >
                <table className="drilldown-table">
                  <caption className="sr-only">Servicios de {alias}. Importes en COP. Los ID repetidos y valores cero se indican en Auditoría.</caption>
                  <thead>
                    <tr>
                      <th scope="col">ID / Código</th>
                      <th scope="col">Descripción del servicio</th>
                      <th scope="col">Cantidad</th>
                      <th scope="col">Tarifa  </th>
                      <th scope="col">Entidad  </th>
                      <th scope="col">Paciente  </th>
                      <th scope="col">Total bruto  </th>
                      <th scope="col">Auditoría</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.slice((activePage - 1) * pageSize, activePage * pageSize).map((service, index) => (
                      <tr key={`${service.id}-${index}`} className={service.es_duplicado || service.es_cero ? "drilldown-flagged" : ""}>
                        <td>
                          <strong>{service.codigo || "Sin código"}</strong>
                          <span className="cell-secondary">ID: {service.id || "Sin ID"}</span>
                        </td>
                        <td>
                          {service.nombre || "Sin descripción"}
                          <span className="cell-secondary">{service.tipo}</span>
                        </td>
                        <td>{count(service.cantidad)}</td>
                        <td className="money-cell">{amount(service.valorProducto)}</td>
                        <td className="money-cell">{amount(service.importeEntidad)}</td>
                        <td className="money-cell">{amount(service.importePaciente)}</td>
                        <td className="money-cell">{amount(service.valorTotal)}</td>
                        <td>
                          <div className="drilldown-badges">
                            {service.es_duplicado && (
                              <span className="badge warning">
                                <Layers size={12} aria-hidden="true" />ID repetido
                              </span>
                            )}
                            {service.es_cero && (
                              <span className="badge warning">
                                <AlertCircle size={12} aria-hidden="true" />Valor $0
                              </span>
                            )}
                            {!service.es_duplicado && !service.es_cero && (
                              <span className="badge neutral">
                                <CheckCircle2 size={12} aria-hidden="true" />Sin alertas
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {services.length === 0 && (
                  <div className="inline-empty" role="status">
                    <Search size={24} aria-hidden="true" />
                    <h3>{data.servicios.length ? "No hay servicios que coincidan" : "Este episodio no tiene servicios reportados"}</h3>
                    <p>{data.servicios.length ? "Prueba otro término o selecciona Todos." : "El origen devolvió el detalle de servicios vacío."}</p>
                  </div>
                )}
              </div>
              <div className="table-footer">
                <span role="status">{count(services.length)} de {count(data.servicios.length)} servicios</span>
                <div className="pagination">
                  <button
                    className="icon-button"
                    aria-label="Página anterior de servicios"
                    disabled={activePage <= 1}
                    onClick={() => setPage(activePage - 1)}
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  <span>Página {activePage} de {pages}</span>
                  <button
                    className="icon-button"
                    aria-label="Página siguiente de servicios"
                    disabled={activePage >= pages}
                    onClick={() => setPage(activePage + 1)}
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p className="drilldown-method">
                El código MEDICAMENTOS identifica insumos/medicamentos; el resto se etiqueta
                procedimiento/CUPS según el motor. Facturado / CME es una relación financiera,
                no una medida de severidad clínica.
              </p>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
