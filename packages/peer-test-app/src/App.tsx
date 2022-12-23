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
        await peer.init(process.env.REACT_APP_SIGNAL_SERVER, process.env.REACT_APP_RELAY_NODE)
        console.log(`Peer ID is ${peer.peerId!.toString()}`);

        peer.subscribeMessage((peerId, message) => {
          console.log(`${peerId.toString()} > ${message}`)
        })

        window.broadcast = (message: string) => {
          peer.broadcastMessage(message)
        }
      }
    })()

    return () => {
      if (peer) {
        // TODO: Await for peer close
        peer.close()
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
          Peer messaging app
        </p>
      </header>
    </div>
  );
}

export default App;
