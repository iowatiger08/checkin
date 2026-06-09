#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CheckinStack } from '../lib/checkin-stack';

const app = new cdk.App();

new CheckinStack(app, 'CheckinStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '166782860262',
    region: process.env.CDK_DEFAULT_REGION ?? 'us-west-2',
  },
  description: 'Event check-in app: HTTP API + Lambda + DynamoDB, React on S3+CloudFront.',
});
