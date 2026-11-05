from datetime import date
from fastapi import FastAPI, Depends, HTTPException, Response, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.schemas.pfgp_schemas import PfgpQuerySchema, AnalyticsReportResponse, ContractsResponse
from app.adapters.eklipse_client import EklipseClient, EklipseAuthError
from app.services.pfgp_analytics_service import PfgpAnalyticsService, NoDataError, MultipleContractsError, StaleReportError
from app.schemas.pfgp_schemas import SimulacionRequest, SimulacionResponse, PatientDrillDownResponse

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Motor analítico y de auditoría forense para contratos PFGP del Grupo Clínica Médicos (Eklipse).",
    version=settings.VERSION
)

# Configurar CORS para el frontend (Angular, React, Vue o Streamlit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Accept", "Content-Type"],
    expose_headers=["X-PFGP-Privacy"],
)
@app.middleware("http")
async def private_responses(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


def get_query(inicio: date, final: date, centroId: int = Query(default=99, ge=99, le=99)):
    if inicio > final:
        raise HTTPException(status_code=422, detail="La fecha inicial debe ser anterior o igual a la final.")
    return PfgpQuerySchema(inicio=inicio.isoformat(), final=final.isoformat(), centroId=centroId)

def get_analytics_service():
    client = EklipseClient()
    return PfgpAnalyticsService(client)

def source_error(error: Exception) -> HTTPException:
    if isinstance(error, NoDataError):
        return HTTPException(status_code=404, detail="Sin datos para el contrato o rango seleccionado.")
    if isinstance(error, MultipleContractsError):
        return HTTPException(status_code=409, detail="El origen devolvió identificadores de contrato repetidos. Revisa la integridad del catálogo.")
    if isinstance(error, StaleReportError):
        return HTTPException(status_code=409, detail="El corte cambió. Actualiza el informe antes de abrir el detalle.")
    if isinstance(error, EklipseAuthError):
        return HTTPException(status_code=503, detail={"code": "SOURCE_AUTH_REQUIRED", "message": "Configura o renueva EKLIPSE_TOKEN en el backend."})
    return HTTPException(status_code=502, detail="No se pudo obtener un informe válido de Eklipse. Revisa la conexión y configuración local.")


@app.get(f"{settings.API_V1_STR}/pfgp-analytics/contratos", response_model=ContractsResponse)
async def get_contracts(
    response: Response,
    query: PfgpQuerySchema = Depends(get_query),
    service: PfgpAnalyticsService = Depends(get_analytics_service)
):
    try:
        catalog = await service.list_contracts(query.inicio, query.final, query.centroId)
        validated = ContractsResponse.model_validate(catalog)
        response.headers["X-PFGP-Privacy"] = "aliases-v1"
        return validated
    except Exception as error:
        raise source_error(error) from None


@app.get(f"{settings.API_V1_STR}/pfgp-analytics/dashboard", response_model=AnalyticsReportResponse | ContractsResponse)
async def get_dashboard_data(
    response: Response,
    idContrato: int | None = Query(default=None, ge=1),
    query: PfgpQuerySchema = Depends(get_query),
    service: PfgpAnalyticsService = Depends(get_analytics_service)
):
    try:
        report = await service.generate_contract_report(
            inicio=query.inicio,
            final=query.final,
            centro_id=query.centroId,
            id_contrato=idContrato,
        )
        model = ContractsResponse if "contratos" in report else AnalyticsReportResponse
        validated = model.model_validate(report)
        response.headers["X-PFGP-Privacy"] = "aliases-v1"
        return validated
    except Exception as error:
        raise source_error(error) from None

@app.post(f"{settings.API_V1_STR}/pfgp-analytics/simulador-exclusiones", response_model=SimulacionResponse)
async def simular_exclusiones_pfgp(
    req: SimulacionRequest,
    response: Response,
    service: PfgpAnalyticsService = Depends(get_analytics_service)
):
    try:
        result = SimulacionResponse.model_validate(await service.simulate_exclusions(req))
        response.headers["X-PFGP-Privacy"] = "aliases-v1"
        return result
    except Exception as error:
        raise source_error(error) from None


@app.get(f"{settings.API_V1_STR}/pfgp-analytics/episodio/{{consecutivo_ingreso}}", response_model=PatientDrillDownResponse)
async def get_patient_drilldown(
    response: Response,
    consecutivo_ingreso: int = Path(ge=1),
    idContrato: int = Query(ge=1),
    revision: str = Query(pattern=r"^[a-f0-9]{64}$"),
    query: PfgpQuerySchema = Depends(get_query),
    service: PfgpAnalyticsService = Depends(get_analytics_service)
):
    try:
        result = await service.get_patient_drilldown(
            query.inicio, query.final, query.centroId, consecutivo_ingreso, idContrato, revision,
        )
        validated = PatientDrillDownResponse.model_validate(result)
        response.headers["X-PFGP-Privacy"] = "aliases-v1"
        return validated
    except Exception as error:
        raise source_error(error) from None

@app.get("/health")
async def health_check():
    return {"status": "ok", "project": settings.PROJECT_NAME, "version": settings.VERSION}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
