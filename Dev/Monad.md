# Deploy a smart contract on Monad using Foundry

URL: https://docs.monad.xyz/guides/deploy-smart-contract/foundry

[Foundry](https://book.getfoundry.sh/) is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.

## Requirements

Before you begin, you need to install the following tools:

- [Rust](https://www.rust-lang.org/)

## 1. Installing `foundryup`

Foundryup is the official installer for the Foundry toolchain.

```sh
curl -L https://foundry.paradigm.xyz | bash
```

This will install Foundryup. Simply follow the on-screen instructions, and the `foundryup` command will become available in your CLI.

warning
Please make sure your `forge` version is `v1.5.0` and above.

You can check the version of `forge` by running

```bash
forge --version
```

## 2. Installing `forge` , `cast` , `anvil` and `chisel` binaries

```sh
foundryup
```

note
If you're on Windows, you'll need to use WSL, since Foundry currently doesn't work natively on Windows. Please follow [this link](https://learn.microsoft.com/en-us/windows/wsl/install) to learn more about WSL.

## 3. Create a new foundry project

tip
You can use `foundry-monad` template to create a new project.

*[Foundry-Monad](https://github.com/monad-developers/foundry-monad) is a Foundry template with Monad configuration.*

The below command uses `foundry-monad` to create a new foundry project:

```sh
forge init --template monad-developers/foundry-monad [project_name]
```

Alternatively, you can create a foundry project using the command below:

```sh
forge init [project_name]
```

## 4. Modify Foundry configuration

Update the `foundry.toml` file to add Monad Testnet configuration.

foundry.toml

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
# Monad Testnet Configuration
eth-rpc-url="https://testnet-rpc.monad.xyz"
chain_id = 10143
evm_version = "prague"
```

warning
When deploying to Monad, set `evm_version = "prague"` in your `foundry.toml` .

## 5. Write a smart contract

You can write your smart contracts under the `src` folder. There is already a `Counter` contract in the project located at `src/Counter.sol` .

Counter.sol src

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract Counter {
    uint256 public number;

    function setNumber(uint256 newNumber) public {
        number = newNumber;
    }

    function increment() public {
        number++;
    }
}
```

## 6. Compile the smart contract

```sh
forge compile
```

Compilation process output can be found in the newly created `out` directory, which includes contract ABI and bytecode.

## 7. Deploy the smart contract

note
For deploying contracts, we recommend using keystores instead of private keys.

### Get testnet funds

Deploying smart contracts requires testnet funds. Claim testnet funds via a [faucet](https://testnet.monad.xyz) .

### Deploy smart contract

- Using a Keystore (Recommended)
- Using a Private Key (Not Recommended)
Using a keystore is much safer than using a private key because keystore encrypts the private key and can later be referenced in any commands that require a private key.

Create a new keystore by importing a newly generated private key with the command below.

```sh
cast wallet import monad-deployer --private-key $(cast wallet new | grep 'Private key:' | awk '{print $3}')
```

Here is what the command above does, step by step:

- Generates a new private key
- Imports the private key into a keystore file named `monad-deployer`
- Prints the address of the newly created wallet to the console
After creating the keystore, you can read its address using:

```sh
cast wallet address --account monad-deployer
```

Provide a password to encrypt the keystore file when prompted and do not forget it.

Run the below command to deploy your smart contracts

```sh
forge create src/Counter.sol:Counter --account monad-deployer --broadcast
```

Use the below command to deploy a smart contract by directly pasting the private key in the terminal.

warning
Using a private key is not recommended. You should not be copying and pasting private keys into your terminal. Please use a keystore instead.

```sh
forge create --private-key <your_private_key> src/Counter.sol:Counter --broadcast
```

On successful deployment of the smart contract, the output should be similar to the following:

```sh
[⠊] Compiling...
Deployer: 0xB1aB62fdFC104512F594fCa0EF6ddd93FcEAF67b
Deployed to: 0x67329e4dc233512f06c16cF362EC3D44Cdc800e0
Transaction hash: 0xa0a40c299170c9077d321a93ec20c71e91b8aff54dd9fa33f08d6b61f8953ee0
```

### Next Steps

Check out [how to verify the deployed smart contract on MonadVision](/guides/verify-smart-contract/foundry) .


# How to build an MCP server that can interact with Monad Testnet

URL: https://docs.monad.xyz/guides/monad-mcp

In this guide, you will learn how to build a [Model Context Protocol](https://github.com/modelcontextprotocol) (MCP) server that allows an MCP Client (Claude Desktop) to query Monad Testnet to check the MON balance of an account.

## What is MCP?

The [Model Context Protocol](https://github.com/modelcontextprotocol) (MCP) is a standard that allows AI models to interact with external tools and services.

## Prerequisites

- Node.js (v16 or later)
- `npm` or `yarn`
- Claude Desktop

## Getting started

1. Clone the [`monad-mcp-tutorial`](https://github.com/monad-developers/monad-mcp-tutorial) repository. This repository has some code that can help you get started quickly.

```shell
git clone https://github.com/monad-developers/monad-mcp-tutorial.git
```

1. Install dependencies:

```text
npm install
```

## Building the MCP server

Monad Testnet-related configuration is already added to `index.ts` in the `src` folder.

### Define the server instance

index.ts src

```ts
// Create a new MCP server instance
const server = new McpServer({
  name: "monad-mcp-tutorial",
  version: "0.0.1",
  // Array of supported tool names that clients can call
  capabilities: ["get-mon-balance"]
});
```

### Define the MON balance tool

Below is the scaffold of the `get-mon-balance` tool:

index.ts src

```ts
server.tool(
    // Tool ID 
    "get-mon-balance",
    // Description of what the tool does
    "Get MON balance for an address on Monad testnet",
    // Input schema
    {
        address: z.string().describe("Monad testnet address to check balance for"),
    },
    // Tool implementation
    async ({ address }) => {
        // code to check MON balance
    }
);
```

Let's add the MON balance check implementation to the tool:

index.ts src

```ts
server.tool(
    // Tool ID 
    "get-mon-balance",
    // Description of what the tool does
    "Get MON balance for an address on Monad testnet",
    // Input schema
    {
        address: z.string().describe("Monad testnet address to check balance for"),
    },
    // Tool implementation
    async ({ address }) => {
        try {
            // Check MON balance for the input address
            const balance = await publicClient.getBalance({
                address: address as `0x${string}`,
            });

            // Return a human friendly message indicating the balance.
            return {
                content: [
                    {
                        type: "text",
                        text: `Balance for ${address}: ${formatUnits(balance, 18)} MON`,
                    },
                ],
            };
        } catch (error) {
            // If the balance check process fails, return a graceful message back to the MCP client indicating a failure.
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to retrieve balance for address: ${address}. Error: ${
                        error instanceof Error ? error.message : String(error)
                        }`,
                    },
                ],
            };
        }
    }
);
```

### Initialize the transport and server from the `main` function

index.ts src

```ts
async function main() {
    // Create a transport layer using standard input/output
    const transport = new StdioServerTransport();
    
    // Connect the server to the transport
    await server.connect(transport);
}
```

### Build the project

```shell
npm run build
```

The server is now ready to use!

### Add the MCP server to Claude Desktop

1. Open "Claude Desktop"
![claude desktop](https://github.com/monad-developers/monad-mcp-tutorial/blob/main/static/1.png?raw=true)

1. Open Settings
Claude > Settings > Developer

![claude settings](https://github.com/monad-developers/monad-mcp-tutorial/blob/main/static/claude_settings.gif?raw=true)

1. Open `claude_desktop_config.json`
![claude config](https://github.com/monad-developers/monad-mcp-tutorial/blob/main/static/config.gif?raw=true)

1. Add details about the MCP server and save the file.
claude_desktop_config.json

```json
{
  "mcpServers": {
    ...
    "monad-mcp": {
      "command": "node",
      "args": [
        "/<path-to-project>/build/index.js"
      ]
    }
  }
}
```

1. Restart "Claude Desktop"

### Use the MCP server

You should now be able to see the tools in Claude!

![tools](https://github.com/monad-developers/monad-mcp-tutorial/blob/main/static/tools.gif?raw=true)

Here's the final result

![final result](https://github.com/monad-developers/monad-mcp-tutorial/blob/main/static/final_result.gif?raw=true)

## Further resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/introduction)
- [Monad Documentation](https://docs.monad.xyz/)
- [Viem Documentation](https://viem.sh/)

# Verify a smart contract on Monad using Foundry

URL: https://docs.monad.xyz/guides/verify-smart-contract/foundry

Once your contract is deployed to a live network, the next step is to verify its source code on the block explorer.

Verifying a contract means uploading its source code, along with the settings used to compile the code, to a repository (typically maintained by a block explorer). This allows anyone to compile it and compare the generated bytecode with what is deployed on chain. Doing this is extremely important in an open platform like Monad.

In this guide we'll explain how to do this using [Foundry](https://getfoundry.sh/) .

warning
Please make sure your `forge` version is `v1.5.0` and above.

You can check the version of `forge` by running

```bash
forge --version
```

- Mainnet
- Testnet

- Foundry Monad template (Recommended)
- Default Foundry Project
note
The [`foundry-monad`](https://github.com/monad-developers/foundry-monad) template is configured for testnet by default. To use mainnet, update your `foundry.toml` file:

- Change `eth-rpc-url="https://testnet-rpc.monad.xyz"` to your mainnet RPC URL
- Change `chain_id = 10143` to `143`

If you are using [`foundry-monad`](https://github.com/monad-developers/foundry-monad) template, you can use the commands below based on your preferred block explorer:

- MonadVision
- Monadscan
- Socialscan

```sh
forge verify-contract \
    <contract_address> \
    <contract_name> \
    --chain 143 \
    --verifier sourcify \
    --verifier-url https://sourcify-api-monad.blockvision.org/
```

**Example:**

```sh
forge verify-contract \
    0x8fEc29BdEd7A618ab6E3CD945456A79163995769 \
    Counter \
    --chain 143 \
    --verifier sourcify \
    --verifier-url https://sourcify-api-monad.blockvision.org/
```

On successful verification of smart contract, you should get a similar output in your terminal:

```sh
Start verifying contract `0x8fEc29BdEd7A618ab6E3CD945456A79163995769` deployed on monad-mainnet
Attempting to verify on Sourcify. Pass the --etherscan-api-key <API_KEY> to verify on Etherscan, or use the --verifier flag to verify on another provider.

Submitting verification for [Counter] "0x8fEc29BdEd7A618ab6E3CD945456A79163995769".
Contract successfully verified
```

Now check the contract on MonadVision.

```sh
forge verify-contract \
    <contract_address> \
    <contract_name> \
    --chain 143 \
    --verifier etherscan \
    --etherscan-api-key YourApiKeyToken \
    --watch
```

**Example:**

```sh
forge verify-contract \
    0x8fEc29BdEd7A618ab6E3CD945456A79163995769 \
    Counter \
    --chain 143 \
    --verifier etherscan \
    --etherscan-api-key YourApiKeyToken \
    --watch
```

On successful verification of smart contract, you should get a similar output in your terminal:

```sh
Start verifying contract `0x8fEc29BdEd7A618ab6E3CD945456A79163995769` deployed on monad-mainnet

Submitting verification for [src/Counter.sol:Counter] 0x8fEc29BdEd7A618ab6E3CD945456A79163995769.
Submitted contract for verification:
        Response: `OK`
        GUID: `fhxxx4wsub68jce24ejvhe68fqabgtpmpzheqpdqvencgph1za`
        URL: https://monadscan.com/address/0x8fec29bded7a618ab6e3cd945456a79163995769
Contract verification status:
Response: `NOTOK`
Details: `Pending in queue`
Warning: Verification is still pending...; waiting 15 seconds before trying again (7 tries remaining)
Contract verification status:
Response: `OK`
Details: `Pass - Verified`
Contract successfully verified
```

Now check the contract on Monadscan.

```sh
forge verify-contract \
    <contract_address> \
    <contract_name> \
    --chain 143 \
    --watch \
    --etherscan-api-key <your_api_key> \
    --verifier-url https://api.socialscan.io/monad-mainnet/v1/explorer/command_api/contract \
    --verifier etherscan
```

**Example:**

```sh
forge verify-contract \
    0x8fEc29BdEd7A618ab6E3CD945456A79163995769 \
    Counter \
    --chain 143 \
    --watch \
    --etherscan-api-key test \
    --verifier-url https://api.socialscan.io/monad-mainnet/v1/explorer/command_api/contract \
    --verifier etherscan
```

On successful verification of smart contract, you should get a similar output in your terminal:

```sh
Start verifying contract `0x8fEc29BdEd7A618ab6E3CD945456A79163995769` deployed on monad-mainnet

Submitting verification for [src/Counter.sol:Counter] 0x8fEc29BdEd7A618ab6E3CD945456A79163995769.
Submitted contract for verification:
        Response: `Contract successfully verified`
        GUID: `33588004868f0677a3c23734da00fc42895a63542f61b1ed0dbfd2eb6893d7f4`
        URL: https://monad.socialscan.io/address/0x8fec29bded7a618ab6e3cd945456a79163995769
Contract verification status:
Response: `OK`
Details: `Pass - Verified`
Contract successfully verified
```

Now check the contract on Socialscan.

## 1. Update `foundry.toml` with Monad Configuration

foundry.toml

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
metadata = true
metadata_hash = "none"  # disable ipfs
use_literal_content = true # use source code

# Monad Configuration
eth-rpc-url="https://rpc.monad.xyz"
chain_id = 143
```

## 2. Verify the contract using one of the following block explorers:

- MonadVision
- Monadscan
- Socialscan
note
If you are using MonadVision, you can use [this guide](https://docs.blockvision.org/reference/verify-smart-contract-on-monad-explorer#/) . In particular, the [Verify Contract](https://monadvision.com/verify-contract) page provides a convenient way to verify your contract.

```sh
forge verify-contract \
    <contract_address> \
    <contract_name> \
    --chain 143 \
    --verifier sourcify \
    --verifier-url https://sourcify-api-monad.blockvision.org/
```

**Example:**

```sh
forge verify-contract \
    0x8fEc29BdEd7A618ab6E3CD945456A79163995769 \
    Counter \
    --chain 143 \
    --verifier sourcify \
    --verifier-url https://sourcify-api-monad.blockvision.org/
```

On successful verification of smart contract, you should get a similar output in your terminal:

```sh
Start verifying contract `0x8fEc29BdEd7A618ab6E3CD945456A79163995769` deployed on monad-mainnet
Attempting to verify on Sourcify. Pass the --etherscan-api-key <API_KEY> to verify on Etherscan, or use the --verifier flag to verify on another provider.

Submitting verification for [Counter] "0x8fEc29BdEd7A618ab6E3CD945456A79163995769".
Contract successfully verified
```

Now check the contract on MonadVision.

```sh
forge verify-contract \
    <contract_address> \
    <contract_name> \
    --chain 143 \
    --verifier etherscan \
    --etherscan-api-key YourApiKeyToken \
    --watch
```

**Example:**

```sh
forge verify-contract \
    0x8fEc29BdEd7A618ab6E3CD945456A79163995769 \
    Counter \
    --chain 143 \
    --verifier etherscan \
    --etherscan-api-key YourApiKeyToken \
    --watch
```

On successful verification of smart contract, you should get a similar output in your terminal:

```sh
Start verifying contract `0x8fEc29BdEd7A618ab6E3CD945456A79163995769` deployed on monad-mainnet

Submitting verification for [src/Counter.sol:Counter] 0x8fEc29BdEd7A618ab6E3CD945456A79163995769.
Submitted contract for verification:
        Response: `OK`
        GUID: `fhxxx4wsub68jce24ejvhe68fqabgtpmpzheqpdqvencgph1za`
        URL: https://monadscan.com/address/0x8fec29bded7a618ab6e3cd945456a79163995769
Contract verification status:
Response: `NOTOK`
Details: `Pending in queue`
Warning: Verification is still pending...; waiting 15 seconds before trying again (7 tries remaining)
Contract verification status:
Response: `OK`
Details: `Pass - Verified`
Contract successfully verified
```

Now check the contract on Monadscan.

```sh
forge verify-contract \
    <contract_address> \
    <contract_name> \
    --chain 143 \
    --watch \
    --etherscan-api-key <your_api_key> \
    --verifier-url https://api.socialscan.io/monad-mainnet/v1/explorer/command_api/contract \
    --verifier etherscan
```

**Example:**

```sh
forge verify-contract \
    0x8fEc29BdEd7A618ab6E3CD945456A79163995769 \
    Counter \
    --chain 143 \
    --watch \
    --etherscan-api-key test \
    --verifier-url https://api.socialscan.io/monad-mainnet/v1/explorer/command_api/contract \
    --verifier etherscan
```

On successful verification of smart contract, you should get a similar output in your terminal:

```sh
Start verifying contract `0x8fEc29BdEd7A618ab6E3CD945456A79163995769` deployed on monad-mainnet

Submitting verification for [src/Counter.sol:Counter] 0x8fEc29BdEd7A618ab6E3CD945456A79163995769.
Submitted contract for verification:
        Response: `Contract successfully verified`
        GUID: `33588004868f0677a3c23734da00fc42895a63542f61b1ed0dbfd2eb6893d7f4`
        URL: https://monad.socialscan.io/address/0x8fec29bded7a618ab6e3cd945456a79163995769
Contract verification status:
Response: `OK`
Details: `Pass - Verified`
Contract successfully verified
```

Now check the contract on Socialscan.

- Foundry Monad template (Recommended)
- Default Foundry Project
If you are using [`foundry-monad`](https://github.com/monad-developers/foundry-monad) template, you can use the commands below based on your preferred block explorer:

- MonadVision
- Monadscan
- Socialscan

```sh
forge verify-contract \
    <contract_address> \
    <contract_name> \
    --chain 10143 \
    --verifier sourcify \
    --verifier-url https://sourcify-api-monad.blockvision.org/
```

**Example:**

```sh
forge verify-contract \
    0x8fEc29BdEd7A618ab6E3CD945456A79163995769 \
    Counter \
    --chain 10143 \
    --verifier sourcify \
    --verifier-url https://sourcify-api-monad.blockvision.org/
```

On successful verification of smart contract, you should get a similar output in your terminal:

```sh
Start verifying contract `0x8fEc29BdEd7A618ab6E3CD945456A79163995769` deployed on monad-testnet
Attempting to verify on Sourcify. Pass the --etherscan-api-key <API_KEY> to verify on Etherscan, or use the --verifier flag to verify on another provider.

Submitting verification for [Counter] "0x8fEc29BdEd7A618ab6E3CD945456A79163995769".
Contract successfully verified
```

Now check the contract on [MonadVision](https://testnet.monadvision.com/) .

```sh
forge verify-contract \
    <contract_address> \
    <contract_name> \
    --chain 10143 \
    --verifier etherscan \
    --etherscan-api-key YourApiKeyToken \
    --watch
```

**Example:**

```sh
forge verify-contract \
    0x8fEc29BdEd7A618ab6E3CD945456A79163995769 \
    Counter \
    --chain 10143 \
    --verifier etherscan \
    --etherscan-api-key YourApiKeyToken \
    --watch
```

On successful verification of smart contract, you should get a similar output in your terminal:

```sh
Start verifying contract `0x8fEc29BdEd7A618ab6E3CD945456A79163995769` deployed on monad-testnet

Submitting verification for [src/Counter.sol:Counter] 0x8fEc29BdEd7A618ab6E3CD945456A79163995769.
Submitted contract for verification:
        Response: `OK`
        GUID: `fhxxx4wsub68jce24ejvhe68fqabgtpmpzheqpdqvencgph1za`
        URL: https://testnet.monadscan.com/address/0x8fec29bded7a618ab6e3cd945456a79163995769
Contract verification status:
Response: `NOTOK`
Details: `Pending in queue`
Warning: Verification is still pending...; waiting 15 seconds before trying again (7 tries remaining)
Contract verification status:
Response: `OK`
Details: `Pass - Verified`
Contract successfully verified
```

Now check the contract on [Monadscan](https://testnet.monadscan.com/) .

```sh
forge verify-contract \
    <contract_address> \
    <contract_name> \
    --chain 10143 \
    --watch \
    --etherscan-api-key <your_api_key> \
    --verifier-url https://api.socialscan.io/monad-testnet/v1/explorer/command_api/contract \
    --verifier etherscan
```

**Example:**

```sh
forge verify-contract \
    0x8fEc29BdEd7A618ab6E3CD945456A79163995769 \
    Counter \
    --chain 10143 \
    --watch \
    --etherscan-api-key test \
    --verifier-url https://api.socialscan.io/monad-testnet/v1/explorer/command_api/contract \
    --verifier etherscan
```

On successful verification of smart contract, you should get a similar output in your terminal:

```sh
Start verifying contract `0x8fEc29BdEd7A618ab6E3CD945456A79163995769` deployed on monad-testnet

Submitting verification for [src/Counter.sol:Counter] 0x8fEc29BdEd7A618ab6E3CD945456A79163995769.
Submitted contract for verification:
        Response: `Contract successfully verified`
        GUID: `33588004868f0677a3c23734da00fc42895a63542f61b1ed0dbfd2eb6893d7f4`
        URL: https://api.socialscan.io/monad-testnet/v1/explorer/command_api/address/0x8fec29bded7a618ab6e3cd945456a79163995769
Contract verification status:
Response: `OK`
Details: `Pass - Verified`
Contract successfully verified
```

Now check the contract on [Socialscan](https://testnet.socialscan.io/) .

tip
If you use [`foundry-monad`](https://github.com/monad-developers/foundry-monad) you can skip the configuration step

## 1. Update `foundry.toml` with Monad Configuration

foundry.toml

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]  
metadata = true
metadata_hash = "none"  # disable ipfs
use_literal_content = true # use source code

# Monad Configuration
eth-rpc-url="https://testnet-rpc.monad.xyz"
chain_id = 10143
```

## 2. Verify the contract using one of the following block explorers:

- MonadVision
- Monadscan
- Socialscan

```sh
forge verify-contract \
    <contract_address> \
    <contract_name> \
    --chain 10143 \
    --verifier sourcify \
    --verifier-url https://sourcify-api-monad.blockvision.org/
```

**Example:**

```sh
forge verify-contract \
    0x8fEc29BdEd7A618ab6E3CD945456A79163995769 \
    Counter \
    --chain 10143 \
    --verifier sourcify \
    --verifier-url https://sourcify-api-monad.blockvision.org/
```

On successful verification of smart contract, you should get a similar output in your terminal:

```sh
Start verifying contract `0x8fEc29BdEd7A618ab6E3CD945456A79163995769` deployed on monad-testnet
Attempting to verify on Sourcify. Pass the --etherscan-api-key <API_KEY> to verify on Etherscan, or use the --verifier flag to verify on another provider.

Submitting verification for [Counter] "0x8fEc29BdEd7A618ab6E3CD945456A79163995769".
Contract successfully verified
```

Now check the contract on [MonadVision](https://testnet.monadvision.com/) .

```sh
forge verify-contract \
    <contract_address> \
    <contract_name> \
    --chain 10143 \
    --verifier etherscan \
    --etherscan-api-key YourApiKeyToken \
    --watch
```

**Example:**

```sh
forge verify-contract \
    0x8fEc29BdEd7A618ab6E3CD945456A79163995769 \
    Counter \
    --chain 10143 \
    --verifier etherscan \
    --etherscan-api-key YourApiKeyToken \
    --watch
```

On successful verification of smart contract, you should get a similar output in your terminal:

```sh
Start verifying contract `0x8fEc29BdEd7A618ab6E3CD945456A79163995769` deployed on monad-testnet

Submitting verification for [src/Counter.sol:Counter] 0x8fEc29BdEd7A618ab6E3CD945456A79163995769.
Submitted contract for verification:
        Response: `OK`
        GUID: `fhxxx4wsub68jce24ejvhe68fqabgtpmpzheqpdqvencgph1za`
        URL: https://testnet.monadvision.com/address/0x8fec29bded7a618ab6e3cd945456a79163995769
Contract verification status:
Response: `NOTOK`
Details: `Pending in queue`
Warning: Verification is still pending...; waiting 15 seconds before trying again (7 tries remaining)
Contract verification status:
Response: `OK`
Details: `Pass - Verified`
Contract successfully verified
```

Now check the contract on [Monadscan](https://testnet.monadscan.com/) .

```sh
forge verify-contract \
    <contract_address> \
    <contract_name> \
    --chain 10143 \
    --watch \
    --etherscan-api-key <your_api_key> \
    --verifier-url https://api.socialscan.io/monad-testnet/v1/explorer/command_api/contract \
    --verifier etherscan
```

**Example:**

```sh
forge verify-contract \
    0x8fEc29BdEd7A618ab6E3CD945456A79163995769 \
    Counter \
    --chain 10143 \
    --watch \
    --etherscan-api-key test \
    --verifier-url https://api.socialscan.io/monad-testnet/v1/explorer/command_api/contract \
    --verifier etherscan
```

On successful verification of smart contract, you should get a similar output in your terminal:

```sh
Start verifying contract `0x8fEc29BdEd7A618ab6E3CD945456A79163995769` deployed on monad-testnet

Submitting verification for [src/Counter.sol:Counter] 0x8fEc29BdEd7A618ab6E3CD945456A79163995769.
Submitted contract for verification:
        Response: `Contract successfully verified`
        GUID: `33588004868f0677a3c23734da00fc42895a63542f61b1ed0dbfd2eb6893d7f4`
        URL: https://testnet.monadvision.com/address/0x8fec29bded7a618ab6e3cd945456a79163995769
Contract verification status:
Response: `OK`
Details: `Pass - Verified`
Contract successfully verified
```

Now check the contract on [Socialscan](https://testnet.socialscan.io/) .


# Nad.fun

> Meme coin launchpad on Monad with bonding curve mechanics. Create, trade, and graduate tokens to Capricorn DEX.

**Website:** https://nad.fun

## How It Works

1. **Create** a token on the bonding curve (or buy an existing one)
2. **Trade** on the bonding curve - price increases as more tokens are bought
3. **Graduate** - when target liquidity is reached, token migrates to Capricorn DEX with locked liquidity

## Documentation

- [Overview](https://nad.fun/skill.md): Architecture, constants, setup guide
- [Trading](https://nad.fun/trading.md): Buy, sell, permit signatures
- [Token Creation](https://nad.fun/create.md): Launch tokens with image, metadata upload
- [Quotes](https://nad.fun/quote.md): Price quotes, curve state queries
- [Token Info](https://nad.fun/token.md): Balances, metadata, transfers
- [Indexer](https://nad.fun/indexer.md): Historical event querying
- [Agent API](https://nad.fun/agent-api.md): REST API for AI agents and bots
- [Wallet](https://nad.fun/wallet.md): Wallet operations

## Optional

- [ABI Reference](https://nad.fun/abi.md): Smart contract ABIs with full type definitions