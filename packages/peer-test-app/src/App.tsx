import React, { useContext, useEffect } from 'react';
import { PeerContext } from '@cerc-io/react-peer'

import { Peer } from '@cerc-io/peer';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { AppBar, Box, CssBaseline, Paper, Table, TableBody, TableCell, TableContainer, TableRow, Toolbar, Typography } from '@mui/material';

import './App.css';
import { useForceUpdate } from './hooks/forceUpdate';

const REFRESH_INTERVAL = 5000; // ms
const TEST_TOPIC = 'test';

declare global {
  interface Window {
    broadcast: (message: string) => void;
    flood: (message: string) => Promise<void>;
    peer: Peer;
  }
}

const theme = createTheme();

function App() {
  const forceUpdate = useForceUpdate();
  const peer: Peer = useContext(PeerContext);

  useEffect(() => {
    if (!peer || !peer.node) {
      return
    }

    // For debugging
    window.peer = peer;

    // Subscribe to messages from remote peers
    const unsubscribeMessage = peer.subscribeMessage((peerId, message) => {
      console.log(`${peerId.toString()} > ${message}`)
    })

    // Expose broadcast method in browser to send messages
    window.broadcast = (message: string) => {
      peer.broadcastMessage(message)
    }

    const unsubscribeTopic = peer.subscribeTopic(TEST_TOPIC, (peerId, data) => {
      console.log(`${peerId.toString()} > ${data}`)
    })

    window.flood = async (message: string) => {
      return peer.floodMessage(TEST_TOPIC, message)
    }

    peer.node.peerStore.addEventListener('change:multiaddrs', forceUpdate)
    peer.node.addEventListener('peer:connect', forceUpdate)

    let lastDisconnect = new Date()
    const disconnectHandler = () => {
      forceUpdate()

      const now = new Date();
      const disconnectAfterSeconds = (now.getTime() - lastDisconnect.getTime()) / 1000;
      console.log("Disconnected after seconds:", disconnectAfterSeconds);
      lastDisconnect = now;
    }

    peer.node.addEventListener('peer:disconnect', disconnectHandler)

    return () => {
      unsubscribeMessage()
      unsubscribeTopic()
      peer.node?.peerStore.removeEventListener('change:multiaddrs', forceUpdate)
      peer.node?.removeEventListener('peer:connect', forceUpdate)
      peer.node?.removeEventListener('peer:disconnect', disconnectHandler)
    }
  }, [peer, forceUpdate])

  useEffect(() => {
    // TODO: Add event for connection close and remove refresh in interval
    const intervalID = setInterval(forceUpdate, REFRESH_INTERVAL);

    return () => {
      clearInterval(intervalID)
    }
  }, [forceUpdate])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="relative">
        <Toolbar>
          <Typography variant="h6" color="inherit" noWrap>
            Peer Test App
          </Typography>
        </Toolbar>
      </AppBar>
      <main>
        <Box
          sx={{
            bgcolor: 'background.paper',
            py: 3,
            px: 3
          }}
        >
          <Typography variant="subtitle1" color="inherit" noWrap>
            Self Node Info
          </Typography>
          <br/>
          <TableContainer component={Paper}>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell><b>Peer ID</b></TableCell>
                  <TableCell>{peer && peer.peerId && peer.peerId.toString()}</TableCell>
                  <TableCell align="right"><b>Node started</b></TableCell>
                  <TableCell>{peer && peer.node && peer.node.isStarted().toString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell align="right"><b>Relay node</b></TableCell>
                  <TableCell colSpan={3}>{process.env.REACT_APP_RELAY_NODE}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><b>Multiaddrs</b></TableCell>
                  <TableCell colSpan={3}>
                    <TableContainer>
                      <Table size="small">
                        <TableBody>
                          {
                            peer && peer.node && peer.node.getMultiaddrs().map(multiaddr => (
                              <TableRow key={multiaddr.toString()}>
                                <TableCell sx={{ px: 0 }}>
                                  {multiaddr.toString()}
                                </TableCell>
                              </TableRow>
                            ))
                          }
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <br/>
          {
            peer && peer.node && (
              <>
                <Typography variant="subtitle1" color="inherit" noWrap>
                  Remote Peer Connections (Count: {peer.node.getConnections().length})
                </Typography>
                <br/>
                {peer.node.getConnections().map(connection => (
                  <TableContainer sx={{ mb: 2 }} key={connection.id} component={Paper}>
                    <Table size="small">
                      <TableBody>
                        <TableRow>
                          <TableCell sx={{ width: 175 }}><b>Connection ID</b></TableCell>
                          <TableCell>{connection.id}</TableCell>
                          <TableCell align="right"><b>Direction</b></TableCell>
                          <TableCell>{connection.stat.direction}</TableCell>
                          <TableCell align="right"><b>Type</b></TableCell>
                          <TableCell>{connection.remoteAddr.toString().includes('p2p-circuit/p2p') ? "relayed" : "direct"}</TableCell>
                          <TableCell align="right"><b>Status</b></TableCell>
                          <TableCell>{connection.stat.status}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell sx={{ width: 175 }}><b>Peer ID</b></TableCell>
                          <TableCell colSpan={5}>{connection.remotePeer.toString()}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell sx={{ width: 175 }}><b>Connected multiaddr</b></TableCell>
                          <TableCell colSpan={5}>
                            {connection.remoteAddr.toString()}
                            &nbsp;
                            <b>{connection.remoteAddr.toString() === process.env.REACT_APP_RELAY_NODE && "(RELAY NODE)"}</b>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                ))}
              </>
            )
          }
        </Box>
      </main>
    </ThemeProvider>
  );
}

export default App;
