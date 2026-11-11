import type { Branch, Employee, Punch } from './fichadas';

const BRANCHES_KEY = 'fichada_branches';
const EMPLOYEES_KEY = 'fichada_employees';
const PUNCHES_KEY = 'fichada_punches';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const valor = JSON.parse(raw) as unknown;
    // Un `"null"`, un número o un objeto en el lugar de la lista dejaban la
    // pantalla en blanco al hacer `.map`. Si no es un array, se usa el default.
    if (Array.isArray(fallback) && !Array.isArray(valor)) return fallback;
    return valor as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getBranches(): Branch[] {
  return read<Branch[]>(BRANCHES_KEY, []);
}

export function saveBranches(branches: Branch[]) {
  write(BRANCHES_KEY, branches);
}

export function getEmployees(): Employee[] {
  return read<Employee[]>(EMPLOYEES_KEY, []);
}

export function saveEmployees(employees: Employee[]) {
  write(EMPLOYEES_KEY, employees);
}

export function getPunches(): Punch[] {
  return read<Punch[]>(PUNCHES_KEY, []);
}

export function savePunches(punches: Punch[]) {
  write(PUNCHES_KEY, punches);
}

export function clearStorage() {
  localStorage.removeItem(BRANCHES_KEY);
  localStorage.removeItem(EMPLOYEES_KEY);
  localStorage.removeItem(PUNCHES_KEY);
}
