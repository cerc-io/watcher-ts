// import * as mafmt from '@multiformats/mafmt';
// import { multiaddr } from '@multiformats/multiaddr';

export interface ConnectRequest {
  type: 'ConnectRequest'
  src: string
  dst: string
  signal: string
}

// ConnectResponse is made by a peer to another peer on a ConnectRequest to establish a direct webrtc connection
export interface ConnectResponse {
  type: 'ConnectResponse'
  src: string
  dst: string
  signal: string
}

async function main () {
  // const ma = multiaddr('/dns4/173-255-252-134.ip.linodeusercontent.com/tcp/443/https/p2p-webrtc-direct/p2p/12D3KooWENbU4KTaLgfdQVC5Ths6EewQJjYo4AjtPx2ykRrooT51');
  // console.log(ma.protoNames());
  // const x = undefined;
  // console.log(ma.getPeerId() === x);
  // console.log(ma.decapsulateCode(421));
  // console.log(ma.decapsulateCode(421).getPeerId());
  // console.log(mafmt.WebRTCDirect.matches(ma.decapsulateCode(421)));

  const obj = {
    type: 'JoinRequest',
    peerId: 'peer-id'
  };
  const x: string = JSON.stringify(obj);
  const msg = JSON.parse(x) as ConnectRequest | ConnectResponse;
  console.log(typeof msg);
  console.log(msg);
}

main().catch(err => {
  console.log(err);
});
