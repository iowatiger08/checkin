import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';

const baseClient = new DynamoDBClient({});
export const ddb = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export const EVENTS_TABLE = process.env.EVENTS_TABLE!;
export const ATTENDEES_TABLE = process.env.ATTENDEES_TABLE!;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';

export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Content-Type': 'application/json',
};

export function ok(body: unknown, statusCode = 200): APIGatewayProxyResultV2 {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

export function err(statusCode: number, message: string): APIGatewayProxyResultV2 {
  return { statusCode, headers: corsHeaders, body: JSON.stringify({ error: message }) };
}

export function parseBody<T = Record<string, unknown>>(raw: string | undefined): T {
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error('Invalid JSON body');
  }
}

export function uuid(): string {
  // Node 20 has globalThis.crypto.randomUUID
  return (globalThis.crypto as Crypto).randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
