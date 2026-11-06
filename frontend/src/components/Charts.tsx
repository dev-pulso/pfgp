import { useMemo, type ReactNode } from "react";
import ReactEChartsCore from "echarts-for-react/esm/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  LegendComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import type { Dashboard, Episode, TemporalBasis } from "../api/schema";
import { amount, count, percent, shortMoney } from "../lib/format";
import { outlierIds, pareto } from "../lib/analytics";

echarts.use([
  BarChart,
  LineChart,
  ScatterChart,
  AriaComponent,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  LegendComponent,
  SVGRenderer,
]);
const truncate = (s: string, max = 18) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

function ChartCard({
  label,
  title,
  note,
  option,
  children,
  empty,
  onClick,
  height = 290,
}: {
  label: string;
  title: string;
  note: string;
  option: EChartsOption;
  children: ReactNode;
  empty?: boolean;
  onClick?: (params: { data: { episodeId?: number } }) => void;
  height?: number;
}) {
  return (
    <article className="card chart-card">
      <div className="chart-head">
        <span className="eyebrow">{label}</span>
        <h3>{title}</h3>
      </div>
      {empty ? (
        <div className="chart-empty">
          No hay observaciones suficientes para este gráfico.
        </div>
      ) : (
        <ReactEChartsCore
          echarts={echarts}
          option={option}
          notMerge
          opts={{ renderer: "svg" }}
          style={{ height }}
          onEvents={onClick ? { click: onClick } : undefined}
        />
      )}
      <p className="chart-note">{note}</p>
      <details className="chart-data">
        <summary>Ver datos del gráfico</summary>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label={`Datos: ${label}`}
        >
          {children}
        </div>
      </details>
    </article>
  );
}

