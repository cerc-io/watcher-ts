import React, { useEffect, useState } from 'react';
import { Peer } from '@cerc-io/peer';
import { pushable } from 'it-pushable'

import logo from './logo.svg';
import './App.css';

declare global {
  interface Window { broadcast: (message: string) => void; }
}

function App() {
  const [peer, setPeer] = useState<Peer>()
  
  useEffect(() => {
    if (peer) {
      const source = pushable<string>({ objectMode: true })
      peer.init(undefined, source)
  
      window.broadcast = (message: string) => {
        source.push(message)
      }
    }
  }, [peer])

  useEffect(() => {
    setPeer(new Peer())
  }, [])

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
