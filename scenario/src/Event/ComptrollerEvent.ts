import {Event} from '../Event';
import {addAction, describeUser, World} from '../World';
import {decodeCall, getPastEvents} from '../Contract';
import {Comptroller} from '../Contract/Comptroller';
import {ComptrollerImpl} from '../Contract/ComptrollerImpl';
import {AToken} from '../Contract/AToken';
import {invoke} from '../Invokation';
import {
  getAddressV,
  getBoolV,
  getEventV,
  getExpNumberV,
  getNumberV,
  getPercentV,
  getStringV,
  getCoreValue
} from '../CoreValue';
import {
  AddressV,
  BoolV,
  EventV,
  NumberV,
  StringV
} from '../Value';
import {Arg, Command, View, processCommandEvent} from '../Command';
import {buildComptrollerImpl} from '../Builder/ComptrollerImplBuilder';
import {ComptrollerErrorReporter} from '../ErrorReporter';
import {getComptroller, getComptrollerImpl} from '../ContractLookup';
import {getLiquidity} from '../Value/ComptrollerValue';
import {getATokenV} from '../Value/ATokenValue';
import {encodedNumber} from '../Encoding';
import {encodeABI, rawValues} from "../Utils";

async function genComptroller(world: World, from: string, params: Event): Promise<World> {
  let {world: nextWorld, comptrollerImpl: comptroller, comptrollerImplData: comptrollerData} = await buildComptrollerImpl(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Added Comptroller (${comptrollerData.description}) at address ${comptroller._address}`,
    comptrollerData.invokation
  );

  return world;
};

async function setPaused(world: World, from: string, comptroller: Comptroller, actionName: string, isPaused: boolean): Promise<World> {
  const pauseMap = {
    "Mint": comptroller.methods._setMintPaused
  };

  if (!pauseMap[actionName]) {
    throw `Cannot find pause function for action "${actionName}"`;
  }

  let invokation = await invoke(world, comptroller[actionName]([isPaused]), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Comptroller: set paused for ${actionName} to ${isPaused}`,
    invokation
  );

  return world;
}

async function setMaxAssets(world: World, from: string, comptroller: Comptroller, numberOfAssets: NumberV): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._setMaxAssets(numberOfAssets.encode()), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Set max assets to ${numberOfAssets.show()}`,
    invokation
  );

  return world;
}

async function setLiquidationIncentive(world: World, from: string, comptroller: Comptroller, liquidationIncentive: NumberV): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._setLiquidationIncentive(liquidationIncentive.encode()), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Set liquidation incentive to ${liquidationIncentive.show()}`,
    invokation
  );

  return world;
}

async function supportMarket(world: World, from: string, comptroller: Comptroller, aToken: AToken): Promise<World> {
  if (world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world.printer.printLine(`Dry run: Supporting market  \`${aToken._address}\``);
    return world;
  }

  let invokation = await invoke(world, comptroller.methods._supportMarket(aToken._address), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Supported market ${aToken.name}`,
    invokation
  );

  return world;
}

async function unlistMarket(world: World, from: string, comptroller: Comptroller, aToken: AToken): Promise<World> {
  let invokation = await invoke(world, comptroller.methods.unlist(aToken._address), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Unlisted market ${aToken.name}`,
    invokation
  );

  return world;
}

async function enterMarkets(world: World, from: string, comptroller: Comptroller, assets: string[]): Promise<World> {
  let invokation = await invoke(world, comptroller.methods.enterMarkets(assets), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Called enter assets ${assets} as ${describeUser(world, from)}`,
    invokation
  );

  return world;
}

async function exitMarket(world: World, from: string, comptroller: Comptroller, asset: string): Promise<World> {
  let invokation = await invoke(world, comptroller.methods.exitMarket(asset), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Called exit market ${asset} as ${describeUser(world, from)}`,
    invokation
  );

  return world;
}

async function setPriceOracle(world: World, from: string, comptroller: Comptroller, priceOracleAddr: string): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._setPriceOracle(priceOracleAddr), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Set price oracle for to ${priceOracleAddr} as ${describeUser(world, from)}`,
    invokation
  );

  return world;
}

async function setCollateralFactor(world: World, from: string, comptroller: Comptroller, aToken: AToken, collateralFactor: NumberV): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._setCollateralFactor(aToken._address, collateralFactor.encode()), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Set collateral factor for ${aToken.name} to ${collateralFactor.show()}`,
    invokation
  );

  return world;
}

