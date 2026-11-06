import { lazy, Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowLeft,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  FileSearch,
  FilePlus2,
  LayoutDashboard,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useDashboard, useContracts } from "./hooks/useDashboard";
import { useAppRoute } from "./hooks/useAppRoute";
import { DashboardError } from "./api/dashboard";
import type { Episode, TemporalBasis } from "./api/schema";
import {
  currentRange,
  count,
  percent,
  receivedAtBogota,
  shortDate,
  validRange,
} from "./lib/format";
import { exportSummary } from "./lib/export";
import KpiCards from "./components/KpiCards";
import ChartBoundary from "./components/ChartBoundary";
import AuditPanel from "./components/AuditPanel";
import EpisodesTable from "./components/EpisodesTable";
import { PatientDrillDownModal } from "./components/PatientDrillDownModal";
import ContractsPanel from "./components/ContractsPanel";
import { PfgpSimulator } from "./components/PfgpSimulator";
import ContractRegistration from "./components/ContractRegistration";

const Charts = lazy(() => import("./components/Charts"));
const detailNavigation = [
  { id: "resumen", name: "Visión ejecutiva", icon: LayoutDashboard },
  { id: "analisis", name: "Análisis financiero", icon: ChartNoAxesCombined },
  { id: "auditoria", name: "Auditoría de datos", icon: FileSearch },
  { id: "episodios", name: "Episodios", icon: Users },
];

