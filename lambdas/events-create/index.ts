import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, EVENTS_TABLE, ok, err, parseBody, uuid, nowIso } from '../shared/dynamo';

interface Body {
  name?: string;
  date?: string;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const body = parseBody<Body>(event.body);
    if (!body.name || !body.date) return err(400, 'name and date are required');

    const item = {
      eventId: uuid(),
      name: body.name,
      date: body.date,
      createdAt: nowIso(),
    };

    await ddb.send(new PutCommand({ TableName: EVENTS_TABLE, Item: item }));
    return ok({ event: item }, 201);
  } catch (e) {
    console.error(e);
    return err(500, (e as Error).message);
  }
};
