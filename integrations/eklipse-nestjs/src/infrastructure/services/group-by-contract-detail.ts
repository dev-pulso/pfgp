type ContractDetailRow = {
  detalleContratoId: number;
  nombreContrato: string;
};

/** The checkpoint belongs to GENDETCON, regardless of its parent's code or label. */
export function groupByContractDetail<T extends ContractDetailRow>(rows: readonly T[]) {
  const groups = new Map<number, { key: number; name: string; rows: T[] }>();
  for (const row of rows) {
    const group = groups.get(row.detalleContratoId);
    if (group) group.rows.push(row);
    else groups.set(row.detalleContratoId, {
      key: row.detalleContratoId, name: row.nombreContrato, rows: [row],
    });
  }
  return [...groups.values()];
}
