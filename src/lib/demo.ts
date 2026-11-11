import type { Branch, Employee, Punch } from './fichadas';
import {
  getBranches,
  getEmployees,
  getPunches,
  saveBranches,
  saveEmployees,
  savePunches,
} from './storage';

export const DEMO_BRANCHES: Branch[] = [
  {
    id: 'branch-centro',
    name: 'Sucursal Centro',
    lat: -34.603722,
    lng: -58.381592,
    radiusMeters: 200,
  },
  {
    id: 'branch-norte',
    name: 'Sucursal Norte',
    lat: -34.472,
    lng: -58.513,
    radiusMeters: 200,
  },
];

export const DEMO_EMPLOYEES: Employee[] = [
  { id: 'emp-ana', name: 'Ana Gómez' },
  { id: 'emp-bruno', name: 'Bruno Díaz' },
  { id: 'emp-carla', name: 'Carla Ruiz' },
];

function makePunch(
  employeeId: string,
  branchId: string,
  type: 'in' | 'out',
  offsetDays: number,
  hour: number,
  minute: number,
  status: Punch['status'] = 'ok'
): Punch {
  const now = new Date();
  const d = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + offsetDays,
    hour,
    minute
  );
  return {
    id: `${employeeId}-${type}-${+d}`,
    employeeId,
    branchId,
    type,
    timestamp: d.toISOString(),
    status,
  };
}

function samplePunches(): Punch[] {
  const bCentro = DEMO_BRANCHES[0].id;
  const bNorte = DEMO_BRANCHES[1].id;
  return [
    // Ana: today, within hours
    makePunch('emp-ana', bCentro, 'in', 0, 8, 30),
    makePunch('emp-ana', bCentro, 'out', 0, 17, 0),
    // Bruno: today, overtime
    makePunch('emp-bruno', bCentro, 'in', 0, 7, 0),
    makePunch('emp-bruno', bCentro, 'out', 0, 19, 30),
    // Carla: yesterday normal
    makePunch('emp-carla', bNorte, 'in', -1, 9, 0),
    makePunch('emp-carla', bNorte, 'out', -1, 17, 30),
    // Ana: yesterday out of bounds
    makePunch('emp-ana', bNorte, 'in', -1, 8, 0, 'out_of_bounds'),
    makePunch('emp-ana', bNorte, 'out', -1, 16, 0, 'out_of_bounds'),
  ];
}

export interface DemoData {
  branches: Branch[];
  employees: Employee[];
  punches: Punch[];
}

export function getInitialData(): DemoData {
  const employees = getEmployees();
  const branches = getBranches();
  const punches = getPunches();

  if (employees.length === 0 && branches.length === 0 && punches.length === 0) {
    const demoPunches = samplePunches();
    saveBranches(DEMO_BRANCHES);
    saveEmployees(DEMO_EMPLOYEES);
    savePunches(demoPunches);
    return {
      branches: DEMO_BRANCHES,
      employees: DEMO_EMPLOYEES,
      punches: demoPunches,
    };
  }

  return { branches, employees, punches };
}

export function seedDemoData() {
  getInitialData();
}
