import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, ATTENDEES_TABLE, ok, err } from '../shared/dynamo';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;
    if (!eventId) return err(400, 'eventId required');

    const res = await ddb.send(
      new QueryCommand({
        TableName: ATTENDEES_TABLE,
        KeyConditionExpression: 'eventId = :e',
        ExpressionAttributeValues: { ':e': eventId },
      }),
    );

    const attendees = (res.Items ?? []).sort((a, b) =>
      String(a.name ?? '').localeCompare(String(b.name ?? '')),
    );
    return ok({ attendees });
  } catch (e) {
    console.error(e);
    return err(500, (e as Error).message);
  }
};