export default function Charts({
  data,
  dark,
  onSelect,
  basis,
}: {
  data: Dashboard;
  dark: boolean;
  onSelect: (episode: Episode) => void;
  basis: TemporalBasis;
}) {
  const palette = {
    blue: dark ? "#57a8ff" : "#0066cc",
    gray: dark ? "#898993" : "#9dabbc",
    text: dark ? "#b6b6c0" : "#62626d",
    grid: dark ? "#33333a" : "#ececf0",
    red: dark ? "#ff897e" : "#b93b31",
    ink: dark ? "#f5f5f7" : "#1d1d1f",
  };
  const base: EChartsOption = {
    animation: false,
    aria: {
      enabled: true,
      label: {
        description:
          "Gráfico del contrato. Los valores completos están en Ver datos del gráfico.",
      },
    },
    textStyle: {
      fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      color: palette.text,
    },
    tooltip: {
      trigger: "axis",
      confine: true,
      backgroundColor: dark ? "#25252b" : "#fff",
      borderColor: palette.grid,
      textStyle: { color: palette.ink },
      extraCssText: "max-width: 270px; white-space: normal;",
    },
    grid: { top: 28, bottom: 40, left: 20, right: 26, containLabel: true },
  };
  const groups = useMemo(
    () =>
      [...data.agrupadores].sort(
        (a, b) =>
          (b.porcentajeEjecutado ?? -Infinity) -
          (a.porcentajeEjecutado ?? -Infinity),
      ),
    [data.agrupadores],
  );
  const reference = data.referenciasTemporales[basis];
  const ahead = groups.filter(
    (g) => reference?.avanceReferenciaPct != null && g.limitePresupuestal != null && g.limitePresupuestal > 0 && g.porcentajeEjecutado != null && g.porcentajeEjecutado > reference.avanceReferenciaPct,
  ).length;
  const aboveCme = groups.filter(
    (g) =>
      g.cmeContratado != null &&
      g.cmeContratado > 0 &&
      g.cmeRealPromedio != null &&
      g.cmeRealPromedio > g.cmeContratado,
  ).length;
  const outliers = useMemo(() => outlierIds(data.episodios), [data.episodios]);
  const costs = useMemo(() => pareto(data.paretoCostos, data.paretoUniverso), [data.paretoCostos, data.paretoUniverso]);
  const axis = {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: palette.text, fontSize: 11 },
    splitLine: { lineStyle: { color: palette.grid, type: "dashed" as const } },
  };
  const groupTooltip = (params: unknown, cme = false) => {
    const p = (Array.isArray(params) ? params[0] : params) as {
      dataIndex: number;
    };
    const g = groups[p.dataIndex];
    if (!g) return "";
    return `<b>${escape(g.nombre)}</b><br/>${cme ? `Contratado: ${amount(g.cmeContratado)}<br/>Real: ${amount(g.cmeRealPromedio)}` : `Ejecución: ${percent((g.limitePresupuestal ?? 0) > 0 ? g.porcentajeEjecutado : null)}<br/>Facturado: ${amount(g.totalFacturado)}`}`;
  };
  const execution: EChartsOption = {
    ...base,
    grid: { top: 20, bottom: 38, left: 16, right: 38, containLabel: true },
    xAxis: {
      ...axis,
      type: "value",
      name: "Ejecución (%)",
      nameLocation: "middle",
      nameGap: 27,
      max: (v) =>
        Math.max(
          110,
          Math.ceil(v.max / 10) * 10,
          (reference?.avanceReferenciaPct ?? 0) + 10,
        ),
    },
    yAxis: {
      ...axis,
      type: "category",
      inverse: true,
      data: groups.map((g) => g.nombre),
      axisLabel: {
        color: palette.text,
        width: 114,
        overflow: "truncate",
        fontSize: 11,
      },
      splitLine: { show: false },
    },
    tooltip: { ...base.tooltip, formatter: (p) => groupTooltip(p) },
    series: [
      {
        type: "bar",
        name: "Ejecución",
        barMaxWidth: 18,
        data: groups.map((g) => ({
          value: (g.limitePresupuestal ?? 0) > 0 ? g.porcentajeEjecutado : null,
          itemStyle: {
            color:
              (g.porcentajeEjecutado ?? 0) > 100 ? palette.red : palette.blue,
            borderRadius: [0, 4, 4, 0],
          },
        })),
        markLine: {
          symbol: "none",
          silent: true,
          label: { show: false },
          data: [
            ...(reference?.avanceReferenciaPct == null
              ? []
              : [
                  {
                    xAxis: reference.avanceReferenciaPct,
                    lineStyle: { color: palette.blue, type: "dashed" as const },
                  },
                ]),
            { xAxis: 100, lineStyle: { color: palette.text, type: "solid" } },
          ],
        },
      },
    ],
  };
  const cme: EChartsOption = {
    ...base,
    legend: {
      top: 0,
      right: 18,
      textStyle: { color: palette.text, fontSize: 11 },
      itemWidth: 10,
      itemHeight: 10,
    },
    grid: { top: 38, bottom: 50, left: 16, right: 18, containLabel: true },
    xAxis: {
      ...axis,
      type: "category",
      data: groups.map((g) => g.nombre),
      axisLabel: {
        color: palette.text,
        fontSize: 10,
        interval: 0,
        rotate: 22,
        formatter: (s) => truncate(s, 14),
      },
    },
    yAxis: {
      ...axis,
      type: "value",
      axisLabel: { color: palette.text, fontSize: 10, formatter: shortMoney },
    },
    tooltip: { ...base.tooltip, formatter: (p) => groupTooltip(p, true) },
    series: [
      {
        type: "bar",
        name: "CME contratado",
        data: groups.map((g) => g.cmeContratado),
        itemStyle: { color: palette.gray, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 20,
      },
      {
        type: "bar",
        name: "CME real",
        data: groups.map((g) =>
          g.iteracionesRealesJSON > 0 ? g.cmeRealPromedio : null,
        ),
        itemStyle: { color: palette.blue, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 20,
      },
    ],
  };
  const scatter: EChartsOption = {
    ...base,
    legend: {
      top: 0,
      right: 16,
      textStyle: { color: palette.text, fontSize: 11 },
      itemWidth: 8,
      itemHeight: 8,
    },
    grid: { top: 35, bottom: 42, left: 16, right: 20, containLabel: true },
    xAxis: {
      ...axis,
      type: "value",
      minInterval: 1,
      name: "Estancia reportada (días)",
      nameLocation: "middle",
      nameGap: 30,
    },
    yAxis: {
      ...axis,
      type: "value",
      axisLabel: { color: palette.text, fontSize: 10, formatter: shortMoney },
    },
    tooltip: {
      ...base.tooltip,
      trigger: "item",
      formatter: (params) => {
        const p = params as unknown as {
          data: { episodeId: number; value: number[] };
        };
        const e = data.episodios.find(
          (e) => e.consecutivoIngreso === p.data.episodeId,
        );
        return e
          ? `<b>${escape(e.paciente)}</b><br/>Estancia: ${count(e.diasEstancia)} días<br/>Facturado: ${amount(e.totalFacturadoCabecera)}<br/>${outliers.has(e.consecutivoIngreso) ? "Atípico por facturación · " : ""}Seleccionar para ver detalle`
          : "";
      },
    },
    series: [false, true].map((isOutlier) => ({
      type: "scatter" as const,
      name: isOutlier ? "Atípico (IQR)" : "Episodio",
      symbol: isOutlier ? "diamond" : "circle",
      symbolSize: isOutlier ? 13 : 9,
      itemStyle: {
        color: isOutlier ? palette.red : palette.blue,
        opacity: 0.8,
      },
      data: data.episodios
        .filter(
          (e) =>
            e.diasEstancia != null &&
            e.totalFacturadoCabecera != null &&
            outliers.has(e.consecutivoIngreso) === isOutlier,
        )
        .map((e) => ({
          value: [e.diasEstancia, e.totalFacturadoCabecera],
          episodeId: e.consecutivoIngreso,
        })),
    })),
  };
  const costChart: EChartsOption = {
    ...base,
    grid: { top: 36, bottom: 50, left: 16, right: 20, containLabel: true },
    legend: {
      top: 0,
      right: 16,
      textStyle: { color: palette.text, fontSize: 11 },
      itemWidth: 12,
      itemHeight: 8,
    },
    xAxis: {
      ...axis,
      type: "category",
      data: costs.map((_, i) => `${i + 1}`),
      name: "Servicio (posición en tabla)",
      nameLocation: "middle",
      nameGap: 30,
    },
    yAxis: [
      {
        ...axis,
        type: "value",
        axisLabel: { color: palette.text, fontSize: 10, formatter: shortMoney },
      },
      {
        ...axis,
        type: "value",
        min: 0,
        max: 100,
        axisLabel: {
          color: palette.text,
          fontSize: 10,
          formatter: "{value} %",
        },
        splitLine: { show: false },
      },
    ],
    tooltip: {
      ...base.tooltip,
      formatter: (params) => {
        const p = (Array.isArray(params) ? params[0] : params) as {
          dataIndex: number;
        };
        const item = costs[p.dataIndex];
        return item
          ? `<b>${escape(item.nombre)}</b><br/>Valor bruto: ${amount(item.valorTotal)}<br/>Acumulado del universo: ${percent(item.cumulativePct)}`
          : "";
      },
    },
    series: [
      {
        type: "bar",
        name: "Valor COP",
        data: costs.map((c) => c.valorTotal),
        barMaxWidth: 28,
        itemStyle: { color: palette.blue, borderRadius: [3, 3, 0, 0] },
      },
      {
        type: "line",
        name: "% acumulado",
        yAxisIndex: 1,
        data: costs.map((c) => c.cumulativePct),
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { color: palette.ink, width: 2 },
        itemStyle: { color: palette.ink },
      },
    ],
  };
  const driverGroups = groups.filter((g) => g.efectoVolumen != null && g.efectoValor != null && g.diferenciaPresupuestoImplicito != null);
  const drivers: EChartsOption = {
    ...base,
    legend: { top: 0, textStyle: { color: palette.text, fontSize: 10 }, itemWidth: 10, itemHeight: 8 },
    grid: { top: 48, bottom: 30, left: 12, right: 16, containLabel: true },
    xAxis: { ...axis, type: "value", axisLabel: { color: palette.text, formatter: shortMoney, fontSize: 10 } },
    yAxis: { ...axis, type: "category", inverse: true, data: driverGroups.map((g) => g.nombre), axisLabel: { color: palette.text, width: 105, overflow: "truncate", fontSize: 10 }, splitLine: { show: false } },
    tooltip: { ...base.tooltip, formatter: (params) => {
      const p = (Array.isArray(params) ? params[0] : params) as { dataIndex: number };
      const g = driverGroups[p.dataIndex];
      return g ? `<b>${escape(g.nombre)}</b><br/>Volumen: ${amount(g.efectoVolumen)}<br/>Valor por evento: ${amount(g.efectoValor)}<br/>Base presupuestal: ${amount(g.diferenciaPresupuestoImplicito)}` : "";
    } },
    series: [
      { type: "bar", stack: "desviacion", name: "Volumen", data: driverGroups.map((g) => g.efectoVolumen), itemStyle: { color: palette.blue }, barMaxWidth: 18 },
      { type: "bar", stack: "desviacion", name: "Valor por evento", data: driverGroups.map((g) => g.efectoValor), itemStyle: { color: palette.red }, barMaxWidth: 18 },
      { type: "bar", stack: "desviacion", name: "Base presupuestal", data: driverGroups.map((g) => g.diferenciaPresupuestoImplicito), itemStyle: { color: palette.gray }, barMaxWidth: 18 },
    ],
  };
  const concentrationRows = [
    { label: "10 episodios principales", count: data.concentracion.cantidadTop10, value: data.concentracion.top10Pct },
    { label: "10 % superior de episodios", count: data.concentracion.cantidadTopDecil, value: data.concentracion.topDecilPct },
  ];
  const concentration: EChartsOption = {
    ...base,
    grid: { top: 40, bottom: 35, left: 16, right: 20, containLabel: true },
    legend: { top: 0, textStyle: { color: palette.text, fontSize: 11 } },
    xAxis: { ...axis, type: "value", min: 0, max: 100, axisLabel: { color: palette.text, formatter: "{value} %", fontSize: 10 } },
    yAxis: { ...axis, type: "category", data: ["Top 10", "Top 10 %"], splitLine: { show: false } },
    tooltip: { ...base.tooltip, formatter: (params) => {
      const p = (Array.isArray(params) ? params[0] : params) as { dataIndex: number };
      const row = concentrationRows[p.dataIndex];
      return row ? `<b>${row.label}</b><br/>${count(row.count)} episodios: ${percent(row.value)}` : "";
    } },
    series: [
      { type: "bar", stack: "participacion", name: "Episodios seleccionados", data: concentrationRows.map((r) => r.value), itemStyle: { color: palette.blue }, barMaxWidth: 28 },
      { type: "bar", stack: "participacion", name: "Resto", data: concentrationRows.map((r) => r.value == null ? null : 100 - r.value), itemStyle: { color: palette.gray }, barMaxWidth: 28 },
    ],
  };
  return (
    <section id="analisis" className="section-anchor">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ANÁLISIS FINANCIERO</span>
          <h2>Las señales detrás de las cifras</h2>
        </div>
        <span className="section-meta">
          {count(groups.length)} agrupadores · valores en COP
        </span>
      </div>
      <div className="charts-grid">
        <ChartCard
          label="01 · EJECUCIÓN PRESUPUESTAL"
          title={
            ahead
              ? `${ahead} agrupador${ahead === 1 ? "" : "es"} supera${ahead === 1 ? "" : "n"} el ritmo de referencia`
              : "La ejecución frente al ritmo del corte"
          }
          note={`Línea discontinua: días consultados / referencia ${basis === "dias30" ? "de 30 días" : "calendario"}: ${percent(reference?.avanceReferenciaPct ?? null)}. Línea continua: límite 100 %. La periodicidad presupuestal está pendiente de confirmar.`}
          option={execution}
          empty={!groups.length}
          height={Math.max(290, groups.length * 35 + 60)}
        >
          <table>
            <thead>
              <tr>
                <th>Agrupador</th>
                <th>Facturado COP</th>
                <th>Límite COP</th>
                <th>Ejecución</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.idAgrupador}>
                  <td>{g.nombre}</td>
                  <td>{amount(g.totalFacturado)}</td>
                  <td>{amount(g.limitePresupuestal)}</td>
                  <td>
                    {percent(
                      (g.limitePresupuestal ?? 0) > 0 ? g.porcentajeEjecutado : null,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
        <ChartCard
          label="02 · COSTO MEDIO POR EVENTO"
          title={`${aboveCme} agrupador${aboveCme === 1 ? "" : "es"} por encima del CME contratado`}
          note="CME real = facturado / registros JSON. La tabla incluye mediana, percentil 90 y tamaño de muestra por agrupador. Comparación financiera; no es severidad clínica."
          option={cme}
          empty={!groups.length}
        >
          <table>
            <thead>
              <tr>
                <th>Agrupador</th>
                <th>Contratado COP</th>
                <th>Real COP</th>
                <th>Mediana COP</th>
                <th>Percentil 90 COP</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.idAgrupador}>
                  <td>{g.nombre}</td>
                  <td>{amount(g.cmeContratado)}</td>
                  <td>
                    {amount(
                      g.iteracionesRealesJSON > 0 ? g.cmeRealPromedio : null,
                    )}
                  </td>
                  <td>{amount(g.medianaFacturacion)}</td>
                  <td>{amount(g.p90Facturacion)}</td>
                  <td>{count(g.cantidadObservaciones)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
        <ChartCard
          label="03 · ESTANCIA Y FACTURACIÓN"
          title={
            outliers.size
              ? `${outliers.size} episodio${outliers.size === 1 ? "" : "s"} con facturación atípica`
              : "Cómo se distribuye la facturación por estancia"
          }
          note="Atípico dentro de su agrupador: facturado > Q3 + 1,5 × IQR (mínimo 4 observaciones). Estancia es el valor reportado, no una duración clínica final validada. Selecciona un punto o usa la tabla para abrir el detalle."
          option={scatter}
          empty={!data.episodios.length}
          onClick={(p) => {
            const e = data.episodios.find(
              (e) => e.consecutivoIngreso === p.data.episodeId,
            );
            if (e) onSelect(e);
          }}
        >
          <table>
            <thead>
              <tr>
                <th>Episodio</th>
                <th>Agrupador / muestra</th>
                <th>Días</th>
                <th>Facturado COP</th>
                <th>Revisión</th>
              </tr>
            </thead>
            <tbody>
              {data.episodios.map((e) => (
                <tr key={e.consecutivoIngreso}>
                  <td>
                    <button className="text-button" onClick={() => onSelect(e)}>
                      {e.paciente}
                    </button>
                  </td>
                  <td>{e.agrupador}<span className="cell-secondary">{count(groups.find((g) => g.idAgrupador === e.idAgrupador)?.cantidadObservaciones ?? 0)} observaciones</span></td>
                  <td>{count(e.diasEstancia)}</td>
                  <td>{amount(e.totalFacturadoCabecera)}</td>
                  <td>
                    {outliers.has(e.consecutivoIngreso) ? "Atípico" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
        <ChartCard
          label="04 · PARETO DE SERVICIOS"
          title={
            costs.length && costs.at(-1)?.cumulativePct != null
              ? `Los ${costs.length} principales concentran ${percent(costs.at(-1)!.cumulativePct)}`
              : "Los servicios con mayor valor reportado"
          }
          note={`Denominador: ${amount(data.paretoUniverso.valorTotal)} del universo completo de ${count(data.paretoUniverso.totalServicios)} registros. Resto fuera del top 10: ${amount(data.paretoUniverso.restoTop10)}. Valores brutos sin descontar repeticiones.`}
          option={costChart}
          empty={!costs.length}
        >
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Servicio / tipo de origen</th>
                <th>Cantidad</th>
                <th>Valor COP</th>
                <th>Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((c, i) => (
                <tr key={`${c.nombre}-${c.tipo}`}>
                  <td>{i + 1}</td>
                  <td>
                    {c.nombre}
                    <span className="cell-secondary">{c.tipo}</span>
                  </td>
                  <td>{count(c.cantidad)}</td>
                  <td>{amount(c.valorTotal)}</td>
                  <td>{percent(c.cumulativePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
        <ChartCard label="05 · CAUSAS DE DESVIACIÓN" title="Volumen, valor por evento y base presupuestal"
          note="Volumen = (eventos reales − contratados) × CME contratado. Valor = facturado − eventos reales × CME. Base = eventos contratados × CME − límite. La suma explica facturado − límite; no acredita severidad clínica."
          option={drivers} empty={!driverGroups.length} height={Math.max(290, driverGroups.length * 35 + 80)}>
          <table><thead><tr><th>Agrupador</th><th>Efecto volumen COP</th><th>Efecto valor COP</th><th>Diferencia de base COP</th><th>Facturado − límite COP</th></tr></thead>
            <tbody>{groups.map((g) => <tr key={g.idAgrupador}><td>{g.nombre}</td><td>{amount(g.efectoVolumen)}</td><td>{amount(g.efectoValor)}</td><td>{amount(g.diferenciaPresupuestoImplicito)}</td><td>{amount(g.totalFacturado == null || g.limitePresupuestal == null ? null : g.totalFacturado - g.limitePresupuestal)}</td></tr>)}</tbody>
          </table>
        </ChartCard>
        <ChartCard label="06 · CONCENTRACIÓN DE FACTURACIÓN" title="Qué parte se concentra en pocos episodios"
          note={`Denominador: ${amount(data.concentracion.totalFacturadoEpisodios)} de cabeceras de ${count(data.concentracion.cantidadEpisodios)} episodios. Son dos selecciones independientes que pueden superponerse; no se suman. El 10 % superior redondea su cantidad hacia arriba.`}
          option={concentration} empty={concentrationRows.every((r) => r.value == null)}>
          <table><thead><tr><th>Selección</th><th>Episodios</th><th>Participación</th><th>Resto</th></tr></thead>
            <tbody>{concentrationRows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{count(row.count)}</td><td>{percent(row.value)}</td><td>{percent(row.value == null ? null : 100 - row.value)}</td></tr>)}</tbody>
          </table>
        </ChartCard>
      </div>
    </section>
  );
}
