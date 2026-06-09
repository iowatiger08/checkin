#!/usr/bin/env tsx
/**
 * Seed events + attendees from a CSV.
 *
 * Usage:
 *   tsx seed.ts --csv ../checkin.csv --event-name "Iowa Cubs game for May 22" --date 2026-05-22
 *
 * - Idempotent on (event-name, date): if an event with the same name+date exists, reuses it.
 * - Inserts one attendee per row of the CSV. Skips rows where the name is empty.
 * - Existing attendees with the same (eventId, name) are skipped on re-runs.
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const args = parseArgs(process.argv.slice(2));
const csvPath = path.resolve(args.csv ?? './checkin.csv');
const eventName = args['event-name'];
const eventDate = args.date;

if (!eventName || !eventDate) {
  console.error('Required: --event-name "..." --date YYYY-MM-DD');
  process.exit(1);
}
if (!fs.existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`);
  process.exit(1);
}

const region = process.env.AWS_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-west-2';
const EVENTS_TABLE = process.env.EVENTS_TABLE ?? 'CheckinEvents';
const ATTENDEES_TABLE = process.env.ATTENDEES_TABLE ?? 'CheckinAttendees';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});

(async () => {
  console.log(`Seeding into region=${region}`);
  console.log(`  Events table: ${EVENTS_TABLE}`);
  console.log(`  Attendees table: ${ATTENDEES_TABLE}`);

  // 1. Find or create event
  const existing = await ddb.send(
    new ScanCommand({
      TableName: EVENTS_TABLE,
      FilterExpression: '#n = :n AND #d = :d',
      ExpressionAttributeNames: { '#n': 'name', '#d': 'date' },
      ExpressionAttributeValues: { ':n': eventName, ':d': eventDate },
    }),
  );

  let eventId: string;
  if (existing.Items && existing.Items.length > 0) {
    eventId = existing.Items[0].eventId as string;
    console.log(`Reusing existing event ${eventId}`);
  } else {
    eventId = randomUUID();
    await ddb.send(
      new PutCommand({
        TableName: EVENTS_TABLE,
        Item: { eventId, name: eventName, date: eventDate, createdAt: new Date().toISOString() },
      }),
    );
    console.log(`Created event ${eventId} — "${eventName}" on ${eventDate}`);
  }

  // 2. Load existing attendee names so re-runs are idempotent
  const existingAttendees = await queryAll(eventId);
  const existingNames = new Set(existingAttendees.map((a) => (a.name as string).toLowerCase()));

  // 3. Parse CSV
  const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/);
  const header = (lines.shift() ?? '').toLowerCase();
  if (!header.startsWith('name')) {
    console.warn(`Warning: first CSV column is not "Name" (got "${header}"). Continuing.`);
  }

  let inserted = 0,
    skipped = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const name = line.split(',')[0].trim();
    if (!name) continue;
    if (existingNames.has(name.toLowerCase())) {
      skipped++;
      continue;
    }
    await ddb.send(
      new PutCommand({
        TableName: ATTENDEES_TABLE,
        Item: {
          eventId,
          attendeeId: randomUUID(),
          name,
          checkedInAt: null,
          gameTicketIssued: false,
          drinkTicketIssued: false,
        },
      }),
    );
    inserted++;
  }

  console.log(`Done. Inserted ${inserted}, skipped (already present) ${skipped}.`);
  console.log(`Event URL path: /events/${eventId}`);
})().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

async function queryAll(eventId: string) {
  const out: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res: any = await ddb.send(
      new QueryCommand({
        TableName: ATTENDEES_TABLE,
        KeyConditionExpression: 'eventId = :e',
        ExpressionAttributeValues: { ':e': eventId },
        ExclusiveStartKey,
      }),
    );
    out.push(...(res.Items ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = 'true';
      }
    }
  }
  return out;
}
