import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ConflictException, ForbiddenException, Injectable, ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BaseSource } from '@common/infrastructure/services';
import { CrearContratoPfgpDto, validCalendarDate } from '../../application/dto/crear-contrato-pfgp.dto';

type ContractRow = { id: number; codigo: string; nombre: string; configurado?: boolean | number };
type MappingRow = { tipo: number; agrupadorId: number };

const invalid = (code: string, message: string) => new UnprocessableEntityException({ code, message });

@Injectable()
export class ContratosPfgpService extends BaseSource {
  private async requireWriteAuthority(): Promise<void> {
    const authority = process.env.PFGP_CONTRACT_WRITE_AUTHORITY?.trim();
    if (!authority) throw new ServiceUnavailableException({
      code: 'CONTRACT_REGISTRATION_UNAVAILABLE',
      message: 'El registro PFGP no está habilitado.',
    });
    // Bound the inherited permission lookup. A late resolution cannot continue to SQL.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let allowed: boolean;
    try {
      allowed = await Promise.race([
        this.hasAnyAuthority([authority]),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Permission timeout')), 5000); }),
      ]);
    } catch {
      throw new ServiceUnavailableException({
        code: 'CONTRACT_REGISTRATION_UNAVAILABLE', message: 'No fue posible comprobar los permisos de configuración.',
      });
    } finally { if (timer) clearTimeout(timer); }
    if (!allowed) throw new ForbiddenException({
      code: 'CONTRACT_WRITE_FORBIDDEN', message: 'No tiene permiso para configurar contratos PFGP.',
    });
  }

  async opciones(centroId: number) {
    await this.requireWriteAuthority();
    if (centroId !== 99) throw invalid('INVALID_CONTRACT_INPUT', 'El centro debe ser 99.');
    const contratos: ContractRow[] = await this.conn.query(`
      SELECT d.OID AS id, d.GDECODIGO AS codigo, d.GDENOMBRE AS nombre,
        CAST(CASE WHEN EXISTS (SELECT 1 FROM EKSLNCHPTCONT c WHERE c.GENDETCON = d.OID)
          THEN 1 ELSE 0 END AS bit) AS configurado
      FROM GENDETCON d ORDER BY d.GDECODIGO, d.OID`);
    const agrupadores: { id: number; nombre: string }[] = await this.conn.query(`
      SELECT OID AS id, NOMBRE AS nombre FROM EKSLNAGRUPD WHERE OID <> 1 ORDER BY NOMBRE, OID`);
    const mappings: MappingRow[] = await this.conn.query(`
      SELECT DISTINCT s.TIPO AS tipo, s.EKSLNAGRUPD AS agrupadorId
      FROM EKSLNAGRUSERVTIP s JOIN EKSLNAGRUPD a ON a.OID = s.EKSLNAGRUPD
      WHERE s.TIPO >= 0 AND s.EKSLNAGRUPD <> 1 ORDER BY s.TIPO, s.EKSLNAGRUPD`);
    const types = new Map<number, number[]>();
    mappings.forEach(row => types.set(row.tipo, [...(types.get(row.tipo) ?? []), row.agrupadorId]));
    return {
      centroId: 99 as const,
      contratos: contratos.map(c => ({ id: c.id, codigo: c.codigo.trim(), nombre: c.nombre.trim(), configurado: Boolean(c.configurado) })),
      tipos: [...types].map(([id, agrupadorIds]) => ({ id, agrupadorIds })),
      agrupadores: agrupadores.map(a => ({ id: a.id, nombre: a.nombre.trim() })),
    };
  }

  async crear(input: CrearContratoPfgpDto) {
    await this.requireWriteAuthority();
    const dto = plainToInstance(CrearContratoPfgpDto, input);
    if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }).length ||
        !validCalendarDate(dto.fechaInicio) || !validCalendarDate(dto.fechaFin) || dto.fechaInicio > dto.fechaFin) {
      throw invalid('INVALID_CONTRACT_INPUT', 'Revise los importes, las fechas y los agrupadores.');
    }
    // The existing reader chooses the first checkpoint, so v1 allows only one per GENDETCON.
    // Hold the master row's update lock until commit to serialize concurrent creates.
    return this.conn.transaction('SERIALIZABLE', async manager => {
      const contracts: ContractRow[] = await manager.query(`
        SELECT OID AS id, GDECODIGO AS codigo, GDENOMBRE AS nombre
        FROM GENDETCON WITH (UPDLOCK, HOLDLOCK) WHERE OID = @0`, [dto.contratoId]);
      if (!contracts.length) throw invalid('INVALID_CONTRACT_REFERENCE', 'El contrato seleccionado no existe.');
      const existing: { id: number }[] = await manager.query(
        'SELECT OID AS id FROM EKSLNCHPTCONT WITH (UPDLOCK, HOLDLOCK) WHERE GENDETCON = @0', [dto.contratoId]);
      if (existing.length) throw new ConflictException({
        code: 'CONTRACT_ALREADY_CONFIGURED', message: 'Este contrato ya tiene una configuración PFGP.',
      });
      const mappings: { agrupadorId: number }[] = await manager.query(`
        SELECT DISTINCT s.EKSLNAGRUPD AS agrupadorId FROM EKSLNAGRUSERVTIP s
        JOIN EKSLNAGRUPD a ON a.OID = s.EKSLNAGRUPD
        WHERE s.TIPO = @0 AND s.EKSLNAGRUPD <> 1`, [dto.keyAgrupadorServicio]);
      if (!mappings.length) throw invalid('INVALID_SERVICE_TYPE', 'La clasificación de servicios no está disponible.');
      const allowed = new Set(mappings.map(m => m.agrupadorId));
      if (dto.agrupadores.some(a => !allowed.has(a.agrupadorId))) {
        throw invalid('INVALID_GROUP_REFERENCE', 'Un agrupador no pertenece a la clasificación seleccionada.');
      }
      // Bind decimal strings and CAST in SQL, avoiding a JavaScript Number round trip.
      const created: { id: number }[] = await manager.query(`
        INSERT INTO EKSLNCHPTCONT (GENDETCON, VALCONTRA, FECHINI, FECHFIN, KEYAGRUSERVTIP)
        OUTPUT INSERTED.OID AS id
        VALUES (@0, CAST(@1 AS money), CONVERT(datetime, @2, 23), CONVERT(datetime, @3, 23), @4)`,
        [dto.contratoId, dto.valor, dto.fechaInicio, dto.fechaFin, dto.keyAgrupadorServicio]);
      const id = created[0]?.id;
      if (!Number.isInteger(id) || id <= 0) throw new Error('Missing checkpoint identity');
      for (const group of dto.agrupadores) {
        await manager.query(`
          INSERT INTO EKSLNAGRUCONT (EKSLNCHPTCONT, EKSLNAGRUPD, LIMITE, CANTEVENTOS)
          VALUES (@0, @1, CAST(@2 AS money), CAST(@3 AS decimal(18, 2)))`,
          [id, group.agrupadorId, group.limite, group.cantidadEventosContratados]);
      }
      return {
        centroId: 99 as const, configuracionId: id, contratoId: dto.contratoId,
        codigoContrato: contracts[0].codigo.trim(), nombreContrato: contracts[0].nombre.trim(),
        valor: dto.valor, fechaInicio: dto.fechaInicio, fechaFin: dto.fechaFin,
        keyAgrupadorServicio: dto.keyAgrupadorServicio,
        agrupadores: dto.agrupadores.map(a => ({
          agrupadorId: a.agrupadorId, limite: a.limite, cantidadEventosContratados: a.cantidadEventosContratados,
        })),
      };
    });
  }
}
