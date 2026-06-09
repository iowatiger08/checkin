import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, EVENTS_TABLE, ok, err } from '../shared/dynamo';

export const handler: APIGatewayProxyHandlerV2 = async () => {
  try {
    const res = await ddb.send(new ScanCommand({ TableName: EVENTS_TABLE }));
    const events = (res.Items ?? []).sort((a, b) =>
      String(b.date ?? '').localeCompare(String(a.date ?? '')),
    );
    return ok({ events });
  } catch (e) {
    console.error(e);
    return err(500, (e as Error).message);
  }
};
