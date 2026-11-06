from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute

from app.adapters.contract_registration_client import ContractRegistrationClient, ContractRegistrationError
from app.schemas.contract_registration import (
    ContractRegistrationOptions, ContractRegistrationRequest, ContractRegistrationResponse,
)

class RegistrationRoute(APIRoute):
    """Do not echo invalid bodies or extra user-supplied fields in errors."""
    def get_route_handler(self):
        original = super().get_route_handler()
        async def handle(request):
            try:
                return await original(request)
            except RequestValidationError:
                raise HTTPException(status_code=422, detail={
                    "code": "INVALID_CONTRACT_INPUT", "message": "Revisa los datos de la configuración PFGP.",
                }) from None
        return handle


router = APIRouter(prefix="/pfgp-contracts", tags=["Configuración PFGP"], route_class=RegistrationRoute)


def get_contract_registration_client():
    return ContractRegistrationClient()


def registration_error(error):
    return HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})


@router.get("/opciones", response_model=ContractRegistrationOptions)
async def registration_options(
    centroId: int = Query(default=99, ge=99, le=99),
    client: ContractRegistrationClient = Depends(get_contract_registration_client),
):
    try:
        return await client.options()
    except ContractRegistrationError as error:
        raise registration_error(error) from None


@router.post("", response_model=ContractRegistrationResponse, status_code=201)
async def register_contract(
    request: ContractRegistrationRequest,
    client: ContractRegistrationClient = Depends(get_contract_registration_client),
):
    try:
        return await client.create(request)
    except ContractRegistrationError as error:
        raise registration_error(error) from None
