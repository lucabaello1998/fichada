export interface Branch {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface Employee {
  id: string;
  name: string;
}

export type PunchType = 'in' | 'out';

export interface Punch {
  id: string;
  employeeId: string;
  branchId: string;
  type: PunchType;
  timestamp: string; // ISO
  lat?: number;
  lng?: number;
  distanceMeters?: number;
  status: 'ok' | 'out_of_bounds' | 'no_exit';
}

export interface FichadaRecord {
  employeeId: string;
  branchId: string;
  in: Punch;
  out?: Punch;
  hours: number;
  overtime: number;
  status: 'ok' | 'out_of_bounds' | 'no_exit';
}

const EARTH_RADIUS_METERS = 6_371_000;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function distanceToBranch(
  lat: number,
  lng: number,
  branch: Branch
): number {
  return haversine(lat, lng, branch.lat, branch.lng);
}

export function isWithinBranch(
  lat: number,
  lng: number,
  branch: Branch
): boolean {
  return distanceToBranch(lat, lng, branch) <= branch.radiusMeters;
}

export function getOpenPunch(
  punches: Punch[],
  employeeId: string
): Punch | undefined {
  const sorted = punches
    .filter((p) => p.employeeId === employeeId)
    .sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
  let open: Punch | undefined;
  for (const p of sorted) {
    if (p.type === 'in') open = p;
    else if (p.type === 'out') open = undefined;
  }
  return open;
}

export interface CreatePunchResult {
  punches: Punch[];
  record?: FichadaRecord;
  error?: string;
}

export function createPunch(
  punches: Punch[],
  employeeId: string,
  branchId: string,
  type: PunchType,
  now: Date,
  location?: { lat: number; lng: number },
  branches: Branch[] = []
): CreatePunchResult {
  const branch = branches.find((b) => b.id === branchId);

  let distanceMeters: number | undefined;
  let status: Punch['status'] = 'ok';

  if (location && branch) {
    distanceMeters = distanceToBranch(location.lat, location.lng, branch);
    status = distanceMeters <= branch.radiusMeters ? 'ok' : 'out_of_bounds';
  }

  const newPunch: Punch = {
    id: `${+now}-${Math.random().toString(36).slice(2, 7)}`,
    employeeId,
    branchId,
    type,
    timestamp: now.toISOString(),
    lat: location?.lat,
    lng: location?.lng,
    distanceMeters,
    status,
  };

  if (type === 'in') {
    const open = getOpenPunch(punches, employeeId);
    if (open) {
      return { punches, error: 'Ya existe una entrada abierta.' };
    }
    return { punches: [...punches, newPunch] };
  }

  // type === 'out'
  const open = getOpenPunch(punches, employeeId);
  if (!open) {
    return { punches, error: 'No hay una entrada abierta para cerrar.' };
  }

  const outPunch: Punch = { ...newPunch };
  const withOut = [...punches, outPunch];

  const record: FichadaRecord = {
    employeeId,
    branchId: open.branchId,
    in: open,
    out: outPunch,
    ...recordStats(open, outPunch),
  };

  return { punches: withOut, record };
}

function recordStats(
  inPunch: Punch,
  outPunch: Punch
): { hours: number; overtime: number; status: Punch['status'] } {
  const ms = +new Date(outPunch.timestamp) - +new Date(inPunch.timestamp);
  const hours = Math.max(0, ms / 3_600_000);
  const overtime = Math.max(0, hours - 8);
  const status: Punch['status'] =
    inPunch.status === 'out_of_bounds' || outPunch.status === 'out_of_bounds'
      ? 'out_of_bounds'
      : 'ok';
  return { hours, overtime, status };
}

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function calculateRecordsForPunches(
  punches: Punch[]
): FichadaRecord[] {
  const sorted = [...punches].sort(
    (a, b) => +new Date(a.timestamp) - +new Date(b.timestamp)
  );
  const records: FichadaRecord[] = [];
  const stack: Punch[] = [];

  for (const p of sorted) {
    if (p.type === 'in') {
      stack.push(p);
    } else if (p.type === 'out' && stack.length) {
      const inPunch = stack.shift()!;
      records.push({
        employeeId: inPunch.employeeId,
        branchId: inPunch.branchId,
        in: inPunch,
        out: p,
        ...recordStats(inPunch, p),
      });
    }
  }

  for (const inPunch of stack) {
    records.push({
      employeeId: inPunch.employeeId,
      branchId: inPunch.branchId,
      in: inPunch,
      hours: 0,
      overtime: 0,
      status: 'no_exit',
    });
  }

  return records;
}

export function recordsByDay(
  date: Date,
  punches: Punch[]
): FichadaRecord[] {
  const key = dayKey(date);
  return calculateRecordsForPunches(punches).filter(
    (r) => dayKey(new Date(r.in.timestamp)) === key
  );
}

export function recordsByWeek(
  date: Date,
  punches: Punch[]
): FichadaRecord[] {
  const start = startOfWeek(date);
  const end = endOfWeek(date);
  return calculateRecordsForPunches(punches).filter((r) => {
    const t = +new Date(r.in.timestamp);
    return t >= +start && t <= +end;
  });
}

export interface WeeklySummary {
  employeeId: string;
  totalHours: number;
  totalOvertime: number;
}

export function weeklySummary(
  date: Date,
  punches: Punch[]
): WeeklySummary[] {
  const records = recordsByWeek(date, punches);
  const map = new Map<string, WeeklySummary>();
  for (const r of records) {
    const entry = map.get(r.employeeId) ?? {
      employeeId: r.employeeId,
      totalHours: 0,
      totalOvertime: 0,
    };
    entry.totalHours += r.hours;
    entry.totalOvertime += r.overtime;
    map.set(r.employeeId, entry);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.employeeId.localeCompare(b.employeeId)
  );
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}