async function setCloseFactor(world: World, from: string, comptroller: Comptroller, closeFactor: NumberV): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._setCloseFactor(closeFactor.encode()), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Set close factor to ${closeFactor.show()}`,
    invokation
  );

  return world;
}

async function fastForward(world: World, from: string, comptroller: Comptroller, blocks: NumberV): Promise<World> {
  let invokation = await invoke(world, comptroller.methods.fastForward(blocks.encode()), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Fast forward ${blocks.show()} blocks to #${invokation.value}`,
    invokation
  );

  return world;
}

async function sendAny(world: World, from:string, comptroller: Comptroller, signature: string, callArgs: string[]): Promise<World> {
  const fnData = encodeABI(world, signature, callArgs);
  await world.web3.eth.sendTransaction({
      to: comptroller._address,
      data: fnData,
      from: from
    })
  return world;
}

async function addAltMarkets(world: World, from: string, comptroller: Comptroller, aTokens: AToken[]): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._addAltMarkets(aTokens.map(c => c._address)), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Added ALT markets ${aTokens.map(c => c.name)}`,
    invokation
  );

  return world;
}

async function dropAltMarket(world: World, from: string, comptroller: Comptroller, aToken: AToken): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._dropAltMarket(aToken._address), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Drop ALT market ${aToken.name}`,
    invokation
  );

  return world;
}

async function refreshAltSpeeds(world: World, from: string, comptroller: Comptroller): Promise<World> {
  let invokation = await invoke(world, comptroller.methods.refreshAltSpeeds(), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Refreshed ALT speeds`,
    invokation
  );

  return world;
}

async function claimAlt(world: World, from: string, comptroller: Comptroller, holder: string): Promise<World> {
  let invokation = await invoke(world, comptroller.methods.claimAlt(holder), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Alt claimed by ${holder}`,
    invokation
  );

  return world;
}

async function claimAltInMarkets(world: World, from: string, comptroller: Comptroller, holder: string, aTokens: AToken[]): Promise<World> {
  let invokation = await invoke(world, comptroller.methods.claimAlt(holder, aTokens.map(c => c._address)), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Alt claimed by ${holder} in markets ${aTokens.map(c => c.name)}`,
    invokation
  );

  return world;
}

async function updateContributorRewards(world: World, from: string, comptroller: Comptroller, contributor: string): Promise<World> {
  let invokation = await invoke(world, comptroller.methods.updateContributorRewards(contributor), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Contributor rewards updated for ${contributor}`,
    invokation
  );

  return world;
}

async function grantAlt(world: World, from: string, comptroller: Comptroller, recipient: string, amount: NumberV): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._grantAlt(recipient, amount.encode()), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `${amount.show()} alt granted to ${recipient}`,
    invokation
  );

  return world;
}

async function setAltRate(world: World, from: string, comptroller: Comptroller, rate: NumberV): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._setAltRate(rate.encode()), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Alt rate set to ${rate.show()}`,
    invokation
  );

  return world;
}

async function setAltSpeed(world: World, from: string, comptroller: Comptroller, aToken: AToken, speed: NumberV): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._setAltSpeed(aToken._address, speed.encode()), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Alt speed for market ${aToken._address} set to ${speed.show()}`,
    invokation
  );

  return world;
}

async function setAltSpeeds(world: World, from: string, comptroller: Comptroller, aTokens: AToken[], supplySpeeds: NumberV[], borrowSpeeds: NumberV[]): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._setAltSpeeds(aTokens.map(c => c._address), supplySpeeds.map(speed => speed.encode()), borrowSpeeds.map(speed => speed.encode())), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Alt speed for markets [${aTokens.map(c => c._address)}] set to supplySpeeds=[${supplySpeeds.map(speed => speed.show())}, borrowSpeeds=[${borrowSpeeds.map(speed => speed.show())}]`,
    invokation
  );

  return world;
}

async function setContributorAltSpeed(world: World, from: string, comptroller: Comptroller, contributor: string, speed: NumberV): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._setContributorAltSpeed(contributor, speed.encode()), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Alt speed for contributor ${contributor} set to ${speed.show()}`,
    invokation
  );

  return world;
}

