const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export interface EventRow {
  eventId: string;
  name: string;
  date: string;
  createdAt: string;
}

export interface Attendee {
  eventId: string;
  attendeeId: string;
  name: string;
  checkedInAt: string | null;
  gameTicketIssued: boolean;
  drinkTicketIssued: boolean;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

export const api = {
  listEvents: () => http<{ events: EventRow[] }>('/events'),
  createEvent: (body: { name: string; date: string }) =>
    http<{ event: EventRow }>('/events', { method: 'POST', body: JSON.stringify(body) }),
  listAttendees: (eventId: string) =>
    http<{ attendees: Attendee[] }>(`/events/${eventId}/attendees`),
  createAttendee: (eventId: string, name: string) =>
    http<{ attendee: Attendee }>(`/events/${eventId}/attendees`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  checkIn: (eventId: string, attendeeId: string) =>
    http<{ attendee: Attendee | null; alreadyCheckedIn?: boolean }>(
      `/events/${eventId}/attendees/${attendeeId}/checkin`,
      { method: 'POST' },
    ),
  updateAttendee: (
    eventId: string,
    attendeeId: string,
    patch: Partial<Pick<Attendee, 'gameTicketIssued' | 'drinkTicketIssued' | 'checkedInAt'>>,
  ) =>
    http<{ attendee: Attendee }>(`/events/${eventId}/attendees/${attendeeId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
};
