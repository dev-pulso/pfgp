import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, Equals, IsArray, IsInt,
  IsString, Matches, Max, Min, NotEquals, ValidateBy, ValidateNested,
} from 'class-validator';

export const MONEY_MAX = '922337203685477.5807';
export const EVENTS_MAX = '9999999999999999.99';

/** Decimal strings preserve SQL Server money's four decimal places. */
export function validPositiveDecimal(value: unknown, scale: number, maximum: string): boolean {
  if (typeof value !== 'string' || value.length > 24 ||
      !new RegExp(`^(0|[1-9]\\d*)(\\.\\d{1,${scale}})?$`).test(value)) return false;
  const units = (text: string) => {
    const [whole, fraction = ''] = text.split('.');
    return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'));
  };
  return units(value) > 0n && units(value) <= units(maximum);
}

function PositiveDecimal(scale: number, maximum: string): PropertyDecorator {
  return ValidateBy({
    name: 'positiveDecimal',
    validator: { validate: value => validPositiveDecimal(value, scale, maximum) },
  });
}

export function validCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // SQL Server datetime (legacy entity's default date type) starts in 1753.
  if (value < '1753-01-01' || value > '9999-12-31') return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export class AgrupadorContratoPfgpDto {
  @IsInt() @Min(1) @Max(2147483647) @NotEquals(1)
  agrupadorId!: number;

  @IsString() @PositiveDecimal(4, MONEY_MAX)
  limite!: string;

  @IsString() @PositiveDecimal(2, EVENTS_MAX)
  cantidadEventosContratados!: string;
}

export class CrearContratoPfgpDto {
  @Equals(99)
  centroId!: 99;

  @IsInt() @Min(1) @Max(2147483647)
  contratoId!: number;

  @IsString() @PositiveDecimal(4, MONEY_MAX)
  valor!: string;

  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaInicio!: string;

  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaFin!: string;

  @IsInt() @Min(0) @Max(2147483647)
  keyAgrupadorServicio!: number;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ArrayUnique((group: AgrupadorContratoPfgpDto) => group.agrupadorId)
  @ValidateNested({ each: true }) @Type(() => AgrupadorContratoPfgpDto)
  agrupadores!: AgrupadorContratoPfgpDto[];
}
