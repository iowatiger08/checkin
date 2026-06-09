import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, ATTENDEES_TABLE, ok, err, parseBody } from '../shared/dynamo';

interface Body {
  gameTicketIssued?: boolean;
  drinkTicketIssued?: boolean;
  checkedInAt?: string | null;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;
    const attendeeId = event.pathParameters?.attendeeId;
    if (!eventId || !attendeeId) return err(400, 'eventId and attendeeId required');

    const body = parseBody<Body>(event.body);
    const sets: string[] = [];
    const values: Record<string, unknown> = {};

    if (typeof body.gameTicketIssued === 'boolean') {
      sets.push('gameTicketIssued = :g');
      values[':g'] = body.gameTicketIssued;
    }
    if (typeof body.drinkTicketIssued === 'boolean') {
      sets.push('drinkTicketIssued = :d');
      values[':d'] = body.drinkTicketIssued;
    }
    if (body.checkedInAt === null || typeof body.checkedInAt === 'string') {
      sets.push('checkedInAt = :c');
      values[':c'] = body.checkedInAt;
    }

    if (sets.length === 0) return err(400, 'no updatable fields supplied');

    const res = await ddb.send(
      new UpdateCommand({
        TableName: ATTENDEES_TABLE,
        Key: { eventId, attendeeId },
        UpdateExpression: 'SET ' + sets.join(', '),
        ConditionExpression: 'attribute_exists(attendeeId)',
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }),
    );
    return ok({ attendee: res.Attributes });
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') return err(404, 'attendee not found');
    console.error(e);
    return err(500, (e as Error).message);
  }
};
