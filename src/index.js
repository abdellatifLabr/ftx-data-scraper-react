import React from 'react';
import ReactDOM from 'react-dom';
import { ApolloProvider } from '@apollo/client';

import apolloClient from './graphql';
import './index.css';
import App from './App';

ReactDOM.render(
  <React.StrictMode>
    <ApolloProvider client={apolloClient}>
      <App />
    </ApolloProvider>
  </React.StrictMode>,
  document.getElementById('root')
);
