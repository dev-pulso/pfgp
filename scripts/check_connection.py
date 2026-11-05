"""Comprobación manual sin guardar ni imprimir respuestas, identidades o excepciones."""
import asyncio
import json
from datetime import datetime
from zoneinfo import ZoneInfo
from app.adapters.eklipse_client import EklipseClient, EklipseAuthError
from app.services.pfgp_analytics_service import PfgpAnalyticsService, NoDataError, MultipleContractsError
from app.schemas.pfgp_schemas import AnalyticsReportResponse, ContractsResponse


async def main():
    today = datetime.now(ZoneInfo("America/Bogota")).date()
    state = "sin_verificar"
    try:
        report = await PfgpAnalyticsService(EklipseClient()).generate_contract_report(
            today.replace(day=1).isoformat(), today.isoformat(), 99
        )
        if "contratos" in report:
            ContractsResponse.model_validate(report)
            state = "catalogo_valido_para_seleccion"
        else:
            AnalyticsReportResponse.model_validate(report)
            state = "informe_valido_con_alias"
    except NoDataError:
        state = "sin_registros"
    except MultipleContractsError:
        state = "identificadores_de_contrato_repetidos"
    except EklipseAuthError:
        state = "token_ausente_o_rechazado"
    except ConnectionError:
        state = "conexion_no_disponible"
    except Exception:
        state = "respuesta_no_valida"
    print(json.dumps({"estado": state, "centroId": 99, "persistencia": False}))


if __name__ == "__main__":
    asyncio.run(main())
