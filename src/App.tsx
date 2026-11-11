import { useEffect, useMemo, useState } from 'react';
import './App.css';
import {
  createPunch,
  formatHours,
  formatTime,
  getOpenPunch,
  isWithinBranch,
  recordsByDay,
  weeklySummary,
  type Branch,
  type Punch,
} from './lib/fichadas';
import { getInitialData } from './lib/demo';
import { savePunches } from './lib/storage';

type Tab = 'fichar' | 'fichadas' | 'horas';

type GeoState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; lat: number; lng: number; within: boolean; distance: number; branch: Branch }
  | { state: 'error'; message: string };

export default function App() {
  const initial = getInitialData();
  const employees = initial.employees;
  const branches = initial.branches;

  const initialTab = (window.location.hash.replace('#', '') as Tab) || 'fichar';
  const [tab, setTab] = useState<Tab>(['fichar', 'fichadas', 'horas'].includes(initialTab) ? initialTab : 'fichar');
  const [punches, setPunches] = useState<Punch[]>(initial.punches);

  useEffect(() => {
    window.location.hash = tab;
  }, [tab]);

  // El primer empleado viene elegido: la demo arranca lista para tocar "Registrar
  // entrada" en vez de pedir dos selects antes de mostrar nada. La sucursal no,
  // porque elegirla dispara el pedido de ubicación.
  const [selectedEmployee, setSelectedEmployee] = useState(initial.employees[0]?.id ?? '');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [geo, setGeo] = useState<GeoState>({ state: 'idle' });
  // En la demo nadie está parado en las sucursales ficticias (y muchos rechazan el
  // permiso de ubicación): este selector permite probar los tres casos sin GPS.
  const [simulacion, setSimulacion] = useState<'gps' | 'dentro' | 'cerca' | 'lejos'>('gps');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (branches.length && selectedBranch) {
      refreshGeo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch, branches, simulacion]);

  function refreshGeo() {
    if (!selectedBranch) return;
    const branch = branches.find((b) => b.id === selectedBranch);
    if (!branch) return;
    if (simulacion !== 'gps') {
      const metros =
        simulacion === 'dentro' ? 0 : simulacion === 'cerca' ? branch.radiusMeters + 60 : 1500;
      const { lat, lng } = desplazar(branch.lat, branch.lng, metros);
      setGeo({
        state: 'ok',
        lat,
        lng,
        within: metros <= branch.radiusMeters,
        distance: Math.round(metros),
        branch,
      });
      return;
    }
    if (!navigator.geolocation) {
      setGeo({ state: 'error', message: 'Tu navegador no soporta geolocalización.' });
      return;
    }
    setGeo({ state: 'loading' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const distance = isWithinBranch(latitude, longitude, branch)
          ? 0
          : Math.round(
              // distanceToBranch not exported; use haversine via isWithinBranch? compute inline
              haversine(latitude, longitude, branch.lat, branch.lng)
            );
        setGeo({
          state: 'ok',
          lat: latitude,
          lng: longitude,
          within: distance <= branch.radiusMeters,
          distance,
          branch,
        });
      },
      (err) => setGeo({ state: 'error', message: err.message }),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  const openPunch = useMemo(
    () => (selectedEmployee ? getOpenPunch(punches, selectedEmployee) : undefined),
    [punches, selectedEmployee]
  );

  function handlePunch(type: 'in' | 'out') {
    setMessage(null);
    if (!selectedEmployee || !selectedBranch) {
      setMessage('Seleccioná un empleado y una sucursal.');
      return;
    }
    const branch = branches.find((b) => b.id === selectedBranch);
    const location =
      geo.state === 'ok' ? { lat: geo.lat, lng: geo.lng } : undefined;
    const result = createPunch(
      punches,
      selectedEmployee,
      selectedBranch,
      type,
      new Date(),
      location,
      branch ? [branch] : []
    );
    if (result.error) {
      setMessage(result.error);
      return;
    }
    savePunches(result.punches);
    setPunches(result.punches);
    setMessage(
      type === 'in'
        ? 'Entrada registrada.'
        : `Salida registrada. Jornada: ${formatHours(result.record?.hours ?? 0)}`
    );
  }

  const todayRecords = useMemo(
    () => recordsByDay(new Date(), punches),
    [punches]
  );
  const weekSummary = useMemo(
    () => weeklySummary(new Date(), punches),
    [punches]
  );

  const weekRange = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${start.toLocaleDateString('es-AR')} - ${end.toLocaleDateString('es-AR')}`;
  }, []);

  function employeeName(id: string) {
    return employees.find((e) => e.id === id)?.name ?? id;
  }

  function branchName(id: string) {
    return branches.find((b) => b.id === id)?.name ?? id;
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🕐 Fichada</h1>
        <nav className="tabs">
          <button
            className={tab === 'fichar' ? 'active' : ''}
            onClick={() => setTab('fichar')}
          >
            Fichar
          </button>
          <button
            className={tab === 'fichadas' ? 'active' : ''}
            onClick={() => setTab('fichadas')}
          >
            Fichadas
          </button>
          <button
            className={tab === 'horas' ? 'active' : ''}
            onClick={() => setTab('horas')}
          >
            Horas
          </button>
        </nav>
      </header>

      <main className="main">
        {tab === 'fichar' && (
          <section className="panel">
            <label>
              Empleado
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Sucursal
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Ubicación para la demo
              <select
                value={simulacion}
                onChange={(e) =>
                  setSimulacion(e.target.value as 'gps' | 'dentro' | 'cerca' | 'lejos')
                }
              >
                <option value="gps">Usar mi GPS real</option>
                <option value="dentro">Simular dentro de la sucursal</option>
                <option value="cerca">Simular a 60 m del límite</option>
                <option value="lejos">Simular a 1,5 km</option>
              </select>
            </label>

            {geo.state === 'ok' && selectedBranch && (
              <div className={`geo ${geo.within ? 'ok' : 'warning'}`}>
                {geo.within
                  ? `📍 Dentro del perímetro (${geo.distance} m)`
                  : `⚠️ Fuera de perímetro: ${geo.distance} m del límite. Se marcará la novedad.`}
              </div>
            )}
            {geo.state === 'loading' && <div className="geo">Obteniendo ubicación…</div>}
            {geo.state === 'error' && (
              <div className="geo warning">Ubicación no disponible: {geo.message}</div>
            )}

            {openPunch && (
              <div className="info">
                Entrada abierta desde {formatTime(openPunch.timestamp)} en{' '}
                {branchName(openPunch.branchId)}
              </div>
            )}

            <div className="actions">
              <button
                className="btn in"
                onClick={() => handlePunch('in')}
                disabled={!selectedEmployee || !selectedBranch}
              >
                Registrar entrada
              </button>
              <button
                className="btn out"
                onClick={() => handlePunch('out')}
                disabled={!selectedEmployee || !selectedBranch || !openPunch}
              >
                Registrar salida
              </button>
            </div>

            {message && <div className="message">{message}</div>}
          </section>
        )}

        {tab === 'fichadas' && (
          <section className="panel">
            <h2>Fichadas de hoy</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Sucursal</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th>Horas</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {todayRecords.length === 0 && (
                  <tr>
                    <td colSpan={6}>No hay fichadas hoy.</td>
                  </tr>
                )}
                {todayRecords.map((r, i) => (
                  <tr key={i}>
                    <td>{employeeName(r.employeeId)}</td>
                    <td>{branchName(r.branchId)}</td>
                    <td>{formatTime(r.in.timestamp)}</td>
                    <td>{r.out ? formatTime(r.out.timestamp) : '—'}</td>
                    <td>{formatHours(r.hours)}</td>
                    <td>
                      <span className={`badge ${r.status}`}>
                        {r.status === 'ok'
                          ? 'Dentro'
                          : r.status === 'out_of_bounds'
                          ? 'Fuera'
                          : 'Sin salida'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'horas' && (
          <section className="panel">
            <h2>Horas de la semana</h2>
            <p className="muted">{weekRange}</p>
            <table className="table">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Total horas</th>
                  <th>Horas extra</th>
                </tr>
              </thead>
              <tbody>
                {weekSummary.length === 0 && (
                  <tr>
                    <td colSpan={3}>No hay datos esta semana.</td>
                  </tr>
                )}
                {weekSummary.map((s) => (
                  <tr key={s.employeeId}>
                    <td>{employeeName(s.employeeId)}</td>
                    <td>{formatHours(s.totalHours)}</td>
                    <td>{formatHours(s.totalOvertime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>

      <footer className="footer">
        Demo sin backend. Los datos se guardan solo en este navegador.
      </footer>
    </div>
  );
}

/** Punto a `metros` de otro, hacia el norte (suficiente para la demo). */
function desplazar(lat: number, lng: number, metros: number): { lat: number; lng: number } {
  const gradosLat = metros / 111_320;
  const gradosLng = metros / (111_320 * Math.cos((lat * Math.PI) / 180) || 1);
  return { lat: lat + gradosLat, lng: lng + gradosLng };
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
