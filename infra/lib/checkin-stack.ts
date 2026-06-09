import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Architecture } from 'aws-cdk-lib/aws-lambda';
import { HttpApi, HttpMethod, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Bucket, BlockPublicAccess, BucketEncryption, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import {
  Distribution,
  ViewerProtocolPolicy,
  AllowedMethods,
  CachePolicy,
  ResponseHeadersPolicy,
  PriceClass,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';

export class CheckinStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const skipWeb = this.node.tryGetContext('skipWeb') === 'true';

    // ─── DynamoDB ──────────────────────────────────────────────
    const eventsTable = new Table(this, 'EventsTable', {
      tableName: 'CheckinEvents',
      partitionKey: { name: 'eventId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const attendeesTable = new Table(this, 'AttendeesTable', {
      tableName: 'CheckinAttendees',
      partitionKey: { name: 'eventId', type: AttributeType.STRING },
      sortKey: { name: 'attendeeId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ─── Static site bucket + CloudFront (need origin first for CORS) ──
    const siteBucket = new Bucket(this, 'SiteBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new Distribution(this, 'SiteDistribution', {
      defaultRootObject: 'index.html',
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    const siteOrigin = `https://${distribution.distributionDomainName}`;

    // ─── Lambdas ──────────────────────────────────────────────
    const lambdasDir = path.join(__dirname, '..', '..', 'lambdas');
    const commonLambdaProps = {
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        EVENTS_TABLE: eventsTable.tableName,
        ATTENDEES_TABLE: attendeesTable.tableName,
        ALLOWED_ORIGIN: siteOrigin,
      },
      bundling: {
        format: OutputFormat.CJS,
        minify: true,
        sourceMap: false,
        target: 'node20',
        externalModules: ['@aws-sdk/*'] as string[],
      },
    };

    const mkFn = (id: string, entry: string) =>
      new NodejsFunction(this, id, {
        ...commonLambdaProps,
        entry: path.join(lambdasDir, entry, 'index.ts'),
        handler: 'handler',
      });

    const fnEventsList = mkFn('FnEventsList', 'events-list');
    const fnEventsCreate = mkFn('FnEventsCreate', 'events-create');
    const fnAttendeesList = mkFn('FnAttendeesList', 'attendees-list');
    const fnAttendeesCreate = mkFn('FnAttendeesCreate', 'attendees-create');
    const fnAttendeesCheckin = mkFn('FnAttendeesCheckin', 'attendees-checkin');
    const fnAttendeesUpdate = mkFn('FnAttendeesUpdate', 'attendees-update');

    eventsTable.grantReadWriteData(fnEventsList);
    eventsTable.grantReadWriteData(fnEventsCreate);
    attendeesTable.grantReadWriteData(fnAttendeesList);
    attendeesTable.grantReadWriteData(fnAttendeesCreate);
    attendeesTable.grantReadWriteData(fnAttendeesCheckin);
    attendeesTable.grantReadWriteData(fnAttendeesUpdate);

    // ─── HTTP API ─────────────────────────────────────────────
    const api = new HttpApi(this, 'CheckinApi', {
      corsPreflight: {
        allowOrigins: [siteOrigin, 'http://localhost:5173'],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type'],
        maxAge: Duration.hours(1),
      },
    });

    const addRoute = (method: HttpMethod, route: string, fn: NodejsFunction, idSuffix: string) => {
      api.addRoutes({
        path: route,
        methods: [method],
        integration: new HttpLambdaIntegration(`Int${idSuffix}`, fn),
      });
    };

    addRoute(HttpMethod.GET, '/events', fnEventsList, 'EventsList');
    addRoute(HttpMethod.POST, '/events', fnEventsCreate, 'EventsCreate');
    addRoute(HttpMethod.GET, '/events/{eventId}/attendees', fnAttendeesList, 'AttendeesList');
    addRoute(HttpMethod.POST, '/events/{eventId}/attendees', fnAttendeesCreate, 'AttendeesCreate');
    addRoute(
      HttpMethod.POST,
      '/events/{eventId}/attendees/{attendeeId}/checkin',
      fnAttendeesCheckin,
      'AttendeesCheckin',
    );
    addRoute(
      HttpMethod.PATCH,
      '/events/{eventId}/attendees/{attendeeId}',
      fnAttendeesUpdate,
      'AttendeesUpdate',
    );

    // ─── Web upload ──────────────────────────────────────────
    // Auto-skipped when:
    //   - context flag -c skipWeb=true (explicit), OR
    //   - web/dist/index.html doesn't exist yet (first deploy / bootstrap).
    const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
    const distExists = fs.existsSync(path.join(webDist, 'index.html'));
    if (skipWeb) {
      console.log('CheckinStack: skipWeb=true, BucketDeployment skipped.');
    } else if (!distExists) {
      console.log(
        'CheckinStack: web/dist/index.html not found, BucketDeployment skipped. ' +
          'Build the web app (VITE_API_URL=<ApiUrl> npm -w web run build) and redeploy to populate the site.',
      );
    } else {
      new BucketDeployment(this, 'SiteDeployment', {
        sources: [Source.asset(webDist)],
        destinationBucket: siteBucket,
        distribution,
        distributionPaths: ['/*'],
        prune: true,
      });
    }

    // ─── Outputs ─────────────────────────────────────────────
    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'SiteUrl', { value: siteOrigin });
    new CfnOutput(this, 'EventsTableName', { value: eventsTable.tableName });
    new CfnOutput(this, 'AttendeesTableName', { value: attendeesTable.tableName });
  }
}
