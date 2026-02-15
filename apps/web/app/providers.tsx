"use client";

import "@rainbow-me/rainbowkit/styles.css";
import type React from "react";
import { RainbowKitProvider, getDefaultConfig, Locale } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, WagmiProvider } from "wagmi";
import { monadTestnet } from "../lib/chain";

const config = getDefaultConfig({
  appName: "FORGOOD",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "FORGOOD_PROJECT_ID",
  chains: [monadTestnet],
  transports: {
    [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0])
  },
  ssr: true
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider locale={"en" as Locale}>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
