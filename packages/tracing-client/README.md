# Tracing Client

```bash
npx ts-node src/cli/get-tx-trace.ts --txHash 0xa58ec012f8b6d5baac684b9939287866deffa3806f4c8252a190f264cc07b872

npx ts-node src/cli/get-tx-trace.ts --txHash 0xa58ec012f8b6d5baac684b9939287866deffa3806f4c8252a190f264cc07b872 --tracer callTracer

npx ts-node src/cli/get-tx-trace.ts --txHash 0xa58ec012f8b6d5baac684b9939287866deffa3806f4c8252a190f264cc07b872 --tracerFile src/tracers/call_tracer.js

npx ts-node src/cli/get-tx-trace.ts --txHash 0xa58ec012f8b6d5baac684b9939287866deffa3806f4c8252a190f264cc07b872 --tracerFile src/tracers/address_tracer.js
```

Rinkeby:

```bash
npx ts-node src/cli/get-call-trace.ts --block 0x66bbe015dec07f55bc916dff724a962bca067fa0fcdd42eb211474ad609f87be  --txFile test/tx/rinkeby-test.json --providerUrl http://rinkeby-testing.vdb.to:8545

npx ts-node src/cli/get-call-trace.ts --block 0x85C9ED --txFile test/tx/rinkeby-test.json --providerUrl http://rinkeby-testing.vdb.to:8545
```

Mainnet:

```bash
ssh geth@arch1.vdb.to -L 8545:127.0.0.1:8545

# https://etherscan.io/tx/0xab6b8315187d3333f2cad87eb861203c856b6cb997b0d58f2d96b6ea1a42c258
# Note: 43 internal transactions.

npx ts-node src/cli/get-tx-trace.ts --txHash 0xab6b8315187d3333f2cad87eb861203c856b6cb997b0d58f2d96b6ea1a42c258 --tracer callTracer

npx ts-node src/cli/get-tx-trace.ts --txHash 0xab6b8315187d3333f2cad87eb861203c856b6cb997b0d58f2d96b6ea1a42c258 --tracerFile src/tracers/address_tracer.js --timeout 20s

{
  "0xf94d7953d44bdcc7a5585a61ed91899ef2d39524": 1,
  "0x240c7488df044d2f69d66201ee59a296c64d714c": 1,
  "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8": 1,
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 1,
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": 1,
  "0x1f4de5cc412ff43db7663e39aaa04221ca9e995f": 1,
  "0x5af7f71c7747fb0eceb2eef115c3fa34dd4998d3": 1,
  "0x00004d59594796297b1b33f9dbc3fb1829ebaaf9": 0.6,
  "0x0081a5107db14797df968e243e8918fec5c189ec": 0.6,
  "0x41120695a494e1653b6c5fd69d8de0d301be2810": 0.75,
  "0x0001ef68096b0199f8afcdd6eedbb16a461c1272": 0.6,
  "0xfffd8963efd1fc6a506488495d951d5263988d26": 0.75,
  "0x00004d6d099aa3197c9a709447db6b6a00000000": 0.6,
  "0x0003050b85adc04db540d95779a4000000000000": 0.6,
  "0x0003050b831e5bcc09c1d4fd1eb3ed5e62ffc556": 0.6,
  "0x00004d6d28b4e64200d8556776f0fc20a12bc1ad": 0.6,
  "0x11b815efb8f581194ae79006d24e0d814b7697f6": 1,
  "0xdac17f958d2ee523a2206206994597c13d831ec7": 1,
  "0x058ca87960e3da12000000000000000000000000": 0.6,
  "0x0005aa065bcf8dcf069c57ed3fad1980b2a4a873": 0.6,
  "0x058e98dfce0fd2a2b9373e6974cea7ffbe91decc": 0.6,
  "0x0001efb93682b84a1014b9fb7941273c0ba0e9f5": 0.6,
  "0x3333333acdedbbc9ad7bda0876e60714195681c5": 1,
  "0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7": 1,
  "0x00002af904b638ed930cddfe78cf741a9f440000": 0.6,
  "0x0000334c40df9502deb37a4ac7f2d72780000000": 0.6,
  "0x00002dc527a4a9017812d98e236bc2cb40000000": 0.6,
  "0x0feef93405c3ca6c31df80109628d3137dcbe3b0": 0.6,
  "0x807a96288a1a408dbc13de2b1d087d10356395d2": 1,
  "0xa2327a938febf5fec13bacfb16ae10ecbc4cbdcf": 1,
  "0xe592427a0aece92de3edee1f18e0157c05861564": 1,
  "0x1f98431c8ad98523631ae4a59f267346ea31f984": 1,
  "0xffffffff00000000000000000000000000000000": 0.75,
  "0xf0d160dec1749afaf5a831668093b1431f7c8527": 1,
  "0xc6cde7c39eb2f0f0095f41570af89efc2c1ea828": 1
}

npx ts-node src/cli/get-tx-trace.ts --txHash 0xab6b8315187d3333f2cad87eb861203c856b6cb997b0d58f2d96b6ea1a42c258 --tracerFile src/tracers/call_address_tracer.js --timeout 20s

# https://etherscan.io/tx/0xa3446df7ce6e26dd510aea009790769f3379fbeb5671e9fa4e5091854e2cf36a
# Note: 5 internal transactions, too many false positives.
npx ts-node src/cli/get-tx-trace.ts --txHash 0xa3446df7ce6e26dd510aea009790769f3379fbeb5671e9fa4e5091854e2cf36a --tracerFile src/tracers/address_tracer.js

{
  "0x80e9540c204c05be63cfe44b43302780175b60ff": 1,
  "0x8f99ddc76cf23fef479b5ca1ab2b143c6d77198b": 1,
  "0xca30274b11140581cfbd7ddf7f48adb4f324377e": 1,
  "0x44b13a9ec5bba78a52a1e074e37a690eea45eaca": 1,
  "0xfa54969a776f57b6af8117b6b157b448b6c1ef7f": 1,
  "0x1788430620960f9a70e3dc14202a3a35dde1a316": 1,
  "0xa35e62e5eb729142643df04838e5c71113564fbd": 0.75,
  "0x629dbb4ecde5fa809fdc68cb1b75f6f43d7f5575": 1,
  "0x898b4cdaae3d6e638c5c139a3909c1928f63b63c": 1,
  "0xb355f12949091ac418c2dbd96704423f57aa5ecb": 1
}


# ERC20 transfer (many false positives)
# https://etherscan.io/tx/0x036f7b1da4c3b0d0359728852b4f7923c02b155c5b7d4d3aab55e6fda6ca50a1
npx ts-node src/cli/get-call-trace.ts --block 0x8baa3abf4faee54750a95f649236c116c4ec1660774ad5a3b4e00c84167ecbb7 --txFile test/tx/mainnet-test.json --tracerFile src/tracers/address_tracer.js
npx ts-node src/cli/get-tx-trace.ts --txHash 0x036f7b1da4c3b0d0359728852b4f7923c02b155c5b7d4d3aab55e6fda6ca50a1 --tracerFile src/tracers/address_tracer.js

{
  "0x9acbb72cf67103a30333a32cd203459c6a9c3311": 1,
  "0x66b6d6e78fbc4575f5197ae15af62f5dc7d48349": 1
}

```

## References

* https://geth.ethereum.org/docs/rpc/ns-debug#debug_tracetransaction
* https://golang.org/pkg/time/#ParseDuration
