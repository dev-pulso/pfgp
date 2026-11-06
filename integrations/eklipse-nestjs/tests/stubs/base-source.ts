import { DataSource } from 'typeorm';
/** Test boundary only. Production uses the real context-scoped BaseSource. */
export class BaseSource {
  protected conn!: DataSource;
  protected async hasAnyAuthority(_authorities: string[]): Promise<boolean> { return false; }
}