async function printLiquidity(world: World, comptroller: Comptroller): Promise<World> {
  let enterEvents = await getPastEvents(world, comptroller, 'StdComptroller', 'MarketEntered');
  let addresses = enterEvents.map((event) => event.returnValues['account']);
  let uniq = [...new Set(addresses)];

  world.printer.printLine("Liquidity:")

  const liquidityMap = await Promise.all(uniq.map(async (address) => {
    let userLiquidity = await getLiquidity(world, comptroller, address);

    return [address, userLiquidity.val];
  }));

  liquidityMap.forEach(([address, liquidity]) => {
    world.printer.printLine(`\t${world.settings.lookupAlias(address)}: ${liquidity / 1e18}e18`)
  });

  return world;
}

async function setPendingAdmin(world: World, from: string, comptroller: Comptroller, newPendingAdmin: string): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._setPendingAdmin(newPendingAdmin), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Comptroller: ${describeUser(world, from)} sets pending admin to ${newPendingAdmin}`,
    invokation
  );

  return world;
}

async function acceptAdmin(world: World, from: string, comptroller: Comptroller): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._acceptAdmin(), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Comptroller: ${describeUser(world, from)} accepts admin`,
    invokation
  );

  return world;
}

async function setPauseGuardian(world: World, from: string, comptroller: Comptroller, newPauseGuardian: string): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._setPauseGuardian(newPauseGuardian), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Comptroller: ${describeUser(world, from)} sets pause guardian to ${newPauseGuardian}`,
    invokation
  );

  return world;
}

async function setGuardianPaused(world: World, from: string, comptroller: Comptroller, action: string, state: boolean): Promise<World> {
  let fun;
  switch(action){
    case "Transfer":
      fun = comptroller.methods._setTransferPaused
      break;
    case "Seize":
      fun = comptroller.methods._setSeizePaused
      break;
  }
  let invokation = await invoke(world, fun(state), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Comptroller: ${describeUser(world, from)} sets ${action} paused`,
    invokation
  );

  return world;
}

async function setGuardianMarketPaused(world: World, from: string, comptroller: Comptroller, aToken: AToken, action: string, state: boolean): Promise<World> {
  let fun;
  switch(action){
    case "Mint":
      fun = comptroller.methods._setMintPaused
      break;
    case "Borrow":
      fun = comptroller.methods._setBorrowPaused
      break;
  }
  let invokation = await invoke(world, fun(aToken._address, state), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Comptroller: ${describeUser(world, from)} sets ${action} paused`,
    invokation
  );

  return world;
}

async function setMarketBorrowCaps(world: World, from: string, comptroller: Comptroller, aTokens: AToken[], borrowCaps: NumberV[]): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._setMarketBorrowCaps(aTokens.map(c => c._address), borrowCaps.map(c => c.encode())), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Borrow caps on ${aTokens} set to ${borrowCaps}`,
    invokation
  );

  return world;
}

async function setBorrowCapGuardian(world: World, from: string, comptroller: Comptroller, newBorrowCapGuardian: string): Promise<World> {
  let invokation = await invoke(world, comptroller.methods._setBorrowCapGuardian(newBorrowCapGuardian), from, ComptrollerErrorReporter);

  world = addAction(
    world,
    `Comptroller: ${describeUser(world, from)} sets borrow cap guardian to ${newBorrowCapGuardian}`,
    invokation
  );

  return world;
}

