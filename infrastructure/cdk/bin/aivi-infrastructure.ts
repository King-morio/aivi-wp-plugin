#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AiviStack } from '../lib/aivi-stack';

const app = new cdk.App();

new AiviStack(app, 'AiviStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  env: {
    account: '173471018175',
    region: 'eu-north-1',
  },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});
