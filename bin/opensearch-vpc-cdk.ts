#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { OpensearchVpcCdkStack } from "../lib/opensearch-vpc-cdk-stack";

const app = new cdk.App();
new OpensearchVpcCdkStack(app, "OpensearchVpcCdkStack", {});
