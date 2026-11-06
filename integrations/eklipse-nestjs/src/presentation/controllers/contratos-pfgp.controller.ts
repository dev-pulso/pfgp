import { Authorities, CommonGuards } from '@common/presentation/decorators';
import { SLN_AUTHORITIES } from '@authorities/facturacion';
import {
  Body, Controller, Get, HttpCode, Post, Query,
  UnprocessableEntityException, ValidationPipe,
} from '@nestjs/common';
import { CrearContratoPfgpDto } from '../../application/dto/crear-contrato-pfgp.dto';
import { ContratosPfgpService } from '../../infrastructure/services/contratos-pfgp.service';

@CommonGuards()
@Controller('v1/pfgp/contratos')
export class ContratosPfgpController {
  constructor(private readonly service: ContratosPfgpService) {}

  @Get('opciones')
  @Authorities([SLN_AUTHORITIES.INFORMES_GERENCIALES.ESTADISTICO_PFGP])
  opciones(@Query('centroId') centroId: string) {
    if (centroId !== '99') throw new UnprocessableEntityException({
      code: 'INVALID_CONTRACT_INPUT', message: 'El centro debe ser 99.',
    });
    return this.service.opciones(99);
  }

  @Post()
  @HttpCode(201)
  @Authorities([SLN_AUTHORITIES.INFORMES_GERENCIALES.ESTADISTICO_PFGP])
  crear(@Body(new ValidationPipe({
    transform: true, whitelist: true, forbidNonWhitelisted: true,
    forbidUnknownValues: true, transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    exceptionFactory: () => new UnprocessableEntityException({
      code: 'INVALID_CONTRACT_INPUT', message: 'Revise los datos de la configuración.',
    }),
  })) body: CrearContratoPfgpDto) {
    return this.service.crear(body);
  }
}
