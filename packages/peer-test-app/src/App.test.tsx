import React from 'react';
import { render, screen } from '@testing-library/react';
// import App from './App';

// https://github.com/facebook/create-react-app/issues/12063
xtest('renders learn react link', () => {
  // render(<App />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
