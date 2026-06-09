import { useEffect, useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, EventRow } from './api';

export default function EventsList() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .listEvents()
      .then((r) => setEvents(r.events))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const r = await api.createEvent({ name: name.trim(), date });
      setEvents((prev) => [r.event, ...prev]);
      setName('');
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="page">
      <h1>Events</h1>

      <form className="card" onSubmit={onCreate}>
        <h2>New event</h2>
        <div className="row">
          <input
            placeholder="Event name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <button disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : events.length === 0 ? (
        <p className="muted">No events yet.</p>
      ) : (
        <ul className="event-list">
          {events.map((ev) => (
            <li key={ev.eventId}>
              <Link to={`/events/${ev.eventId}`}>
                <strong>{ev.name}</strong>
                <span className="muted"> — {ev.date}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
