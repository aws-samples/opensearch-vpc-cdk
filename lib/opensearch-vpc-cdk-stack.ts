import * as cdk from "aws-cdk-lib";
import { CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import {
  BastionHostLinux,
  BlockDeviceVolume,
  MachineImage,
  Peer,
  Port,
  SecurityGroup,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import {
  AnyPrincipal,
  CfnServiceLinkedRole,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import { Domain, EngineVersion } from "aws-cdk-lib/aws-opensearchservice";
import { Construct } from "constructs";
import { IAMClient, ListRolesCommand } from "@aws-sdk/client-iam";
import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";
import { Runtime } from "aws-cdk-lib/aws-lambda";

const iam = new IAMClient({});

export class OpensearchVpcCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new Vpc(this, "Vpc", {});

    // Security Group
    const bastionSecurityGroup = new SecurityGroup(
      this,
      "BastionSecurityGroup",
      {
        vpc: vpc,
        allowAllOutbound: true,
        securityGroupName: "BastionSecurityGroup",
      }
    );

    const opensearchSecurityGroup = new SecurityGroup(
      this,
      "OpensearchSecurityGroup",
      {
        vpc: vpc,
        securityGroupName: "OpensearchSecurityGroup",
      }
    );

    opensearchSecurityGroup.addIngressRule(bastionSecurityGroup, Port.tcp(443));

    // Service-linked role that Amazon OpenSearch Service will use
    (async () => {
      const response = await iam.send(
        new ListRolesCommand({
          PathPrefix: "/aws-service-role/opensearchservice.amazonaws.com/",
        })
      );

      // Only if the role for OpenSearch Service doesn't exist, it will be created.
      if (response.Roles && response.Roles?.length == 0) {
        new CfnServiceLinkedRole(this, "OpensearchServiceLinkedRole", {
          awsServiceName: "es.amazonaws.com",
        });
      }
    })();

    // Bastion host to access Opensearch Dashboards
    new BastionHostLinux(this, "BastionHost", {
      vpc,
      securityGroup: bastionSecurityGroup,
      machineImage: MachineImage.latestAmazonLinux2023(),
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: BlockDeviceVolume.ebs(10, {
            encrypted: true,
          }),
        },
      ],
    });

    // OpenSearch domain
    const domain = new Domain(this, "Domain", {
      version: EngineVersion.OPENSEARCH_2_3,
      nodeToNodeEncryption: true,
      enforceHttps: true,
      encryptionAtRest: {
        enabled: true,
      },
      vpc: vpc,
      capacity: {
        dataNodes: 2,
      },
      removalPolicy: RemovalPolicy.DESTROY,
      zoneAwareness: {
        enabled: true,
      },
      securityGroups: [opensearchSecurityGroup],
    });

    domain.addAccessPolicies(
      new PolicyStatement({
        principals: [new AnyPrincipal()],
        actions: ["es:ESHttp*"],
        resources: [domain.domainArn + "/*"],
      })
    );

    // Lambda
    const dataIndexFunction = new PythonFunction(this, "DataIndex", {
      runtime: Runtime.PYTHON_3_10,
      entry: "lambda",
      vpc: vpc,
      environment: {
        OPENSEARCH_HOST: domain.domainEndpoint,
      },
    });

    domain.connections.allowFrom(dataIndexFunction, Port.tcp(443));

    // Outputs
    new CfnOutput(this, "OpenSearchDomainHost", {
      value: domain.domainEndpoint,
    });

    new CfnOutput(this, "IndexingFunctionName", {
      value: dataIndexFunction.functionName,
    });
  }
}
