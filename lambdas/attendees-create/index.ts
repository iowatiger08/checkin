import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, ATTENDEES_TABLE, ok, err, parseBody, uuid } from '../shared/dynamo';

interface Body {
  name?: string;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;
    if (!eventId) return err(400, 'eventId required');

    const body = parseBody<Body>(event.body);
    if (!body.name) return err(400, 'name required');

    const item = {
      eventId,
      attendeeId: uuid(),
      name: body.name,
      checkedInAt: null,
      gameTicketIssued: false,
      drinkTicketIssued: false,
    };

    await ddb.send(new PutCommand({ TableName: ATTENDEES_TABLE, Item: item }));
    return ok({ attendee: item }, 201);
  } catch (e) {
    console.error(e);
    return err(500, (e as Error).message);
  }
};
