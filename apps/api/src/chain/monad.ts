import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  type PublicClient,
  type WalletClient,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "../config/chain";

// ─── Environment ────────────────────────────────────────────
const MONAD_RPC_URL = process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS as `0x${string}` | undefined;
const FORGOOD_TOKEN_ADDRESS = process.env.FORGOOD_TOKEN_ADDRESS as `0x${string}` | undefined;
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS as `0x${string}` | undefined;
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;

// ─── ABIs ───────────────────────────────────────────────────

export const erc20Abi = [
  {
    type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function", name: "symbol", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function", name: "decimals", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export const treasuryAbi = [
  {
    type: "function", name: "releaseReward", stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function", name: "token", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function", name: "authorizedRegistry", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },
] as const;

export const registryAbi = [
  {
    type: "function", name: "proposeMission", stateMutability: "nonpayable",
    inputs: [{ name: "metadataHash", type: "bytes32" }],
    outputs: [{ name: "missionId", type: "uint256" }],
  },
  {
    type: "function", name: "evaluateMission", stateMutability: "nonpayable",
    inputs: [
      { name: "missionId", type: "uint256" },
      { name: "rewardAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function", name: "activateMission", stateMutability: "nonpayable",
    inputs: [{ name: "missionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function", name: "submitProof", stateMutability: "nonpayable",
    inputs: [
      { name: "missionId", type: "uint256" },
      { name: "proofHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function", name: "verifyMission", stateMutability: "nonpayable",
    inputs: [
      { name: "missionId", type: "uint256" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function", name: "rewardMission", stateMutability: "nonpayable",
    inputs: [{ name: "missionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function", name: "missions", stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "proposer", type: "address" },
      { name: "claimer", type: "address" },
      { name: "metadataHash", type: "bytes32" },
      { name: "proofHash", type: "bytes32" },
      { name: "rewardAmount", type: "uint256" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "function", name: "nextMissionId", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── Clients ────────────────────────────────────────────────

export const publicClient: PublicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(MONAD_RPC_URL),
});

let _walletClient: WalletClient | null = null;

export function getWalletClient(): WalletClient {
  if (_walletClient) return _walletClient;
  if (!AGENT_PRIVATE_KEY) {
    throw new Error("AGENT_PRIVATE_KEY is not set — on-chain writes disabled");
  }
  const account = privateKeyToAccount(AGENT_PRIVATE_KEY);
  _walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(MONAD_RPC_URL),
  });
  return _walletClient;
}

// ─── Helpers ────────────────────────────────────────────────

/** Wait for tx receipt with a timeout (Monad finality is ~800ms) */
async function waitForTx(hash: Hash, timeoutMs = 15_000) {
  return publicClient.waitForTransactionReceipt({ hash, timeout: timeoutMs });
}

/** Check if a string looks like a valid 0x address (20 bytes = 40 hex chars) */
function isValidAddress(addr: string | undefined): addr is `0x${string}` {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function requireAddress(name: string, addr: string | undefined): `0x${string}` {
  if (!addr) throw new Error(`${name} environment variable is not set`);
  if (!isValidAddress(addr)) throw new Error(`${name} is not a valid Ethereum address: ${addr}`);
  return addr;
}

// ─── Treasury Reads ─────────────────────────────────────────

export async function getTreasuryBalance(): Promise<bigint> {
  const treasury = requireAddress("TREASURY_ADDRESS", TREASURY_ADDRESS);
  const token = requireAddress("FORGOOD_TOKEN_ADDRESS", FORGOOD_TOKEN_ADDRESS);

  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [treasury],
  }) as Promise<bigint>;
}

// ─── Treasury Writes ────────────────────────────────────────

export async function releaseReward(recipient: `0x${string}`, amount: bigint): Promise<Hash> {
  const treasury = requireAddress("TREASURY_ADDRESS", TREASURY_ADDRESS);
  const walletClient = getWalletClient();

  // Monad charges gas on gas_limit, not gas_used. Estimate first.
  const gas = await publicClient.estimateContractGas({
    address: treasury,
    abi: treasuryAbi,
    functionName: "releaseReward",
    args: [recipient, amount],
    account: walletClient.account!,
  });

  const hash = await walletClient.writeContract({
    chain: monadTestnet,
    account: walletClient.account!,
    address: treasury,
    abi: treasuryAbi,
    functionName: "releaseReward",
    args: [recipient, amount],
    gas: gas + (gas / 10n), // +10% buffer
  });

  await waitForTx(hash);
  return hash;
}

// ─── Registry Writes ────────────────────────────────────────

export async function proposeMissionOnChain(metadataHash: `0x${string}`): Promise<{ hash: Hash }> {
  const registry = requireAddress("REGISTRY_ADDRESS", REGISTRY_ADDRESS);
  const walletClient = getWalletClient();

  const hash = await walletClient.writeContract({
    chain: monadTestnet,
    account: walletClient.account!,
    address: registry,
    abi: registryAbi,
    functionName: "proposeMission",
    args: [metadataHash],
  });

  await waitForTx(hash);
  return { hash };
}

export async function evaluateMissionOnChain(missionId: bigint, rewardAmount: bigint): Promise<Hash> {
  const registry = requireAddress("REGISTRY_ADDRESS", REGISTRY_ADDRESS);
  const walletClient = getWalletClient();

  const hash = await walletClient.writeContract({
    chain: monadTestnet,
    account: walletClient.account!,
    address: registry,
    abi: registryAbi,
    functionName: "evaluateMission",
    args: [missionId, rewardAmount],
  });

  await waitForTx(hash);
  return hash;
}

export async function activateMissionOnChain(missionId: bigint): Promise<Hash> {
  const registry = requireAddress("REGISTRY_ADDRESS", REGISTRY_ADDRESS);
  const walletClient = getWalletClient();

  const hash = await walletClient.writeContract({
    chain: monadTestnet,
    account: walletClient.account!,
    address: registry,
    abi: registryAbi,
    functionName: "activateMission",
    args: [missionId],
  });

  await waitForTx(hash);
  return hash;
}

export async function verifyMissionOnChain(missionId: bigint, approved: boolean): Promise<Hash> {
  const registry = requireAddress("REGISTRY_ADDRESS", REGISTRY_ADDRESS);
  const walletClient = getWalletClient();

  const hash = await walletClient.writeContract({
    chain: monadTestnet,
    account: walletClient.account!,
    address: registry,
    abi: registryAbi,
    functionName: "verifyMission",
    args: [missionId, approved],
  });

  await waitForTx(hash);
  return hash;
}

export async function rewardMissionOnChain(missionId: bigint): Promise<Hash> {
  const registry = requireAddress("REGISTRY_ADDRESS", REGISTRY_ADDRESS);
  const walletClient = getWalletClient();

  // This call triggers treasury.releaseReward() internally
  const gas = await publicClient.estimateContractGas({
    address: registry,
    abi: registryAbi,
    functionName: "rewardMission",
    args: [missionId],
    account: walletClient.account!,
  });

  const hash = await walletClient.writeContract({
    chain: monadTestnet,
    account: walletClient.account!,
    address: registry,
    abi: registryAbi,
    functionName: "rewardMission",
    args: [missionId],
    gas: gas + (gas / 5n), // +20% buffer for cross-contract call
  });

  await waitForTx(hash);
  return hash;
}

// ─── Registry Reads ─────────────────────────────────────────

export async function getMissionOnChain(missionId: bigint) {
  const registry = requireAddress("REGISTRY_ADDRESS", REGISTRY_ADDRESS);

  const result = await publicClient.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "missions",
    args: [missionId],
  });

  const [proposer, claimer, metadataHash, proofHash, rewardAmount, status] = result as [
    string, string, string, string, bigint, number
  ];

  const statusNames = ["Proposed", "Evaluated", "Active", "ProofSubmitted", "Verified", "Rejected", "Rewarded"];
  return { proposer, claimer, metadataHash, proofHash, rewardAmount, status: statusNames[status] ?? "Unknown" };
}

export function toRewardAmount(amount: string, decimals = 18) {
  return parseUnits(amount, decimals);
}

/** Check if on-chain features are available (env vars set AND valid hex addresses) */
export function isOnChainEnabled(): boolean {
  return !!(
    AGENT_PRIVATE_KEY &&
    /^0x[0-9a-fA-F]{64}$/.test(AGENT_PRIVATE_KEY) &&
    isValidAddress(TREASURY_ADDRESS) &&
    isValidAddress(FORGOOD_TOKEN_ADDRESS)
  );
}
