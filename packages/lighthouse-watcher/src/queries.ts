//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from 'graphql-request';

const resultEvent = `
{
  block {
    number
    hash
    timestamp
    parentHash
  }
  tx {
    hash
    from
    to
    index
  }
  contract
  eventIndex

  event {
    __typename

    ... on StorageRequestEvent {
      uploader
      cid
      config
      fileCost
    }
  }

  proof {
    data
  }
}
`;

export const subscribeEvents = gql`
  subscription SubscriptionEvents {
    onEvent 
      ${resultEvent}
  }
`;
