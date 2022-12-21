import React, { useEffect, useState } from 'react';
import { Peer } from '@cerc-io/peer';

import logo from './logo.svg';
import './App.css';

declare global {
  interface Window { broadcast: (message: string) => void; }
}

function App() {
  const [peer, setPeer] = useState<Peer>()
  
  useEffect(() => {
    (async () => {
      if (peer) {
        await peer.init(process.env.REACT_APP_SIGNAL_SERVER)

        peer.subscribeMessage((peerId, message) => {
          console.log(`${peerId.toString()} > ${message}`)
        })
  
        window.broadcast = (message: string) => {
          peer.broadcastMessage(message)
        }
  
        console.log(`Peer ID is ${peer.peerId!.toString()}`);
      }
    })()
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
