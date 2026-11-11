import { describe, expect, it } from 'vitest';
import {
  calculateRecordsForPunches,
  createPunch,
  dayKey,
  distanceToBranch,
  endOfWeek,
  getOpenPunch,
  haversine,
  isWithinBranch,
  recordsByDay,
  recordsByWeek,
  startOfWeek,
  weeklySummary,
} from './fichadas';
import type { Branch, Employee, Punch } from './fichadas';

const branchCentro: Branch = {
  id: 'b1',
  name: 'Sucursal Centro',
  lat: -34.603722,
  lng: -58.381592,
  radiusMeters: 200,
};

const branchNorte: Branch = {
  id: 'b2',
  name: 'Sucursal Norte',
  lat: -34.472,
  lng: -58.513,
  radiusMeters: 200,
};

const employee: Employee = { id: 'e1', name: 'Ana' };

function makePunch(
  type: Punch['type'],
  iso: string,
  status: Punch['status'] = 'ok'
): Punch {
  return {
    id: `${type}-${iso}`,
    employeeId: employee.id,
    branchId: branchCentro.id,
    type,
    timestamp: iso,
    status,
  };
}

describe('geolocalización', () => {
  it('la distancia haversine de un punto a sí mismo es 0', () => {
    expect(haversine(-34.6, -58.38, -34.6, -58.38)).toBe(0);
  });

  it('calcula la distancia aproximada entre dos puntos conocidos', () => {
    // Distancia aproximada entre las dos sucursales demo ~ 16.5 km
    const d = haversine(branchCentro.lat, branchCentro.lng, branchNorte.lat, branchNorte.lng);
    expect(d).toBeGreaterThan(18_000);
    expect(d).toBeLessThan(20_000);
  });

  it('detecta que una ubicación está dentro del perímetro', () => {
    expect(isWithinBranch(branchCentro.lat, branchCentro.lng, branchCentro)).toBe(true);
  });

  it('detecta que una ubicación está fuera del perímetro', () => {
    expect(isWithinBranch(branchNorte.lat, branchNorte.lng, branchCentro)).toBe(false);
  });
});

describe('creación de fichadas', () => {
  it('agrega una entrada correctamente', () => {
    const result = createPunch([], employee.id, branchCentro.id, 'in', new Date('2026-11-11T08:00:00'), undefined, [branchCentro]);
    expect(result.error).toBeUndefined();
    expect(result.punches).toHaveLength(1);
    expect(result.punches[0].type).toBe('in');
  });

  it('impide una nueva entrada si ya hay una abierta', () => {
    const initial = [makePunch('in', '2026-11-11T08:00:00Z')];
    const result = createPunch(initial, employee.id, branchCentro.id, 'in', new Date('2026-11-11T10:00:00Z'), undefined, [branchCentro]);
    expect(result.error).toBe('Ya existe una entrada abierta.');
    expect(result.punches).toHaveLength(1);
  });

  it('impide una salida sin entrada previa', () => {
    const result = createPunch([], employee.id, branchCentro.id, 'out', new Date('2026-11-11T17:00:00Z'), undefined, [branchCentro]);
    expect(result.error).toBe('No hay una entrada abierta para cerrar.');
  });

  it('cierra la entrada abierta con una salida', () => {
    const initial = [makePunch('in', '2026-11-11T08:00:00Z')];
    const result = createPunch(initial, employee.id, branchCentro.id, 'out', new Date('2026-11-11T17:00:00Z'), undefined, [branchCentro]);
    expect(result.error).toBeUndefined();
    expect(result.punches).toHaveLength(2);
    expect(result.punches[1].type).toBe('out');
    expect(result.record?.hours).toBe(9);
  });

  it('marca out_of_bounds cuando la ubicación está fuera del radio', () => {
    const result = createPunch(
      [],
      employee.id,
      branchCentro.id,
      'in',
      new Date('2026-11-11T08:00:00Z'),
      { lat: branchNorte.lat, lng: branchNorte.lng },
      [branchCentro]
    );
    expect(result.punches[0].status).toBe('out_of_bounds');
    expect(result.punches[0].distanceMeters).toBeGreaterThan(branchCentro.radiusMeters);
  });
});

