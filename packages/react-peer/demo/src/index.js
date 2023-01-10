import React, {Component} from 'react'
import {render} from 'react-dom'

import { PeerProvider } from '../../src'

export default class Demo extends Component {
  render() {
    return <PeerProvider>
      <div>
        <h1>react-peer Demo</h1>
      </div>
    </PeerProvider>
  }
}

render(<Demo/>, document.querySelector('#demo'))
