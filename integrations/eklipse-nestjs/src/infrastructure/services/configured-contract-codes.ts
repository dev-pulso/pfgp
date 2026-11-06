import { DataSource } from 'typeorm';

/** Preserve legacy codes and include PFGP configurations in the authenticated context's DB. */
export async function configuredContractCodes(
  conn: DataSource,
  legacyCodes: string[],
  checkpoints?: readonly { codigoContrato: string }[],
): Promise<string[]> {
  if (checkpoints !== undefined) {
    return [...new Set([...legacyCodes, ...checkpoints.map(c => c.codigoContrato.trim())].filter(Boolean))];
  }
  const configured: { codigo: string }[] = await conn.query(`
    SELECT DISTINCT d.GDECODIGO AS codigo FROM GENDETCON d
    JOIN EKSLNCHPTCONT c ON c.GENDETCON = d.OID`);
  return [...new Set([...legacyCodes, ...configured.map(c => c.codigo.trim())].filter(Boolean))];
}
