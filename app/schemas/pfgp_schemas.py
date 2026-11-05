from datetime import date
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
from typing import List, Optional, Literal

class FiniteModel(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)


class PfgpQuerySchema(FiniteModel):
    inicio: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Fecha inicio YYYY-MM-DD")
    final: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Fecha final YYYY-MM-DD")
    centroId: int = Field(default=99, ge=99, le=99, description="Centro fijo 99")

class MetadataResponse(FiniteModel):
    idContrato: int
    codigoContrato: str
    nombreContrato: str
    fechaInicio: str
    fechaFinal: str
    diasCorteAnalizados: int
    avanceTemporalMesPct: float
    revision: str = Field(pattern=r"^[a-f0-9]{64}$")

class KpisGlobalesResponse(FiniteModel):
    presupuestoTotalLimite: float
    totalFacturadoContrato: float
    totalRecuperadoCopagos: float
    tasaRecuperacionPct: float
    ejecucionGlobalPct: float
    burnRateGlobal: float
    proyeccionFacturacion30Dias: float
    indicePresionInsumosGlobalPct: float
    totalEpisodiosAtendidos: int

class AuditoriaCalidadDatosResponse(FiniteModel):
    totalServiciosAnalizados: int
    agrupadoresConCaracteresSucios: int
    serviciosConIdDuplicado: int
    montoInfladoPorDuplicidad: float
    serviciosFacturadosEnCero: int
    lucroCesantePorServiciosEnCero: float
    gastoHuerfanoAgrupadorEventos: float

class AgrupadorKpiResponse(FiniteModel):
    idAgrupador: int
    nombre: str
    peso: float
    limitePresupuestal: float
    totalFacturado: float
    totalRecuperado: float
    porcentajeEjecutado: float
    burnRateRatio: Optional[float]
    proyeccionCierre30Dias: float
    deficitProyectado: Optional[float]
    eventosContratados: float
    iteracionesReportadasAPI: int
    iteracionesRealesJSON: int
    discrepanciaConteoEventos: int
    cumplimientoFrecuenciaPct: Optional[float]
    cmeContratado: Optional[float]
    cmeRealPromedio: float
    estadoAlerta: str

class EpisodioKpiResponse(FiniteModel):
    consecutivoIngreso: int = Field(ge=1, description="Ordinal temporal del informe; no es el ingreso del origen")
    paciente: str = Field(pattern=r"^Episodio \d{4,}$", description="Alias temporal sin identidad personal")
    agrupador: str
    fechaIngreso: str = Field(pattern=r"^$", description="Suprimida por privacidad en el dashboard ejecutivo")
    diasEstancia: int
    totalFacturadoCabecera: float
    sumaServiciosDetalle: float
    discrepanciaIntegridad: float
    montoDuplicadoDetectado: float
    cmeContratado: Optional[float]
    ratioSeveridadCME: Optional[float]
    costoDiarioEstancia: float
    gastoInsumos: float
    indicePresionInsumosPct: float


class ServicioAuditadoResponse(FiniteModel):
    id: str
    codigo: str
    nombre: str
    tipo: Literal["PROCEDIMIENTO/CUPS", "INSUMO/MEDICAMENTO"]
    cantidad: float
    valorProducto: float
    valorTotal: float
    es_duplicado: bool
    es_cero: bool


class AuditoriaEpisodioResponse(FiniteModel):
    serviciosDuplicados: int
    montoDuplicado: float
    serviciosEnCero: int


class PatientDrillDownResponse(FiniteModel):
    inicio: str
    final: str
    centroId: int = Field(ge=99, le=99)
    idContrato: int
    revision: str = Field(pattern=r"^[a-f0-9]{64}$")
    episodio: EpisodioKpiResponse
    auditoriaEpisodio: AuditoriaEpisodioResponse
    servicios: List[ServicioAuditadoResponse]

class ParetoItemResponse(FiniteModel):
    nombre: str
    tipo: str
    cantidad: float
    valorTotal: float

class AnalyticsReportResponse(FiniteModel):
    metadata: MetadataResponse
    kpisGlobales: KpisGlobalesResponse
    auditoriaCalidadDatos: AuditoriaCalidadDatosResponse
    agrupadores: List[AgrupadorKpiResponse]
    episodios: List[EpisodioKpiResponse]
    paretoCostos: List[ParetoItemResponse]


class ContractSummaryResponse(FiniteModel):
    idContrato: int
    codigoContrato: str
    nombreContrato: str
    totalFacturadoContrato: Optional[float]
    presupuestoTotalLimite: Optional[float]
    totalRecuperado: Optional[float]
    cantidadAgrupadores: int


class ContractsResponse(FiniteModel):
    inicio: str
    final: str
    centroId: int = Field(default=99, ge=99, le=99)
    totalContratos: int
    contratos: List[ContractSummaryResponse]

class SimulacionRequest(PfgpQuerySchema):
    idContrato: Optional[int] = Field(default=None, ge=1)
    # Categorías o palabras clave de insumos a excluir de la bolsa PGP
    excluirTerapiaVAC: bool = Field(default=False, description="Excluir Cánisters y Foams de presión negativa")
    excluirLaparoscopiaAvanzada: bool = Field(default=False, description="Excluir Trócares y Endo Shears")
    excluirMallasSling: bool = Field(default=False, description="Excluir Mallas y Slings urológicos")
    # Opcional: lista de nombres exactos seleccionados por el usuario
    insumosExcluidosManuales: List[str] = Field(default_factory=list)

    @field_validator("inicio", "final")
    @classmethod
    def valid_date(cls, value: str) -> str:
        date.fromisoformat(value)
        return value

    @model_validator(mode="after")
    def valid_range(self):
        if self.inicio > self.final:
            raise ValueError("La fecha inicial debe ser anterior o igual a la final.")
        return self

class AgrupadorSimulado(FiniteModel):
    idAgrupador: int
    nombre: str
    limite: float
    facturadoOriginal: float
    montoExcluidoEvento: float
    facturadoSimuladoPGP: float
    ejecucionOriginalPct: float
    ejecucionSimuladaPct: float
    estadoOriginal: str
    estadoSimulado: str

class SimulacionResponse(FiniteModel):
    totalFacturadoOriginal: float
    totalFacturadoSimuladoPGP: float
    totalTrasladadoAEvento: float
    alivioFinancieroPct: float
    agrupadoresRecalculados: List[AgrupadorSimulado]
    topInsumosTrasladados: List[dict]
