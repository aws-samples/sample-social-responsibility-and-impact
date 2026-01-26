// Temporary config for build testing
// This will be replaced by inject-config.js during actual deployment
export const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: 'us-east-1_XXXXXXXXX',
      userPoolClientId: 'test-client-id',
      identityPoolId: 'us-east-1:test-identity-pool-id',
    }
  },
  API: {
    REST: {
      WeatherAlertAPI: {
        endpoint: 'https://test-api.execute-api.us-west-2.amazonaws.com/prod',
        region: 'us-west-2'
      }
    }
  }
};
