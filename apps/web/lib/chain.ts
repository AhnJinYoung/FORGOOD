import { defineChain } from "viem";
import { MONAD_TESTNET_CHAIN_ID, MONAD_TESTNET_RPC, MONAD_EXPLORER_TESTNET } from "@forgood/shared";

export const monadTestnet = defineChain({
  id: MONAD_TESTNET_CHAIN_ID,
  name: "Monad Testnet",
  network: "monad-testnet",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [MONAD_TESTNET_RPC],
    },
  },
  blockExplorers: {
    default: {
      name: "MonadVision",
      url: MONAD_EXPLORER_TESTNET,
    },
  },
  testnet: true,
});
