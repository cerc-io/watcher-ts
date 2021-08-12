//
// Copyright 2021 Vulcanize, Inc.
//

import _ from 'lodash';
import { ethers } from 'ethers';

export const addressesInTrace = (obj: any): any => {
  return _.uniq(_.compact(_.flattenDeep(addressesIn(obj))))
    .sort()
    .map(address => ethers.utils.getAddress(<string>address));
};

const addressesIn = (obj: any): any => {
  const addresses: any = [];

  if (obj) {
    addresses.push(obj.from);
    addresses.push(obj.to);

    if (obj.addresses) {
      addresses.push(_.keys(obj.addresses));
    }

    if (obj.calls) {
      obj.calls.forEach((call: any) => {
        addresses.push(addressesIn(call));
      });
    }
  }

  return addresses;
};
