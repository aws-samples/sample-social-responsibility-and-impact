#!/usr/bin/env node
/**
 * Injects AWS configuration from CDK outputs into the React build
 * Run this after CDK deployment and before building the React app
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Injecting AWS configuration from CDK outputs...\n');

try {
  // Get CDK outputs
  const outputs = JSON.parse(
    execSync('aws cloudformation describe-stacks --stack-name WeatherAlertWebHostingStack --query "Stacks[0].Outputs" --output json', {
      encoding: 'utf-8'
    })
  );

  // Parse outputs
  const config = {};
  outputs.forEach(output => {
    const key = output.OutputKey;
    const value = output.OutputValue;
    
    if (key === 'UserPoolId') config.userPoolId = value;
    if (key === 'UserPoolClientId') config.userPoolClientId = value;
    if (key === 'IdentityPoolId') config.identityPoolId = value;
    if (key === 'ApiEndpoint') config.apiEndpoint = value;
    if (key === 'Region') config.region = value;
  });

  console.log('✅ Configuration retrieved:');
  console.log(`   User Pool ID: ${config.userPoolId}`);
  console.log(`   Client ID: ${config.userPoolClientId}`);
  console.log(`   Identity Pool ID: ${config.identityPoolId}`);
  console.log(`   API Endpoint: ${config.apiEndpoint}`);
  console.log(`   Region: ${config.region}\n`);

  // Create .env file
  const envContent = `REACT_APP_USER_POOL_ID=${config.userPoolId}
REACT_APP_USER_POOL_CLIENT_ID=${config.userPoolClientId}
REACT_APP_IDENTITY_POOL_ID=${config.identityPoolId}
REACT_APP_API_ENDPOINT=${config.apiEndpoint}
REACT_APP_REGION=${config.region}
`;

  fs.writeFileSync(path.join(__dirname, '../.env'), envContent);
  console.log('✅ Configuration written to .env file\n');

  console.log('🎉 Ready to build! Run: npm run build\n');

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('\n💡 Make sure you have:');
  console.error('   1. Deployed the CDK stack: cd cdk && cdk deploy WeatherAlertWebHostingStack');
  console.error('   2. AWS CLI configured with proper credentials');
  process.exit(1);
}
