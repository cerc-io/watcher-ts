import React, { useEffect, useState } from 'react';

import { Peer } from '@cerc-io/peer';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { AppBar, Box, CssBaseline, Paper, Table, TableBody, TableCell, TableContainer, TableRow, Toolbar, Typography } from '@mui/material';

import './App.css';
import { useForceUpdate } from './hooks/forceUpdate';

declare global {
  interface Window { broadcast: (message: string) => void; }
}

const theme = createTheme();

function App() {
  const [peer, setPeer] = useState<Peer>()
  const forceUpdate = useForceUpdate();

  useEffect(() => {
    (async () => {
      if (peer) {
        await peer.init(process.env.REACT_APP_SIGNAL_SERVER, process.env.REACT_APP_RELAY_NODE)
        console.log(`Peer ID is ${peer.peerId!.toString()}`);

        // Subscribe to messages from remote peers
        peer.subscribeMessage((peerId, message) => {
          console.log(`${peerId.toString()} > ${message}`)
        })

        // Expose broadcast method in browser to send messages
        window.broadcast = (message: string) => {
          peer.broadcastMessage(message)
        }

        peer.node?.peerStore.addEventListener('change:multiaddrs', () => forceUpdate())
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
            pt: 6,
            pb: 6,
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
                {/* Add signal server and relay node */}
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
        </Box>
      </main>
    </ThemeProvider>
  );
}

export default App;
