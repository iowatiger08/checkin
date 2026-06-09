import { useEffect, useMemo, useState, FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, Attendee } from './api';

export default function Checkin() {
  const { eventId } = useParams<{ eventId: string }>();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hideCheckedIn, setHideCheckedIn] = useState(false);
  const [walkIn, setWalkIn] = useState('');

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    api
      .listAttendees(eventId)
      .then((r) => setAttendees(r.attendees))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [eventId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return attendees.filter((a) => {
      if (hideCheckedIn && a.checkedInAt) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q);
    });
  }, [attendees, query, hideCheckedIn]);

  const stats = useMemo(() => {
    let inCt = 0,
      game = 0,
      drink = 0;
    for (const a of attendees) {
      if (a.checkedInAt) inCt++;
      if (a.gameTicketIssued) game++;
      if (a.drinkTicketIssued) drink++;
    }
    return { inCt, game, drink, total: attendees.length };
  }, [attendees]);

  function patchLocal(id: string, patch: Partial<Attendee>) {
    setAttendees((prev) => prev.map((a) => (a.attendeeId === id ? { ...a, ...patch } : a)));
  }

  async function toggleCheckIn(a: Attendee) {
    if (!eventId) return;
    if (!a.checkedInAt) {
      const optimisticTime = new Date().toISOString();
      patchLocal(a.attendeeId, { checkedInAt: optimisticTime });
      try {
        const r = await api.checkIn(eventId, a.attendeeId);
        if (r.attendee?.checkedInAt) patchLocal(a.attendeeId, { checkedInAt: r.attendee.checkedInAt });
      } catch (e) {
        patchLocal(a.attendeeId, { checkedInAt: null });
        setError(String(e));
      }
    } else {
      // Undo: PATCH checkedInAt back to null
      patchLocal(a.attendeeId, { checkedInAt: null });
      try {
        await api.updateAttendee(eventId, a.attendeeId, { checkedInAt: null });
      } catch (e) {
        patchLocal(a.attendeeId, { checkedInAt: a.checkedInAt });
        setError(String(e));
      }
    }
  }

  async function toggleField(a: Attendee, field: 'gameTicketIssued' | 'drinkTicketIssued') {
    if (!eventId) return;
    const next = !a[field];
    patchLocal(a.attendeeId, { [field]: next });
    try {
      await api.updateAttendee(eventId, a.attendeeId, { [field]: next });
    } catch (e) {
      patchLocal(a.attendeeId, { [field]: !next });
      setError(String(e));
    }
  }

  async function onWalkIn(e: FormEvent) {
    e.preventDefault();
    if (!eventId || !walkIn.trim()) return;
    try {
      const r = await api.createAttendee(eventId, walkIn.trim());
      setAttendees((prev) => [...prev, r.attendee].sort((x, y) => x.name.localeCompare(y.name)));
      setWalkIn('');
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <main className="page">
      <p>
        <Link to="/">← Events</Link>
      </p>
      <h1>Check-in</h1>

      <div className="stats">
        <span>
          <strong>{stats.inCt}</strong>/{stats.total} checked in
        </span>
        <span>
          <strong>{stats.game}</strong> game tickets
        </span>
        <span>
          <strong>{stats.drink}</strong> drink tickets
        </span>
      </div>

      <div className="controls">
        <input
          placeholder="Search name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={hideCheckedIn}
            onChange={(e) => setHideCheckedIn(e.target.checked)}
          />{' '}
          Hide checked-in
        </label>
      </div>

      <form className="walkin" onSubmit={onWalkIn}>
        <input
          placeholder="Add walk-in: full name"
          value={walkIn}
          onChange={(e) => setWalkIn(e.target.value)}
        />
        <button>Add</button>
      </form>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <ul className="attendees">
          {filtered.map((a) => (
            <li key={a.attendeeId} className={a.checkedInAt ? 'checked' : ''}>
              <span className="name">{a.name}</span>
              <label className="checkbox big">
                <input
                  type="checkbox"
                  checked={!!a.checkedInAt}
                  onChange={() => toggleCheckIn(a)}
                />{' '}
                Checked in
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={a.gameTicketIssued}
                  onChange={() => toggleField(a, 'gameTicketIssued')}
                />{' '}
                Game ticket
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={a.drinkTicketIssued}
                  onChange={() => toggleField(a, 'drinkTicketIssued')}
                />{' '}
                Drink ticket
              </label>
            </li>
          ))}
          {filtered.length === 0 && <li className="muted">No matches.</li>}
        </ul>
      )}
    </main>
  );
}
