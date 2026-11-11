import { beforeEach, describe, expect, it } from 'vitest';
import { getBranches, getEmployees, getPunches } from './storage';

/** localStorage de mentira para probar la lectura defensiva. */
function montarStorage(valores: Record<string, string>) {
  const datos = new Map(Object.entries(valores));
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (clave: string) => datos.get(clave) ?? null,
      setItem: (clave: string, valor: string) => datos.set(clave, valor),
      removeItem: (clave: string) => datos.delete(clave),
    },
  });
}

describe('storage tolera datos corruptos', () => {
  beforeEach(() => montarStorage({}));

  it('devuelve listas vacías si no hay nada guardado', () => {
    expect(getBranches()).toEqual([]);
    expect(getEmployees()).toEqual([]);
    expect(getPunches()).toEqual([]);
  });

  it('un JSON roto no rompe la app', () => {
    montarStorage({ fichada_punches: '{roto', fichada_branches: 'no es json' });
    expect(getPunches()).toEqual([]);
    expect(getBranches()).toEqual([]);
  });

  it('un "null" o un objeto en lugar de la lista devuelve el default', () => {
    montarStorage({
      fichada_branches: 'null',
      fichada_employees: '{"id":1}',
      fichada_punches: '42',
    });
    expect(getBranches()).toEqual([]);
    expect(getEmployees()).toEqual([]);
    expect(getPunches()).toEqual([]);
  });
});
