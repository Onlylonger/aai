import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import './App.css';
import { Main } from './Main';
import { theme } from './theme';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            <MantineProvider theme={theme}>
              <Main />
            </MantineProvider>
          }
        />
      </Routes>
    </Router>
  );
}
