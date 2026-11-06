import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, FilePlus2, RefreshCw, TriangleAlert } from "lucide-react";
import {
  ContractRegistrationError, contractConfigurationSchema, createContractConfiguration, fetchContractOptions,
  type ContractConfiguration, type CreatedConfiguration,
} from "../api/contracts";
import { budgetComparison, exactDecimal } from "../lib/contractRegistration";
import { count, shortDate } from "../lib/format";

type GroupDraft = { limite: string; cantidadEventosContratados: string };
const emptyDraft = { contratoId: "", valor: "", fechaInicio: "", fechaFin: "", keyAgrupadorServicio: "" };

export default function ContractRegistration({ onReturn }: { onReturn: () => void }) {
  const queryClient = useQueryClient();
  const options = useQuery({
    queryKey: ["pfgp-contract-options", 99], queryFn: ({ signal }) => fetchContractOptions(signal),
    retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const mutation = useMutation({ mutationFn: createContractConfiguration, retry: false });
  const submissionLock = useRef(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [groupDrafts, setGroupDrafts] = useState<Record<number, GroupDraft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<ContractConfiguration | null>(null);
  const [created, setCreated] = useState<CreatedConfiguration | null>(null);
  const [unconfirmedContract, setUnconfirmedContract] = useState<number | null>(null);
  const [observedConfigured, setObservedConfigured] = useState(false);
  const [notice, setNotice] = useState("");
  const data = options.data;
  const chosenType = data?.tipos.find((type) => String(type.id) === draft.keyAgrupadorServicio);
  const allowedIds = new Set(chosenType?.agrupadorIds ?? []);
  const availableGroups = data?.agrupadores.filter((group) => group.id !== 1 && allowedIds.has(group.id)) ?? [];
  const selectedGroups = availableGroups.filter((group) => groupDrafts[group.id] != null);
  const selectedContract = data?.contratos.find((contract) => String(contract.id) === draft.contratoId);
  const comparison = budgetComparison(draft.valor, selectedGroups.map((group) => groupDrafts[group.id].limite));
  const apiMessage = mutation.error instanceof ContractRegistrationError ? mutation.error.message : mutation.error ? "No pudimos completar la operación." : "";
  const errorId = (name: string) => `registration-error-${name.replace(/\./g, "-")}`;
  const errorFor = (name: string) => errors[name] ? <span className="form-error" id={errorId(name)}>{errors[name]}</span> : null;

  useEffect(() => {
    if (!mutation.isPending) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [mutation.isPending]);

  function updateDraft(key: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors({});
    mutation.reset();
    if (key === "keyAgrupadorServicio") {
      const nextIds = new Set(data?.tipos.find((type) => String(type.id) === value)?.agrupadorIds ?? []);
      setGroupDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => nextIds.has(Number(id)) && Number(id) !== 1)));
    }
  }
  function updateGroup(id: number, key: keyof GroupDraft, value: string) {
    setGroupDrafts((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
    setErrors({});
    mutation.reset();
  }
  function prepareReview() {
    const input = {
      centroId: 99 as const,
      contratoId: draft.contratoId ? Number(draft.contratoId) : NaN,
      valor: draft.valor,
      fechaInicio: draft.fechaInicio,
      fechaFin: draft.fechaFin,
      keyAgrupadorServicio: draft.keyAgrupadorServicio === "" ? NaN : Number(draft.keyAgrupadorServicio),
      agrupadores: selectedGroups.map((group) => ({ agrupadorId: group.id, ...groupDrafts[group.id] })),
    };
    const parsed = contractConfigurationSchema.safeParse(input);
    const nextErrors: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) {
      const path = [...issue.path];
      if (path[0] === "agrupadores" && typeof path[1] === "number") path[1] = selectedGroups[path[1]]?.id ?? path[1];
      const key = path.join(".");
      nextErrors[key] ??= issue.message;
    }
    if (!selectedContract || selectedContract.configurado) nextErrors.contratoId = "Selecciona un contrato existente que no esté configurado.";
    if (!chosenType) nextErrors.keyAgrupadorServicio = "Selecciona un tipo de agrupación disponible.";
    setErrors(nextErrors);
    if (!parsed.success || Object.keys(nextErrors).length || options.isFetching || unconfirmedContract != null) return;
    mutation.reset();
    setReview(parsed.data);
  }
  async function saveConfiguration() {
    if (!review || submissionLock.current || unconfirmedContract != null) return;
    submissionLock.current = true;
    try {
      const result = await mutation.mutateAsync(review);
      setCreated(result);
      await queryClient.invalidateQueries({ queryKey: ["pfgp-contracts"], refetchType: "none" });
    } catch (error) {
      if (error instanceof ContractRegistrationError && error.kind === "unconfirmed") setUnconfirmedContract(review.contratoId);
    } finally { submissionLock.current = false; }
  }
  async function refreshOptions() {
    const uncertainId = unconfirmedContract;
    const result = await options.refetch();
    if (result.isError || !result.data) return;
    if (uncertainId != null) {
      const contract = result.data.contratos.find((entry) => entry.id === uncertainId);
      if (!contract) { setNotice("El contrato no aparece en la consulta recibida. El resultado de escritura sigue sin confirmar."); return; }
      if (contract.configurado) {
        setObservedConfigured(true);
        setUnconfirmedContract(null);
        await queryClient.invalidateQueries({ queryKey: ["pfgp-contracts"], refetchType: "none" });
        return;
      }
      setUnconfirmedContract(null);
      setNotice("El origen informa que el contrato no está configurado. Esto no descarta una solicitud anterior en proceso; comprueba el origen antes de reenviar.");
    } else {
      setNotice("Opciones actualizadas. Revisa los datos antes de continuar.");
    }
    setReview(null);
    mutation.reset();
  }
  function resetForm() {
    setDraft(emptyDraft); setGroupDrafts({}); setErrors({}); setReview(null); setCreated(null);
    setUnconfirmedContract(null); setObservedConfigured(false); setNotice(""); mutation.reset();
    void options.refetch();
  }

  return (
    <section className="contract-registration" aria-labelledby="registration-title">
      {!created && !observedConfigured && <button className="text-button back-contracts" onClick={onReturn} disabled={mutation.isPending}><ArrowLeft size={16} />Volver a contratos</button>}
      <div className="page-heading">
        <div><div className="eyebrow"><FilePlus2 size={15} />CONFIGURACIÓN DE CONTRATOS</div><h1 id="registration-title">Agregar contrato PFGP</h1>
          <p>Configura para PFGP un contrato existente en Eklipse. Esta operación no crea un contrato maestro de facturación.</p></div>
      </div>
      {created || observedConfigured ? (
        <div className="card registration-success" role="status">
          <CheckCircle2 size={30} aria-hidden="true" />
          <h2>{created ? "Configuración registrada" : "El contrato figura configurado"}</h2>
          <p>Contrato <strong>{created ? created.codigoContrato || created.contratoId : selectedContract?.codigo || draft.contratoId}</strong> · {created ? created.nombreContrato : selectedContract?.nombre || ""}</p>
          {created ? <dl className="registration-review-details"><div><dt>Valor registrado</dt><dd>{exactDecimal(created.valor)}</dd></div><div><dt>Vigencia registrada</dt><dd>{shortDate(created.fechaInicio)} — {shortDate(created.fechaFin)}</dd></div><div><dt>Agrupadores registrados</dt><dd>{count(created.agrupadores.length)}</dd></div></dl>
            : <p>El origen informa que existe una configuración. Revisa sus datos en el origen; esta consulta no confirma si corresponde al envío anterior.</p>}
          <div className="registration-actions"><button className="button primary" onClick={onReturn}>Volver a contratos</button><button className="button secondary" onClick={resetForm}>Configurar otro contrato</button></div>
        </div>
      ) : unconfirmedContract != null ? (
        <div className="card registration-outcome" role="alert">
          <TriangleAlert size={28} aria-hidden="true" /><h2>Resultado de escritura sin confirmar</h2>
          <p>{apiMessage}</p><p>El envío está bloqueado hasta consultar nuevamente el estado del contrato. No se repetirá automáticamente la solicitud.</p>
          {notice && <p>{notice}</p>}
          {options.isError && <p>No pudimos comprobar el estado. El envío sigue bloqueado.</p>}
          <button className="button primary" onClick={() => { void refreshOptions(); }} disabled={options.isFetching}><RefreshCw size={16} className={options.isFetching ? "spinning" : ""} />{options.isFetching ? "Comprobando estado…" : "Comprobar estado"}</button>
        </div>
      ) : options.isPending ? (
        <div className="card registration-state" role="status"><RefreshCw size={24} className="spinning" />Consultando contratos y agrupadores disponibles…</div>
      ) : !data || options.isError && !review ? (
        <div className="card registration-state" role="alert"><TriangleAlert size={28} /><h2>No pudimos cargar las opciones</h2><p>{options.error instanceof ContractRegistrationError ? options.error.message : "Consulta nuevamente las opciones para continuar."}</p><button className="button secondary" onClick={() => { void refreshOptions(); }} disabled={options.isFetching}>Actualizar opciones</button></div>
      ) : review ? (
        <div className="card registration-review">
          <h2>Revisar configuración</h2><p>Confirma estos datos antes de registrar la configuración PFGP.</p>
          <dl className="registration-review-details">
            <div><dt>Contrato existente</dt><dd>{selectedContract?.codigo} · {selectedContract?.nombre}</dd></div>
            <div><dt>Valor del contrato</dt><dd>{exactDecimal(review.valor)}</dd></div>
            <div><dt>Vigencia registrada</dt><dd>{shortDate(review.fechaInicio)} — {shortDate(review.fechaFin)}</dd></div>
            <div><dt>Tipo de agrupación</dt><dd>Tipo {review.keyAgrupadorServicio}</dd></div>
          </dl>
          <div className="table-scroll" role="region" aria-label="Agrupadores de la configuración a registrar" tabIndex={0}>
            <table><thead><tr><th>Agrupador</th><th>Límite COP</th><th>Eventos contratados</th></tr></thead><tbody>{review.agrupadores.map((group) => <tr key={group.agrupadorId}><td>{data.agrupadores.find((entry) => entry.id === group.agrupadorId)?.nombre || `Agrupador ${group.agrupadorId}`}</td><td>{exactDecimal(group.limite)}</td><td>{exactDecimal(group.cantidadEventosContratados, false)}</td></tr>)}</tbody></table>
          </div>
          {comparison && <p className="registration-budget-note">Suma de límites: {exactDecimal(comparison.total)} · Valor − límites: {exactDecimal(comparison.difference)}. La diferencia es informativa y no impide registrar.</p>}
          {apiMessage && <div className="registration-error" role="alert"><p>{apiMessage}</p>{mutation.error instanceof ContractRegistrationError && (mutation.error.kind === "already_configured" || mutation.error.kind === "validation") && <button className="text-button" onClick={() => { void refreshOptions(); }} disabled={options.isFetching}>Actualizar opciones</button>}</div>}
          <div className="registration-actions"><button className="button secondary" disabled={mutation.isPending} onClick={() => { setReview(null); mutation.reset(); }}>Editar datos</button><button className="button primary" disabled={mutation.isPending || options.isFetching || mutation.error instanceof ContractRegistrationError && mutation.error.kind === "already_configured"} onClick={() => { void saveConfiguration(); }}>{mutation.isPending ? "Guardando configuración…" : "Guardar configuración"}<ArrowRight size={16} /></button></div>
        </div>
      ) : (
        <form className="card registration-form" noValidate onSubmit={(event) => { event.preventDefault(); prepareReview(); }}>
          <div className="registration-form-heading"><h2>Datos de la configuración</h2><button type="button" className="text-button" disabled={options.isFetching} onClick={() => { void refreshOptions(); }}><RefreshCw size={14} className={options.isFetching ? "spinning" : ""} />Actualizar opciones</button></div>
          {notice && <p className="registration-notice" role="status">{notice}</p>}
          {!!Object.keys(errors).length && <p className="form-error" role="alert">Revisa los campos señalados antes de continuar.</p>}
          <div className="registration-fields">
            <label className="registration-wide">Contrato existente<select value={draft.contratoId} onChange={(event) => updateDraft("contratoId", event.target.value)} aria-invalid={!!errors.contratoId} aria-describedby={errors.contratoId ? errorId("contratoId") : "registration-contract-help"}><option value="">Selecciona un contrato</option>{data.contratos.map((contract) => <option key={contract.id} value={contract.id} disabled={contract.configurado}>{contract.codigo || `ID ${contract.id}`} · {contract.nombre || "Sin nombre reportado"}{contract.configurado ? " — Ya configurado" : ""}</option>)}</select>{errorFor("contratoId")}<span id="registration-contract-help" className="registration-help">Los contratos que ya tienen configuración no se pueden seleccionar.</span></label>
            <label>Valor del contrato<input inputMode="decimal" value={draft.valor} onChange={(event) => updateDraft("valor", event.target.value)} aria-invalid={!!errors.valor} aria-describedby={errors.valor ? errorId("valor") : "registration-decimal-help"} maxLength={100} />{errorFor("valor")}</label>
            <label>Tipo de agrupación<select value={draft.keyAgrupadorServicio} onChange={(event) => updateDraft("keyAgrupadorServicio", event.target.value)} aria-invalid={!!errors.keyAgrupadorServicio} aria-describedby={errors.keyAgrupadorServicio ? errorId("keyAgrupadorServicio") : undefined}><option value="">Selecciona un tipo</option>{data.tipos.map((type) => <option key={type.id} value={type.id}>Tipo {type.id}</option>)}</select>{errorFor("keyAgrupadorServicio")}</label>
            <label>Vigencia registrada: inicio<input type="date" min="1753-01-01" max="9999-12-31" value={draft.fechaInicio} onChange={(event) => updateDraft("fechaInicio", event.target.value)} aria-invalid={!!errors.fechaInicio} aria-describedby={errors.fechaInicio ? errorId("fechaInicio") : undefined} />{errorFor("fechaInicio")}</label>
            <label>Vigencia registrada: fin<input type="date" min="1753-01-01" max="9999-12-31" value={draft.fechaFin} onChange={(event) => updateDraft("fechaFin", event.target.value)} aria-invalid={!!errors.fechaFin} aria-describedby={errors.fechaFin ? errorId("fechaFin") : undefined} />{errorFor("fechaFin")}</label>
          </div>
          <p id="registration-decimal-help" className="registration-help">Importes en COP. Usa coma o punto decimal, sin separadores de miles. Se conservan hasta 4 decimales en importes y 2 en eventos contratados.</p>
          <fieldset className="registration-groups"><legend>Agrupadores PFGP</legend><p className="registration-help">Selecciona entre 1 y 100 agrupadores del tipo elegido. EVENTOS no se incluye en esta configuración.</p>{errorFor("agrupadores")}
            {!chosenType ? <p className="registration-empty">Selecciona un tipo de agrupación para ver sus agrupadores.</p> : !availableGroups.length ? <p className="registration-empty">El tipo seleccionado no tiene agrupadores PFGP disponibles.</p> : availableGroups.map((group) => {
              const included = groupDrafts[group.id] != null;
              return <div className={`registration-group ${included ? "is-included" : ""}`} key={group.id}>
                <label className="checkbox"><input type="checkbox" aria-label={`Incluir agrupador ${group.nombre}`} checked={included} onChange={(event) => { const checked = event.target.checked; setGroupDrafts((current) => { const next = { ...current }; if (checked) next[group.id] = { limite: "", cantidadEventosContratados: "" }; else delete next[group.id]; return next; }); setErrors({}); mutation.reset(); }} />{group.nombre}</label>
                {included && <div className="registration-group-fields">
                  <label>Límite de {group.nombre}<input inputMode="decimal" maxLength={100} value={groupDrafts[group.id].limite} onChange={(event) => updateGroup(group.id, "limite", event.target.value)} aria-invalid={!!errors[`agrupadores.${group.id}.limite`]} aria-describedby={errors[`agrupadores.${group.id}.limite`] ? errorId(`agrupadores.${group.id}.limite`) : "registration-decimal-help"} />{errorFor(`agrupadores.${group.id}.limite`)}</label>
                  <label>Eventos contratados de {group.nombre}<input inputMode="decimal" maxLength={100} value={groupDrafts[group.id].cantidadEventosContratados} onChange={(event) => updateGroup(group.id, "cantidadEventosContratados", event.target.value)} aria-invalid={!!errors[`agrupadores.${group.id}.cantidadEventosContratados`]} aria-describedby={errors[`agrupadores.${group.id}.cantidadEventosContratados`] ? errorId(`agrupadores.${group.id}.cantidadEventosContratados`) : "registration-decimal-help"} />{errorFor(`agrupadores.${group.id}.cantidadEventosContratados`)}</label>
                </div>}
              </div>;
            })}
          </fieldset>
          <div className="registration-budget"><span>{count(selectedGroups.length)} agrupadores seleccionados</span><span>Suma de límites: {comparison ? exactDecimal(comparison.total) : "No disponible"}</span><span>Valor − límites: {comparison ? exactDecimal(comparison.difference) : "No disponible"}</span><p>La diferencia entre el valor del contrato y los límites es informativa; no se exige igualdad.</p></div>
          <div className="registration-actions"><button type="submit" className="button primary" disabled={options.isFetching}>Revisar configuración<ArrowRight size={16} /></button></div>
        </form>
      )}
    </section>
  );
}
