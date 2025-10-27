import * as evedexSdk from "@evedex/exchange-bot-sdk";
import WebSocket from "ws";

const sdkInit = async () => {
  // parse command line args privatekey for wallet and api key as second arg

  const args = process.argv.slice(2);

  if (!args[0] || !args[1]) {
    console.error(
      "Pass private key as first argument and api key as second argument"
    );

    process.exit(1);
  }

  const walletPrivateKey = args[0];

  const apiKey = args[1];

  const pair = args[2] ?? "BTCUSDT:DEMO";

  const leverage = parseInt(args[3] ?? "100");

  const interval = parseInt(args[4] ?? "60000");

  console.log("Using wallet private key:", walletPrivateKey);
  console.log("Using api key:", apiKey);
  console.log("Sdk init...");

  const cfg = {
    centrifugeWebSocket: WebSocket,
    wallets: { botWallet: { privateKey: walletPrivateKey } },
    apiKeys: { botApiKey: { apiKey } },
  };

  const container = new evedexSdk.DemoContainer(cfg);

  const account = await container.account("botWallet");

  const accountBalance = account.getBalance();
	
	await accountBalance.listen();

	accountBalance.onOrderUpdate((order) => {
		console.info("Order update", order);
	});

	accountBalance.onPositionUpdate((position) => {
		console.info("Position update", position);
	});

  console.info("Bot data", await account.fetchMe());

  return { account, accountBalance, pair, leverage, interval };
};

async function main() {
  try {
    const {
      account,
      accountBalance: balance,
      pair,
      leverage,
      interval,
    } = await sdkInit();

    let tradingInProcess = false;

    const tradingCycleTimer = setInterval(async () => {
      if (tradingInProcess) {
        console.log(
          "Previous trading cycle is still in process, skipping this cycle"
        );
        return;
      }

      tradingInProcess = true;

      const { availableBalance } = await account.fetchAvailableBalance();

      console.info("Available balance is:", availableBalance);

      const botPosition = await balance.getPosition(pair);

      console.info(`Current position for ${pair}:`, botPosition);

      if (botPosition && botPosition.quantity > 0) {
        console.log(`Position for ${pair} exists, closing it...`);

        await account.createClosePositionOrderV2({
          instrument: pair,
          leverage,
          quantity: botPosition.quantity,
        });

        console.log(`Position for ${pair} closed`);

        tradingInProcess = false;

        return;
      }

      await account.createMarketOrderV2({
        instrument: pair,
        side: evedexSdk.Side.Buy,
        // here we use 90% of available balance to leave some margin for fees
        cashQuantity: Number(availableBalance) * 0.9,
        timeInForce: evedexSdk.TimeInForce.FOK,
        leverage,
      });
    }, interval);

    process.on("SIGINT", () => {
      console.log("Shutdown signal received. Exiting...");

      clearInterval(tradingCycleTimer);

      process.exit(0);
    });
  } catch (error) {
    console.error("Error happened:", error);
    process.exit(1);
  }
}

main();
