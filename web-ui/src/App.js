import React, { useState, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import './App.css';
import Dashboard from './components/Dashboard';

// AWS Configuration - will be replaced during build
const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.REACT_APP_USER_POOL_ID || 'YOUR_USER_POOL_ID',
      userPoolClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID || 'YOUR_CLIENT_ID',
      identityPoolId: process.env.REACT_APP_IDENTITY_POOL_ID || 'YOUR_IDENTITY_POOL_ID',
    }
  },
  API: {
    REST: {
      WeatherAlertAPI: {
        endpoint: process.env.REACT_APP_API_ENDPOINT || 'YOUR_API_ENDPOINT',
        region: process.env.REACT_APP_REGION || 'us-west-2',
      }
    }
  }
};

Amplify.configure(awsConfig);

function App() {
  return (
    <Authenticator
      loginMechanisms={['email']}
      signUpAttributes={['email']}
      hideSignUp={true}
    >
      {({ signOut, user }) => (
        <div className="app">
          <header className="app-header">
            <div className="header-content">
              <h1>🌡️ Weather Alert System</h1>
              <div className="user-info">
                <span>Welcome, {user.signInDetails?.loginId}</span>
                <button onClick={signOut} className="sign-out-btn">
                  Sign Out
                </button>
              </div>
            </div>
          </header>
          <main className="app-main">
            <Dashboard user={user} />
          </main>
          <footer className="app-footer">
            <p>© 2025 AWS Samples | Serverless Weather Alert System</p>
          </footer>
        </div>
      )}
    </Authenticator>
  );
}

export default App;