describe('cálculo de registros', () => {
  it('calcula horas trabajadas con cruce de medianoche', () => {
    const punches = [
      makePunch('in', '2026-11-10T22:00:00Z'),
      makePunch('out', '2026-11-11T02:00:00Z'),
    ];
    const records = calculateRecordsForPunches(punches);
    expect(records[0].hours).toBe(4);
  });

  it('calcula horas extra cuando la jornada supera las 8 horas', () => {
    const punches = [
      makePunch('in', '2026-11-11T08:00:00Z'),
      makePunch('out', '2026-11-11T18:00:00Z'),
    ];
    const records = calculateRecordsForPunches(punches);
    expect(records[0].hours).toBe(10);
    expect(records[0].overtime).toBe(2);
  });

  it('marca como no_exit una entrada sin salida', () => {
    const punches = [makePunch('in', '2026-11-11T08:00:00Z')];
    const records = calculateRecordsForPunches(punches);
    expect(records[0].status).toBe('no_exit');
    expect(records[0].hours).toBe(0);
  });

  it('devuelve la entrada abierta de un empleado', () => {
    const punches = [
      makePunch('in', '2026-11-11T08:00:00Z'),
      makePunch('out', '2026-11-11T12:00:00Z'),
      makePunch('in', '2026-11-11T13:00:00Z'),
    ];
    expect(getOpenPunch(punches, employee.id)?.timestamp).toBe('2026-11-11T13:00:00Z');
  });
});

describe('agrupación por día y semana', () => {
  it('filtra los registros por día', () => {
    const punches = [
      makePunch('in', '2026-11-11T08:00:00Z'),
      makePunch('out', '2026-11-11T16:00:00Z'),
      makePunch('in', '2026-11-12T08:00:00Z'),
      makePunch('out', '2026-11-12T16:00:00Z'),
    ];
    expect(recordsByDay(new Date('2026-11-11T00:00:00'), punches)).toHaveLength(1);
  });

  it('filtra los registros por semana', () => {
    const punches = [
      makePunch('in', '2026-11-09T08:00:00Z'), // lunes
      makePunch('out', '2026-11-09T16:00:00Z'),
      makePunch('in', '2026-11-16T08:00:00Z'), // lunes siguiente
      makePunch('out', '2026-11-16T16:00:00Z'),
    ];
    expect(recordsByWeek(new Date('2026-11-09T00:00:00'), punches)).toHaveLength(1);
  });

  it('resume horas totales y extras por empleado en la semana', () => {
    const punches = [
      makePunch('in', '2026-11-09T08:00:00Z'),
      makePunch('out', '2026-11-09T18:00:00Z'),
      makePunch('in', '2026-11-10T08:00:00Z'),
      makePunch('out', '2026-11-10T16:00:00Z'),
    ];
    const summary = weeklySummary(new Date('2026-11-09T00:00:00'), punches);
    expect(summary).toHaveLength(1);
    expect(summary[0].totalHours).toBe(18);
    expect(summary[0].totalOvertime).toBe(2);
  });
});

describe('utilidades de fecha', () => {
  it('devuelve la clave yyyy-mm-dd de una fecha', () => {
    expect(dayKey(new Date('2026-11-11T15:30:00'))).toBe('2026-11-11');
  });

  it('calcula el inicio y fin de semana correctamente', () => {
    const start = startOfWeek(new Date('2026-11-11T00:00:00'));
    const end = endOfWeek(new Date('2026-11-11T00:00:00'));
    expect(start.getDay()).toBe(1); // lunes
    expect(end.getDay()).toBe(0); // domingo
    expect(end.getDate() - start.getDate()).toBe(6);
  });
});
