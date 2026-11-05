import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { DashboardError, fetchSimulation } from "../api/dashboard";
import { amount, percent, shortDate } from "../lib/format";

const exclusions = [
  {
    key: "excluirTerapiaVAC",
    title: "Terapia VAC",
    description: "Cánisters y foams de presión negativa para cirugía y UCI.",
  },
  {
    key: "excluirLaparoscopiaAvanzada",
    title: "Laparoscopia avanzada",
    description: "Trócares Versaport, Endo Shears y Hemoloks.",
  },
  {
    key: "excluirMallasSling",
    title: "Prótesis y slings urológicos",
    description: "Mallas y slings para el tratamiento de la incontinencia.",
  },
] as const;

export function PfgpSimulator({
  fechaInicio,
  fechaFinal,
  centroId,
  idContrato,
}: {
  fechaInicio: string;
  fechaFinal: string;
  centroId: number;
  idContrato: number;
}) {
  const [selection, setSelection] = useState({
    excluirTerapiaVAC: false,
    excluirLaparoscopiaAvanzada: false,
    excluirMallasSling: false,
  });
  const [started, setStarted] = useState(false);
  const request = {
    inicio: fechaInicio,
    final: fechaFinal,
    centroId,
    idContrato,
    ...selection,
  };
  const query = useQuery({
    queryKey: ["pfgp-simulation", request],
    queryFn: ({ signal }) => fetchSimulation(request, signal),
    enabled: started,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const result = query.isError || query.isFetching ? undefined : query.data;
  const groups = result?.agrupadoresRecalculados.filter(
    (group) => group.limite > 0 && group.idAgrupador !== 1,
  );
  const selectedCount = Object.values(selection).filter(Boolean).length;

  return (
    <section
      id="simulador"
      className="simulator section-anchor"
      aria-labelledby="simulator-title"
    >
      <header className="simulator-heading">
        <div>
          <div className="eyebrow">
            <SlidersHorizontal size={15} aria-hidden="true" />
            DECISIONES ESTRATÉGICAS
          </div>
          <h2 id="simulator-title">Una nueva perspectiva para tu PGP.</h2>
          <p>
            Simulador de renegociación de nota técnica. Explora qué cambia al
            trasladar insumos de alta complejidad a facturación por <strong>Evento</strong>.
          </p>
        </div>
        <span className="simulator-chip">Escenario de simulación</span>
      </header>

      <div className="simulator-context">
        <span>
          {shortDate(fechaInicio)} — {shortDate(fechaFinal)} · Centro {centroId}
        </span>
        <span>
          Contrato {idContrato} · {selectedCount} de 3 exclusiones
        </span>
      </div>

      <fieldset className="simulator-options">
        <legend>Selecciona los insumos que se facturarían por Evento</legend>
        {exclusions.map(({ key, title, description }) => (
          <label
            key={key}
            className={`simulator-option${selection[key] ? " selected" : ""}`}
          >
            <span className="simulator-option-heading">
              <span>{title}</span>
              <input
                type="checkbox"
                role="switch"
                aria-label={`Excluir ${title}`}
                checked={selection[key]}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelection((current) => ({ ...current, [key]: checked }));
                  setStarted(true);
                }}
              />
            </span>
            <span className="simulator-description">{description}</span>
            <span className="simulator-option-state">
              {selection[key] ? "Trasladar a Evento" : "Conservar en PGP"}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="simulator-output" aria-busy={query.isFetching}>
        <div className="simulator-status" role="status">
          {query.isFetching ? (
            <>
              <RefreshCw size={16} className="spinning" aria-hidden="true" />
              Calculando el impacto del escenario…
            </>
          ) : !started ? (
            <>
              <SlidersHorizontal size={17} aria-hidden="true" />
              Activa una exclusión para ver su impacto o consulta el escenario sin exclusiones.
            </>
          ) : result ? (
            <>
              <CheckCircle2 size={16} aria-hidden="true" />
              Escenario calculado · {selectedCount === 0 ? "Sin exclusiones" : `${selectedCount} exclusiones activas`}
            </>
          ) : null}
          {!started && (
            <button className="button secondary" onClick={() => setStarted(true)}>
              Simular escenario <ArrowRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>

        {query.isError && (
          <div className="simulator-error" role="alert">
            <TriangleAlert size={19} aria-hidden="true" />
            <p>
              {query.error instanceof DashboardError
                ? query.error.message
                : "No pudimos calcular la simulación. Vuelve a intentarlo."}
            </p>
            <button
              className="button secondary"
              onClick={() => { void query.refetch(); }}
            >
              Reintentar simulación
            </button>
          </div>
        )}

        {result && (
          <>
            <dl className="simulator-metrics">
              <div className="simulator-relief">
                <dt>Alivio financiero PGP</dt>
                <dd>
                  {amount(result.totalTrasladadoAEvento)} <small>COP</small>
                  <span>Importe trasladado a facturación por Evento</span>
                </dd>
              </div>
              <div>
                <dt>Reducción de presión</dt>
                <dd>
                  {percent(result.alivioFinancieroPct)}
                  <span>Sobre la facturación original del contrato</span>
                </dd>
              </div>
            </dl>
            <div className="simulator-results-heading">
              <h3>Impacto por agrupador</h3>
              <span>Ejecución original → simulada</span>
            </div>
            {groups?.length ? (
              <div className="simulator-groups">
                {groups.map((group) => {
                  const improved =
                    group.ejecucionSimuladaPct < group.ejecucionOriginalPct;
                  const recovered =
                    group.ejecucionOriginalPct > 100 && group.ejecucionSimuladaPct <= 100;
                  return (
                    <article className="simulator-group" key={group.idAgrupador}>
                      <div className="simulator-group-heading">
                        <h4>{group.nombre}</h4>
                        {improved && (
                          <span className="badge success">
                            <CheckCircle2 size={12} aria-hidden="true" />
                            {recovered ? "En rango" : "Menor presión"}
                          </span>
                        )}
                      </div>
                      <p>Límite: {amount(group.limite)} COP</p>
                      <div className="simulator-comparison">
                        <div>
                          <span>Original</span>
                          <strong className={group.ejecucionOriginalPct > 100 ? "simulator-over" : ""}>
                            {percent(group.ejecucionOriginalPct)}
                          </strong>
                        </div>
                        <ArrowRight size={18} aria-label="pasa a" />
                        <div>
                          <span>Simulada</span>
                          <strong className={group.ejecucionSimuladaPct > 100 ? "simulator-over" : improved ? "simulator-improved" : ""}>
                            {percent(group.ejecucionSimuladaPct)}
                          </strong>
                        </div>
                      </div>
                      <div className="simulator-transfer">
                        <span>A facturación Evento</span>
                        <strong>{amount(group.montoExcluidoEvento)}</strong>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="simulator-description">
                No hay agrupadores con límite presupuestal PGP en este contrato y período.
              </p>
            )}
          </>
        )}
      </div>
      <p className="simulator-footnote">
        La simulación no modifica el contrato ni la facturación. Las exclusiones se
        identifican por nombre de insumo; los agrupadores sin presupuesto y EVENTOS
        no se trasladan de nuevo.
      </p>
    </section>
  );
}
