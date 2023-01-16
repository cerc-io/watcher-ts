# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Instructions

* Install dependencies:

  ```bash
  yarn install
  ```

* Build the peer package:

  ```bash
  # From repo root
  cd packages/peer

  yarn build
  ```

* (Optional) Run a local signalling server:

  ```bash
  # In packages/peer
  yarn signal-server
  ```

* (Optional) Create and export a peer id for the relay node:

  ```bash
  # In packages/peer
  yarn create-peer --file [PEER_ID_FILE_PATH]
  ```

  * `file (f)`: file path to export the peer id to (json) (default: logs to console)

* (Optional) Run a local relay node:

  ```bash
  # In packages/peer
  yarn relay-node --signal-server [SIGNAL_SERVER_URL] --peer-id-file [PEER_ID_FILE_PATH] --relay-peers [RELAY_PEERS_FILE_PATH]
  ```

  * `signal-server`: multiaddr of a signalling server (default: local signalling server multiaddr)
  * `peer-id-file`: file path for peer id to be used (json)
  * `relay-peers`: file path for relay peer multiaddr(s) to dial to (json)

* Set the signalling server and primary relay node multiaddrs in the [env](./.env) file:

  ```
  REACT_APP_SIGNAL_SERVER=/ip4/127.0.0.1/tcp/13579/ws/p2p-webrtc-star/
  REACT_APP_RELAY_NODE=/ip4/127.0.0.1/tcp/13579/wss/p2p-webrtc-star/p2p/12D3KooWRzH3ZRFP6RDbs2EKA8jSrD4Y6VYtLnCRMj3mYCiMHCJP
  ```

* Start the react app in development mode:

  ```bash
  # In packages/peer-test-app
  yarn start
  ```

* The app can be opened in multiple browsers

## Development

* After making changes in [peer](../peer/) package run build

  ```bash
  # In packages/peer
  yarn build
  ```

* The react app server running in development mode should recompile after changes are made in peer package

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).