function Skeleton() {
  return (
    <div
      role="status"
      aria-label="Consultando informe"
      className="skeleton-layout"
    >
      <span className="sr-only">
        Consultando Eklipse. Preparando el informe.
      </span>
      <div className="skeleton skeleton-banner" />
      <div className="skeleton-kpis">
        {Array.from({ length: 5 }, (_, i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
      <div className="charts-grid">
        <div className="skeleton skeleton-chart" />
        <div className="skeleton skeleton-chart" />
      </div>
    </div>
  );
}

export default function App() {
  const route = useAppRoute();
  const isRegistering = route === "new-contract";
  const [hasOpenedRegistration, setHasOpenedRegistration] = useState(isRegistering);
  const queryClient = useQueryClient();
  const [range, setRange] = useState(() => currentRange());
  const [draft, setDraft] = useState(range);
  const [dateError, setDateError] = useState("");
  const [dark, setDark] = useState(() => {
    try {
      return (
        localStorage.getItem("pfgp-theme") === "dark" ||
        (!localStorage.getItem("pfgp-theme") &&
          matchMedia("(prefers-color-scheme: dark)").matches)
      );
    } catch {
      return false;
    }
  });
  const [active, setActive] = useState("contratos");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [reviewToken, setReviewToken] = useState(0);
  const [exported, setExported] = useState(false);
  const [basis, setBasis] = useState<TemporalBasis>("dias30");
  const contractsQuery = useContracts(range, !isRegistering);
  const dashboardQuery = useDashboard(range, selectedId, !isRegistering);
  const query = selectedId === null ? contractsQuery : dashboardQuery;
  const data = selectedId === null ? undefined : dashboardQuery.data;
  const reference = data?.referenciasTemporales[basis];
  const navigation = [
    { id: "contratos", name: "Contratos", icon: FileSearch },
    { id: "nuevo-contrato", name: "Agregar contrato", icon: FilePlus2 },
    ...(selectedId === null || isRegistering ? [] : detailNavigation),
  ];
  const activeNavigation = isRegistering ? "nuevo-contrato" : active;
  const dirty = draft.inicio !== range.inicio || draft.final !== range.final;
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("pfgp-theme", dark ? "dark" : "light");
    } catch {
      /* Tema en memoria si el navegador bloquea almacenamiento. */
    }
  }, [dark]);
  useEffect(() => {
    setEpisode(null);
    setExported(false);
  }, [data, selectedId]);
  useEffect(() => {
    if (!isRegistering) return;
    setHasOpenedRegistration(true);
    setEpisode(null);
    setExported(false);
    void queryClient.cancelQueries({ predicate: (item) => item.queryKey[0] === "pfgp-contracts" || item.queryKey[0] === "pfgp-dashboard" });
  }, [isRegistering, queryClient]);
  useEffect(() => {
    if (isRegistering) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-10% 0px -65% 0px" },
    );
    navigation.forEach((n) => {
      const element = document.getElementById(n.id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [data, selectedId, contractsQuery.data, isRegistering]);
  function openContract(id: number) {
    setEpisode(null);
    setReviewToken(0);
    setSelectedId(id);
    setActive("resumen");
    window.scrollTo({ top: 0 });
  }
  function backToContracts() {
    setEpisode(null);
    setSelectedId(null);
    setActive("contratos");
    if (isRegistering) window.location.hash = "contratos";
    window.scrollTo({ top: 0 });
  }
  function navigate(id: string) {
    if (id === "contratos") {
      backToContracts();
      return;
    }
    setActive(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  function refresh() {
    setEpisode(null);
    void query.refetch();
  }

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link" onClick={(event) => {
        event.preventDefault();
        document.getElementById("main-content")?.focus();
      }}>
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#contratos"
          aria-label="Grupo Clínica Médicos, inicio"
          onClick={(e) => {
            e.preventDefault();
            backToContracts();
          }}
        >
          <span className="brand-symbol">
            <Building2 size={25} strokeWidth={1.6} />
          </span>
          <span>
            Grupo Clínica<strong>Médicos</strong>
          </span>
        </a>
        <div className="workspace-label">INTELIGENCIA FINANCIERA</div>
        <nav aria-label="Navegación principal">
          {navigation.map(({ id, name, icon: Icon }) => (
            <a
              key={id}
              aria-label={name}
              href={id === "nuevo-contrato" ? "#/contratos/nuevo" : `#${id}`}
              className={activeNavigation === id ? "nav-item active" : "nav-item"}
              aria-current={activeNavigation === id ? "page" : undefined}
              onClick={(e) => {
                if (id === "nuevo-contrato") return;
                e.preventDefault();
                navigate(id);
              }}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{name}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="platform-label">
            <Activity size={19} />
            <strong>Eklipse</strong>
            <span>PFGP</span>
          </div>
          <p>Pago Fijo Global Prospectivo</p>

        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Contratos PFGP</span>
            <ChevronRight size={14} />
            <strong>{navigation.find((n) => n.id === activeNavigation)?.name}</strong>
          </div>
          <div className="topbar-tools">
            <span className="privacy-label">
              <ShieldCheck size={15} />
              Vista ejecutiva protegida
            </span>
            <button
              className="icon-button theme-button"
              aria-label={dark ? "Activar modo claro" : "Activar modo oscuro"}
              onClick={() => setDark((v) => !v)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {(isRegistering || hasOpenedRegistration) && (
            <div hidden={!isRegistering}><ContractRegistration onReturn={backToContracts} /></div>
          )}
          {!isRegistering && <>
          {selectedId !== null && (
            <button
              className="text-button back-contracts"
              onClick={backToContracts}
            >
              <ArrowLeft size={16} />
              Volver a contratos
            </button>
          )}
          <section
            id={selectedId === null ? "contratos" : "resumen"}
            className="section-anchor"
          >
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  <span className="blue-dot" />
                  AUDITORÍA Y ANÁLISIS DE CONTRATOS
                </div>
                <h1>
                  {selectedId === null
                    ? "Todos tus contratos, en un lugar."
                    : "Una visión clara del contrato."}
                </h1>
                <p>
                  {selectedId === null
                    ? "Encuentra un contrato y abre su análisis financiero y de auditoría."
                    : "Facturación, ejecución y calidad del dato, en un solo lugar."}
                </p>
              </div>
              {selectedId !== null && (
                <button
                  className="button secondary export-button"
                  disabled={!data || query.isFetching || query.isError}
                  onClick={() => {
                    if (data) {
                      exportSummary(data, basis);
                      setExported(true);
                    }
                  }}
                >
                  <ArrowDownToLine size={16} />
                  Exportar resumen
                </button>
              )}
            </div>
            <div className="card filter-card">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!validRange(draft.inicio, draft.final)) {
                    setDateError(
                      "Selecciona fechas válidas; el inicio debe ser anterior o igual al final.",
                    );
                    return;
                  }
                  setDateError("");
                  setEpisode(null);
                  if (!dirty) refresh();
                  else {
                    backToContracts();
                    setRange({ ...draft });
                  }
                }}
              >
                <div className="filter-caption">
                  <CalendarDays size={20} />
                  <div>
                    <strong>Período de análisis</strong>
                    <span>Consulta de facturación</span>
                  </div>
                </div>
                <label>
                  Fecha inicial
                  <input
                    type="date"
                    required
                    value={draft.inicio}
                    aria-invalid={!!dateError}
                    aria-describedby={dateError ? "date-error" : undefined}
                    onChange={(e) =>
                      setDraft({ ...draft, inicio: e.target.value })
                    }
                  />
                </label>
                <span className="date-arrow">
                  <ArrowRight size={16} />
                </span>
                <label>
                  Fecha final
                  <input
                    type="date"
                    required
                    value={draft.final}
                    aria-invalid={!!dateError}
                    aria-describedby={dateError ? "date-error" : undefined}
                    onChange={(e) =>
                      setDraft({ ...draft, final: e.target.value })
                    }
                  />
                </label>
                <button type="submit" className="button primary">
                  <span>{dirty ? "Aplicar período" : "Consultar"}</span>
                  <ArrowRight size={16} />
                </button>
              </form>
              {dateError && (
                <p id="date-error" className="form-error" role="alert">
                  {dateError}
                </p>
              )}
              {dirty && (
                <p className="filter-notice">
                  Hay fechas sin aplicar. El informe y el simulador conservan
                  el rango solicitado indicado junto a la recepción de la consulta.
                </p>
              )}
            </div>
            <span className="sr-only" role="status">
              {exported
                ? "Resumen de agrupadores exportado. No incluye episodios."
                : ""}
            </span>
            {query.isPending && <Skeleton />}
            {query.isError && (
              <div className="card state-card" role="alert">
                {query.error instanceof DashboardError &&
                query.error.kind === "empty" ? (
                  <CalendarDays size={32} />
                ) : (
                  <TriangleAlert size={32} />
                )}
                <h2>
                  {query.error instanceof DashboardError &&
                  query.error.kind === "empty"
                    ? selectedId === null
                      ? "Este período aún no tiene datos"
                      : "No hay datos para este contrato"
                    : "No pudimos preparar el informe"}
                </h2>
                <p>
                  {query.error instanceof DashboardError
                    ? query.error.message
                    : "Ocurrió un error al consultar el informe. Vuelve a intentarlo."}
                </p>
                <button className="button secondary" onClick={refresh}>
                  <RefreshCw size={16} />
                  Volver a consultar
                </button>
              </div>
            )}
            {contractsQuery.data && !contractsQuery.isError && (
              <div hidden={selectedId !== null}>
                <ContractsPanel
                  key={`${range.inicio}-${range.final}`}
                  catalog={contractsQuery.data}
                  onSelect={openContract}
                  onRefresh={() => {
                    void contractsQuery.refetch();
                  }}
                  refreshing={contractsQuery.isFetching}
                />
              </div>
            )}
            {data && !query.isError && (
              <>
                <div className="contract-strip">
                  <div className="contract-identity">
                    <span className="contract-icon">
                      <FileSearch size={22} />
                    </span>
                    <div>
                      <span className="contract-code">
                        CONTRATO {data.metadata.codigoContrato}
                      </span>
                      <h2>
                        {data.metadata.nombreContrato ||
                          "Contrato sin nombre reportado"}
                      </h2>
                      <p>
                        {count(data.metadata.diasCorteAnalizados)} días solicitados
                      </p>
                    </div>
                  </div>
                  <div className="cut-progress">
                    <div>
                      <span>Avance de referencia</span>
                      <strong>
                        {percent(reference?.avanceReferenciaPct ?? null)}
                      </strong>
                    </div>
                    <div
                      className="meter"
                      role="progressbar"
                      aria-label={`Días consultados sobre referencia ${basis === "dias30" ? "de 30 días" : "calendario"}`}
                      aria-valuenow={Math.max(
                        0,
                        Math.min(100, reference?.avanceReferenciaPct ?? 0),
                      )}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuetext={percent(
                        reference?.avanceReferenciaPct ?? null,
                      )}
                    >
                      <span
                        style={{
                          width: `${Math.max(0, Math.min(100, reference?.avanceReferenciaPct ?? 0))}%`,
                        }}
                      />
                    </div>
                    <small>{reference ? `Días consultados / ${count(reference.diasReferencia)} · referencia temporal` : "Referencia calendario no disponible"}</small>
                  </div>
                </div>
                <div className="query-provenance">
                  <dl>
                    <div><dt>Rango solicitado</dt><dd>{shortDate(data.metadata.fechaInicio)} — {shortDate(data.metadata.fechaFinal)}</dd></div>
                    <div><dt>Consulta recibida</dt><dd><time dateTime={data.metadata.consultaRecibidaEn}>{receivedAtBogota(data.metadata.consultaRecibidaEn)}</time></dd></div>
                    <div><dt>Centro</dt><dd>{data.metadata.centroId}</dd></div>
                  </dl>
                  <p>Las fechas de actualización y corte histórico del origen están pendientes de confirmar.</p>
                </div>
                <div className="data-status">
                  <span>
                    <span
                      className={`status-dot ${query.isFetching ? "loading" : ""}`}
                    />
                    {query.isFetching
                      ? "Actualizando · se conserva la consulta anterior"
                      : "Datos de la respuesta recibida"}
                  </span>
                  <button
                    className="text-button"
                    disabled={query.isFetching}
                    onClick={refresh}
                  >
                    <RefreshCw
                      size={13}
                      className={query.isFetching ? "spinning" : ""}
                    />
                    Actualizar corte
                  </button>
                </div>
                <div className="temporal-toolbar">
                  <fieldset className="temporal-selector">
                    <legend>Referencia temporal</legend>
                    {(["dias30", "calendario"] as const).map((value) => (
                      <label key={value}>
                        <input type="radio" name="referencia-temporal" value={value} checked={basis === value}
                          disabled={value === "calendario" && data.referenciasTemporales.calendario === null}
                          onChange={() => { setBasis(value); setExported(false); }} />
                        {value === "dias30" ? "30 días" : "Mes calendario"}
                      </label>
                    ))}
                  </fieldset>
                  <p>{data.referenciasTemporales.motivoCalendario ?? "Cambia la referencia de lectura; conserva presupuesto y corte."}</p>
                </div>
                <KpiCards data={data} basis={basis} />
              </>
            )}
          </section>
          {data && !query.isError && (
            <>
              <ChartBoundary key={`${selectedId}-${query.dataUpdatedAt}`}>
                <Suspense
                  fallback={
                    <div
                      className="skeleton skeleton-chart"
                      role="status"
                      aria-label="Cargando gráficos"
                    />
                  }
                >
                  <Charts data={data} dark={dark} onSelect={setEpisode} basis={basis} />
                </Suspense>
              </ChartBoundary>
              <PfgpSimulator
                key={`simulator-${selectedId}-${range.inicio}-${range.final}-${query.dataUpdatedAt}`}
                fechaInicio={range.inicio}
                fechaFinal={range.final}
                centroId={99}
                idContrato={data.metadata.idContrato}
                codigoContrato={data.metadata.codigoContrato}
                revision={data.metadata.revision}
                onRefresh={refresh}
              />
              <AuditPanel
                data={data}
                onReview={() => {
                  setReviewToken((v) => v + 1);
                  navigate("episodios");
                }}
              />
              <EpisodesTable
                key={`episodes-${selectedId}-${range.inicio}-${range.final}-${query.dataUpdatedAt}`}
                episodes={data.episodios}
                onSelect={setEpisode}
                reviewToken={reviewToken}
              />
              <details id="metodologia" className="card methodology">
                <summary>
                  <CircleHelp size={18} />
                  <span>Cómo interpretar este informe</span>
                </summary>
                <div>
                  <p>
                    Los importes se presentan en COP según el contrato de esta
                    interfaz. Se muestran los valores reportados, sin descontar
                    repeticiones detectadas. Un valor nulo se identifica como no
                    disponible; un cero puede provenir de los valores por
                    defecto del motor y requiere revisar cobertura.
                  </p>
                  <p>
                    La facturación normalizada divide el facturado entre los días
                    consultados y lo multiplica por 30 o por los días del mes.
                    La referencia calendario solo está disponible dentro de un
                    mismo mes. No se confirma aún la periodicidad del presupuesto;
                    estos valores no acreditan déficit mensual ni cierre contractual.
                  </p>
                  <p>
                    Los ID repetidos son señales de revisión, no evidencia de
                    fraude. El valor de servicios en cero no acredita lucro
                    cesante. La recuperación no acredita recaudo efectivo y su
                    clasificación como copago requiere validación. EVENTOS se
                    identifica en el motor por el agrupador 1; su gasto no
                    prueba ausencia de techo.
                  </p>
                  <p>
                    El backend clasifica insumos por el código literal
                    MEDICAMENTOS; la clasificación del resto como
                    procedimiento/CUPS no está validada. El Pareto utiliza el
                    total bruto de todos los servicios antes de limitar la lista.
                    La concentración usa cabeceras de episodios. Los alias ocultan
                    identificadores directos; los datos financieros por episodio
                    siguen siendo información de uso restringido. Esta versión
                    está destinada al equipo local.
                  </p>
                  <p>
                    No se conoce la fecha de actualización del origen. La fecha y
                    hora visibles corresponden a la recepción registrada por el backend,
                    expresada en la zona horaria de Bogotá. El
                    listado muestra los contratos retornados para el período.
                    Cada detalle consulta explícitamente el contrato
                    seleccionado; sus indicadores no combinan contratos
                    distintos.
                  </p>
                </div>
              </details>
            </>
          )}
          </>}
          <footer className="page-footer">
            <span>
              Grupo Clínica Médicos <span className="footer-separator">/</span>{" "}
              Inteligencia financiera
            </span>
          </footer>
        </main>
      </div>
      {!isRegistering && episode && data && !query.isError && (
        <PatientDrillDownModal
          key={`${selectedId}-${episode.consecutivoIngreso}-${data.metadata.revision}`}
          consecutivoIngreso={episode.consecutivoIngreso}
          onClose={() => setEpisode(null)}
          fechaInicio={range.inicio}
          fechaFinal={range.final}
          centroId={99}
          idContrato={data.metadata.idContrato}
          revision={data.metadata.revision}
        />
      )}
    </div>
  );
}
