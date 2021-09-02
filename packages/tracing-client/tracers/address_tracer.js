//
// Copyright 2021 Vulcanize, Inc.
//

{
  minVanityAddressLength: 35,

  excludedAddresses: [
    "0x0000000000000000000000000000000000000000",
    "0xffffffffffffffffffffffffffffffffffffffff"
  ],

  // Known vanity addresses. Empty by default, but can replace this object when making dynamic requests.
  // Burner addresses go here too.
  knownVanityAddresses: {
    // "0x000026b86Ac8B3c08ADDEeacd7ee19e807D94742": true
  },

  data: {},

  isAddress: function(log, db, value) {
    // More than 40 chars or too small in length, so not an address.
    if (value.length > 40 || value.length < this.minVanityAddressLength) {
      return { isAddress: false };
    }

    var address = toAddress(value);
    var addressAsHex = toHex(address);

    // Check list of known exclusions.
    if (this.excludedAddresses.indexOf(addressAsHex) != -1) {
      return { isAddress: false };
    }

    // Address exists in db, so definitely an address.
    if (db.exists(address)) {
      return { isAddress: true, address: addressAsHex, confidence: 1 };
    }

    // May still be a valid address (e.g. for ERC20 transfer).
    // It won't exist in DB e.g. if no ETH was sent to it directly.
    // Apply heuristics.

    // Length heuristic - addresses are usually 40 bytes.
    if (value.length == 40 && log.op.isPush()) {
      return { isAddress: true, address: addressAsHex, confidence: 0.75 };
    }

    // Vanity addresses might start with leading zeros, so length will be < 40.
    // But we use a min length of addresses, otherwise there are too many false positives.
    // Also use a known vanity address list to override the normal logic.
    if (this.knownVanityAddresses[addressAsHex] || (log.op.isPush() && value.length > this.minVanityAddressLength)) {
      return { isAddress: true, address: addressAsHex, confidence: 0.60 };
    }

    return { isAddress: false };
  },

  // step is invoked for every opcode that the VM executes.
  step: function(log, db) {
    if (log.stack.length()) {
      var topOfStack = log.stack.peek(0).toString(16);
      var result = this.isAddress(log, db, topOfStack);

      if (result.isAddress) {
        this.data[result.address] = result.confidence;
      }
    }
  },

  // fault is invoked when the actual execution of an opcode fails.
  fault: function(log, db) { },

  // result is invoked when all the opcodes have been iterated over and returns
  // the final result of the tracing.
  result: function(ctx, db) {
    return this.data;
  }
}