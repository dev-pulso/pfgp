"""Public schemas for configuring an existing Eklipse contract as PFGP."""
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

PositiveId = Annotated[int, Field(strict=True, gt=0, le=2147483647)]
ServiceTypeId = Annotated[int, Field(strict=True, ge=0, le=2147483647)]
CalendarDate = Annotated[str, StringConstraints(strict=True, pattern=r"^\d{4}-\d{2}-\d{2}$")]
Money = Annotated[str, StringConstraints(strict=True, max_length=24, pattern=r"^(?:0|[1-9]\d*)(?:\.\d{1,4})?$")]
Events = Annotated[str, StringConstraints(strict=True, max_length=24, pattern=r"^(?:0|[1-9]\d*)(?:\.\d{1,2})?$")]
PublicText = Annotated[str, StringConstraints(strict=True, max_length=1000)]
MAX_MONEY = Decimal("922337203685477.5807")
MAX_EVENTS = Decimal("9999999999999999.99")


def positive_decimal(value: str, maximum: Decimal) -> str:
    number = Decimal(value)
    if not ZERO < number <= maximum:
        raise ValueError("El importe debe ser positivo y estar dentro del máximo permitido.")
    return value


ZERO = Decimal(0)


class RegistrationGroup(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agrupadorId: PositiveId
    limite: Money
    cantidadEventosContratados: Events

    @field_validator("agrupadorId")
    @classmethod
    def not_synthetic_event(cls, value):
        if value == 1:
            raise ValueError("EVENTOS es un agrupador sintético reservado.")
        return value

    @field_validator("limite")
    @classmethod
    def valid_limit(cls, value):
        return positive_decimal(value, MAX_MONEY)

    @field_validator("cantidadEventosContratados")
    @classmethod
    def valid_events(cls, value):
        return positive_decimal(value, MAX_EVENTS)


class ContractRegistrationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    centroId: Literal[99]
    contratoId: PositiveId
    valor: Money
    fechaInicio: CalendarDate
    fechaFin: CalendarDate
    keyAgrupadorServicio: ServiceTypeId
    agrupadores: Annotated[list[RegistrationGroup], Field(min_length=1, max_length=100)]

    @field_validator("valor")
    @classmethod
    def valid_value(cls, value):
        return positive_decimal(value, MAX_MONEY)

    @field_validator("fechaInicio", "fechaFin")
    @classmethod
    def actual_calendar_date(cls, value):
        if date.fromisoformat(value) < date(1753, 1, 1):
            raise ValueError("La fecha debe ser compatible con el calendario SQL del origen.")
        return value

    @model_validator(mode="after")
    def consistent_configuration(self):
        if self.fechaInicio > self.fechaFin:
            raise ValueError("La fecha inicial no puede superar la final.")
        ids = [group.agrupadorId for group in self.agrupadores]
        if len(ids) != len(set(ids)):
            raise ValueError("Los agrupadores no pueden repetirse.")
        return self


class RegistrationGroupResponse(RegistrationGroup):
    model_config = ConfigDict(extra="ignore")


class ContractRegistrationResponse(ContractRegistrationRequest):
    model_config = ConfigDict(extra="ignore")
    configuracionId: PositiveId
    codigoContrato: PublicText
    nombreContrato: PublicText
    agrupadores: Annotated[list[RegistrationGroupResponse], Field(min_length=1, max_length=100)]


class ContractOption(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: PositiveId
    codigo: PublicText
    nombre: PublicText
    configurado: Annotated[bool, Field(strict=True)]


class GroupOption(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: PositiveId
    nombre: PublicText


class ServiceTypeOption(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: ServiceTypeId
    agrupadorIds: list[PositiveId]


class ContractRegistrationOptions(BaseModel):
    model_config = ConfigDict(extra="ignore")
    centroId: Literal[99]
    contratos: list[ContractOption]
    tipos: list[ServiceTypeOption]
    agrupadores: list[GroupOption]

    @model_validator(mode="after")
    def unique_reference_ids(self):
        for rows in (self.contratos, self.tipos, self.agrupadores):
            ids = [row.id for row in rows]
            if len(ids) != len(set(ids)):
                raise ValueError("El origen devolvió referencias repetidas.")
        return self
