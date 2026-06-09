import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, ATTENDEES_TABLE, ok, err, nowIso } from '../shared/dynamo';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;
    const attendeeId = event.pathParameters?.attendeeId;
    if (!eventId || !attendeeId) return err(400, 'eventId and attendeeId required');

    const now = nowIso();

    try {
      const res = await ddb.send(
        new UpdateCommand({
          TableName: ATTENDEES_TABLE,
          Key: { eventId, attendeeId },
          UpdateExpression: 'SET checkedInAt = :t',
          ConditionExpression: 'attribute_exists(attendeeId) AND attribute_not_exists(checkedInAt)',
          ExpressionAttributeValues: { ':t': now },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return ok({ attendee: res.Attributes });
    } catch (e: any) {
      if (e?.name === 'ConditionalCheckFailedException') {
        // Already checked in (or missing) — idempotent: return current state best-effort
        return ok({ attendee: null, alreadyCheckedIn: true });
      }
      throw e;
    }
  } catch (e) {
    console.error(e);
    return err(500, (e as Error).message);
  }
};