export function comptrollerCommands() {
  return [
    new Command<{comptrollerParams: EventV}>(`
        #### Deploy

        * "Comptroller Deploy ...comptrollerParams" - Generates a new Comptroller (not as Impl)
          * E.g. "Comptroller Deploy YesNo"
      `,
      "Deploy",
      [new Arg("comptrollerParams", getEventV, {variadic: true})],
      (world, from, {comptrollerParams}) => genComptroller(world, from, comptrollerParams.val)
    ),
    new Command<{comptroller: Comptroller, action: StringV, isPaused: BoolV}>(`
        #### SetPaused

        * "Comptroller SetPaused <Action> <Bool>" - Pauses or unpaused given aToken function
          * E.g. "Comptroller SetPaused "Mint" True"
      `,
      "SetPaused",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("action", getStringV),
        new Arg("isPaused", getBoolV)
      ],
      (world, from, {comptroller, action, isPaused}) => setPaused(world, from, comptroller, action.val, isPaused.val)
    ),
    new Command<{comptroller: Comptroller, aToken: AToken}>(`
        #### SupportMarket

        * "Comptroller SupportMarket <AToken>" - Adds support in the Comptroller for the given aToken
          * E.g. "Comptroller SupportMarket cZRX"
      `,
      "SupportMarket",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("aToken", getATokenV)
      ],
      (world, from, {comptroller, aToken}) => supportMarket(world, from, comptroller, aToken)
    ),
    new Command<{comptroller: Comptroller, aToken: AToken}>(`
        #### UnList

        * "Comptroller UnList <AToken>" - Mock unlists a given market in tests
          * E.g. "Comptroller UnList cZRX"
      `,
      "UnList",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("aToken", getATokenV)
      ],
      (world, from, {comptroller, aToken}) => unlistMarket(world, from, comptroller, aToken)
    ),
    new Command<{comptroller: Comptroller, aTokens: AToken[]}>(`
        #### EnterMarkets

        * "Comptroller EnterMarkets (<AToken> ...)" - User enters the given markets
          * E.g. "Comptroller EnterMarkets (cZRX cETH)"
      `,
      "EnterMarkets",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("aTokens", getATokenV, {mapped: true})
      ],
      (world, from, {comptroller, aTokens}) => enterMarkets(world, from, comptroller, aTokens.map((c) => c._address))
    ),
    new Command<{comptroller: Comptroller, aToken: AToken}>(`
        #### ExitMarket

        * "Comptroller ExitMarket <AToken>" - User exits the given markets
          * E.g. "Comptroller ExitMarket cZRX"
      `,
      "ExitMarket",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("aToken", getATokenV)
      ],
      (world, from, {comptroller, aToken}) => exitMarket(world, from, comptroller, aToken._address)
    ),
    new Command<{comptroller: Comptroller, maxAssets: NumberV}>(`
        #### SetMaxAssets

        * "Comptroller SetMaxAssets <Number>" - Sets (or resets) the max allowed asset count
          * E.g. "Comptroller SetMaxAssets 4"
      `,
      "SetMaxAssets",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("maxAssets", getNumberV)
      ],
      (world, from, {comptroller, maxAssets}) => setMaxAssets(world, from, comptroller, maxAssets)
    ),
    new Command<{comptroller: Comptroller, liquidationIncentive: NumberV}>(`
        #### LiquidationIncentive

        * "Comptroller LiquidationIncentive <Number>" - Sets the liquidation incentive
          * E.g. "Comptroller LiquidationIncentive 1.1"
      `,
      "LiquidationIncentive",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("liquidationIncentive", getExpNumberV)
      ],
      (world, from, {comptroller, liquidationIncentive}) => setLiquidationIncentive(world, from, comptroller, liquidationIncentive)
    ),
    new Command<{comptroller: Comptroller, priceOracle: AddressV}>(`
        #### SetPriceOracle

        * "Comptroller SetPriceOracle oracle:<Address>" - Sets the price oracle address
          * E.g. "Comptroller SetPriceOracle 0x..."
      `,
      "SetPriceOracle",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("priceOracle", getAddressV)
      ],
      (world, from, {comptroller, priceOracle}) => setPriceOracle(world, from, comptroller, priceOracle.val)
    ),
    new Command<{comptroller: Comptroller, aToken: AToken, collateralFactor: NumberV}>(`
        #### SetCollateralFactor

        * "Comptroller SetCollateralFactor <AToken> <Number>" - Sets the collateral factor for given aToken to number
          * E.g. "Comptroller SetCollateralFactor cZRX 0.1"
      `,
      "SetCollateralFactor",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("aToken", getATokenV),
        new Arg("collateralFactor", getExpNumberV)
      ],
      (world, from, {comptroller, aToken, collateralFactor}) => setCollateralFactor(world, from, comptroller, aToken, collateralFactor)
    ),
    new Command<{comptroller: Comptroller, closeFactor: NumberV}>(`
        #### SetCloseFactor

        * "Comptroller SetCloseFactor <Number>" - Sets the close factor to given percentage
          * E.g. "Comptroller SetCloseFactor 0.2"
      `,
      "SetCloseFactor",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("closeFactor", getPercentV)
      ],
      (world, from, {comptroller, closeFactor}) => setCloseFactor(world, from, comptroller, closeFactor)
    ),
    new Command<{comptroller: Comptroller, newPendingAdmin: AddressV}>(`
        #### SetPendingAdmin

        * "Comptroller SetPendingAdmin newPendingAdmin:<Address>" - Sets the pending admin for the Comptroller
          * E.g. "Comptroller SetPendingAdmin Geoff"
      `,
      "SetPendingAdmin",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("newPendingAdmin", getAddressV)
      ],
      (world, from, {comptroller, newPendingAdmin}) => setPendingAdmin(world, from, comptroller, newPendingAdmin.val)
    ),
    new Command<{comptroller: Comptroller}>(`
        #### AcceptAdmin

        * "Comptroller AcceptAdmin" - Accepts admin for the Comptroller
          * E.g. "From Geoff (Comptroller AcceptAdmin)"
      `,
      "AcceptAdmin",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
      ],
      (world, from, {comptroller}) => acceptAdmin(world, from, comptroller)
    ),
    new Command<{comptroller: Comptroller, newPauseGuardian: AddressV}>(`
        #### SetPauseGuardian

        * "Comptroller SetPauseGuardian newPauseGuardian:<Address>" - Sets the PauseGuardian for the Comptroller
          * E.g. "Comptroller SetPauseGuardian Geoff"
      `,
      "SetPauseGuardian",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("newPauseGuardian", getAddressV)
      ],
      (world, from, {comptroller, newPauseGuardian}) => setPauseGuardian(world, from, comptroller, newPauseGuardian.val)
    ),

    new Command<{comptroller: Comptroller, action: StringV, isPaused: BoolV}>(`
        #### SetGuardianPaused

        * "Comptroller SetGuardianPaused <Action> <Bool>" - Pauses or unpaused given aToken function
        * E.g. "Comptroller SetGuardianPaused "Transfer" True"
        `,
        "SetGuardianPaused",
        [
          new Arg("comptroller", getComptroller, {implicit: true}),
          new Arg("action", getStringV),
          new Arg("isPaused", getBoolV)
        ],
        (world, from, {comptroller, action, isPaused}) => setGuardianPaused(world, from, comptroller, action.val, isPaused.val)
    ),

    new Command<{comptroller: Comptroller, aToken: AToken, action: StringV, isPaused: BoolV}>(`
        #### SetGuardianMarketPaused

        * "Comptroller SetGuardianMarketPaused <AToken> <Action> <Bool>" - Pauses or unpaused given aToken function
        * E.g. "Comptroller SetGuardianMarketPaused cREP "Mint" True"
        `,
        "SetGuardianMarketPaused",
        [
          new Arg("comptroller", getComptroller, {implicit: true}),
          new Arg("aToken", getATokenV),
          new Arg("action", getStringV),
          new Arg("isPaused", getBoolV)
        ],
        (world, from, {comptroller, aToken, action, isPaused}) => setGuardianMarketPaused(world, from, comptroller, aToken, action.val, isPaused.val)
    ),

    new Command<{comptroller: Comptroller, blocks: NumberV, _keyword: StringV}>(`
        #### FastForward

        * "FastForward n:<Number> Blocks" - Moves the block number forward "n" blocks. Note: in "ATokenScenario" and "ComptrollerScenario" the current block number is mocked (starting at 100000). This is the only way for the protocol to see a higher block number (for accruing interest).
          * E.g. "Comptroller FastForward 5 Blocks" - Move block number forward 5 blocks.
      `,
      "FastForward",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("blocks", getNumberV),
        new Arg("_keyword", getStringV)
      ],
      (world, from, {comptroller, blocks}) => fastForward(world, from, comptroller, blocks)
    ),
    new View<{comptroller: Comptroller}>(`
        #### Liquidity

        * "Comptroller Liquidity" - Prints liquidity of all minters or borrowers
      `,
      "Liquidity",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
      ],
      (world, {comptroller}) => printLiquidity(world, comptroller)
    ),
    new View<{comptroller: Comptroller, input: StringV}>(`
        #### Decode

        * "Decode input:<String>" - Prints information about a call to a Comptroller contract
      `,
      "Decode",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("input", getStringV)

      ],
      (world, {comptroller, input}) => decodeCall(world, comptroller, input.val)
    ),

    new Command<{comptroller: Comptroller, signature: StringV, callArgs: StringV[]}>(`
      #### Send
      * Comptroller Send functionSignature:<String> callArgs[] - Sends any transaction to comptroller
      * E.g: Comptroller Send "setAltAddress(address)" (Address ALT)
      `,
      "Send",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("signature", getStringV),
        new Arg("callArgs", getCoreValue, {variadic: true, mapped: true})
      ],
      (world, from, {comptroller, signature, callArgs}) => sendAny(world, from, comptroller, signature.val, rawValues(callArgs))
    ),
    new Command<{comptroller: Comptroller, aTokens: AToken[]}>(`
      #### AddAltMarkets

      * "Comptroller AddAltMarkets (<Address> ...)" - Makes a market ALT-enabled
      * E.g. "Comptroller AddAltMarkets (cZRX cBAT)
      `,
      "AddAltMarkets",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("aTokens", getATokenV, {mapped: true})
      ],
      (world, from, {comptroller, aTokens}) => addAltMarkets(world, from, comptroller, aTokens)
     ),
    new Command<{comptroller: Comptroller, aToken: AToken}>(`
      #### DropAltMarket

      * "Comptroller DropAltMarket <Address>" - Makes a market ALT
      * E.g. "Comptroller DropAltMarket cZRX
      `,
      "DropAltMarket",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("aToken", getATokenV)
      ],
      (world, from, {comptroller, aToken}) => dropAltMarket(world, from, comptroller, aToken)
     ),

    new Command<{comptroller: Comptroller}>(`
      #### RefreshAltSpeeds

      * "Comptroller RefreshAltSpeeds" - Recalculates all the ALT market speeds
      * E.g. "Comptroller RefreshAltSpeeds
      `,
      "RefreshAltSpeeds",
      [
        new Arg("comptroller", getComptroller, {implicit: true})
      ],
      (world, from, {comptroller}) => refreshAltSpeeds(world, from, comptroller)
    ),
    new Command<{comptroller: Comptroller, holder: AddressV}>(`
      #### ClaimAlt

      * "Comptroller ClaimAlt <holder>" - Claims Alt
      * E.g. "Comptroller ClaimAlt Geoff
      `,
      "ClaimAlt",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("holder", getAddressV)
      ],
      (world, from, {comptroller, holder}) => claimAlt(world, from, comptroller, holder.val)
    ),
    new Command<{comptroller: Comptroller, holder: AddressV, aTokens: AToken[]}>(`
      #### ClaimAltInMarkets

      * "Comptroller ClaimAlt <holder> (<AToken> ...)" - Claims Alt
      * E.g. "Comptroller ClaimAltInMarkets Geoff (cDAI cBAT)
      `,
      "ClaimAltInMarkets",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("holder", getAddressV),
        new Arg("aTokens", getATokenV, {mapped: true})
      ],
      (world, from, {comptroller, holder, aTokens}) => claimAltInMarkets(world, from, comptroller, holder.val, aTokens)
    ),
    new Command<{comptroller: Comptroller, contributor: AddressV}>(`
      #### UpdateContributorRewards

      * "Comptroller UpdateContributorRewards <contributor>" - Updates rewards for a contributor
      * E.g. "Comptroller UpdateContributorRewards Geoff
      `,
      "UpdateContributorRewards",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("contributor", getAddressV)
      ],
      (world, from, {comptroller, contributor}) => updateContributorRewards(world, from, comptroller, contributor.val)
    ),
    new Command<{comptroller: Comptroller, recipient: AddressV, amount: NumberV}>(`
      #### GrantAlt

      * "Comptroller GrantAlt <recipient> <amount>" - Grants ALT to a recipient
      * E.g. "Comptroller GrantAlt Geoff 1e18
      `,
      "GrantAlt",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("recipient", getAddressV),
        new Arg("amount", getNumberV)
      ],
      (world, from, {comptroller, recipient, amount}) => grantAlt(world, from, comptroller, recipient.val, amount)
    ),
    new Command<{comptroller: Comptroller, rate: NumberV}>(`
      #### SetAltRate

      * "Comptroller SetAltRate <rate>" - Sets ALT rate
      * E.g. "Comptroller SetAltRate 1e18
      `,
      "SetAltRate",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("rate", getNumberV)
      ],
      (world, from, {comptroller, rate}) => setAltRate(world, from, comptroller, rate)
    ),
    new Command<{comptroller: Comptroller, aToken: AToken, speed: NumberV}>(`
      #### SetAltSpeed (deprecated)
      * "Comptroller SetAltSpeed <aToken> <rate>" - Sets ALT speed for market
      * E.g. "Comptroller SetAltSpeed aToken 1000
      `,
      "SetAltSpeed",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("aToken", getATokenV),
        new Arg("speed", getNumberV)
      ],
      (world, from, {comptroller, aToken, speed}) => setAltSpeed(world, from, comptroller, aToken, speed)
    ),
    new Command<{comptroller: Comptroller, aTokens: AToken[], supplySpeeds: NumberV[], borrowSpeeds: NumberV[]}>(`
      #### SetAltSpeeds
      * "Comptroller SetAltSpeeds (<aToken> ...) (<supplySpeed> ...) (<borrowSpeed> ...)" - Sets ALT speeds for markets
      * E.g. "Comptroller SetAltSpeeds (cZRX cBAT) (1000 0) (1000 2000)
      `,
      "SetAltSpeeds",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("aTokens", getATokenV, {mapped: true}),
        new Arg("supplySpeeds", getNumberV, {mapped: true}),
        new Arg("borrowSpeeds", getNumberV, {mapped: true})
      ],
      (world, from, {comptroller, aTokens, supplySpeeds, borrowSpeeds}) => setAltSpeeds(world, from, comptroller, aTokens, supplySpeeds, borrowSpeeds)
    ),
    new Command<{comptroller: Comptroller, contributor: AddressV, speed: NumberV}>(`
      #### SetContributorAltSpeed
      * "Comptroller SetContributorAltSpeed <contributor> <rate>" - Sets ALT speed for contributor
      * E.g. "Comptroller SetContributorAltSpeed contributor 1000
      `,
      "SetContributorAltSpeed",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("contributor", getAddressV),
        new Arg("speed", getNumberV)
      ],
      (world, from, {comptroller, contributor, speed}) => setContributorAltSpeed(world, from, comptroller, contributor.val, speed)
    ),
    new Command<{comptroller: Comptroller, aTokens: AToken[], borrowCaps: NumberV[]}>(`
      #### SetMarketBorrowCaps

      * "Comptroller SetMarketBorrowCaps (<AToken> ...) (<borrowCap> ...)" - Sets Market Borrow Caps
      * E.g "Comptroller SetMarketBorrowCaps (cZRX cUSDC) (10000.0e18, 1000.0e6)
      `,
      "SetMarketBorrowCaps",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("aTokens", getATokenV, {mapped: true}),
        new Arg("borrowCaps", getNumberV, {mapped: true})
      ],
      (world, from, {comptroller,aTokens,borrowCaps}) => setMarketBorrowCaps(world, from, comptroller, aTokens, borrowCaps)
    ),
    new Command<{comptroller: Comptroller, newBorrowCapGuardian: AddressV}>(`
        #### SetBorrowCapGuardian

        * "Comptroller SetBorrowCapGuardian newBorrowCapGuardian:<Address>" - Sets the Borrow Cap Guardian for the Comptroller
          * E.g. "Comptroller SetBorrowCapGuardian Geoff"
      `,
      "SetBorrowCapGuardian",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("newBorrowCapGuardian", getAddressV)
      ],
      (world, from, {comptroller, newBorrowCapGuardian}) => setBorrowCapGuardian(world, from, comptroller, newBorrowCapGuardian.val)
    )
  ];
}

export async function processComptrollerEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("Comptroller", comptrollerCommands(), world, event, from);
}
