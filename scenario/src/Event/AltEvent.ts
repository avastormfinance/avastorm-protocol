import { Event } from '../Event';
import { addAction, World, describeUser } from '../World';
import { Alt, AltScenario } from '../Contract/Alt';
import { buildAlt } from '../Builder/AltBuilder';
import { invoke } from '../Invokation';
import {
  getAddressV,
  getEventV,
  getNumberV,
  getStringV,
} from '../CoreValue';
import {
  AddressV,
  EventV,
  NumberV,
  StringV
} from '../Value';
import { Arg, Command, processCommandEvent, View } from '../Command';
import { getAlt } from '../ContractLookup';
import { NoErrorReporter } from '../ErrorReporter';
import { verify } from '../Verify';
import { encodedNumber } from '../Encoding';

async function genAlt(world: World, from: string, params: Event): Promise<World> {
  let { world: nextWorld, alt, tokenData } = await buildAlt(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Deployed Alt (${alt.name}) to address ${alt._address}`,
    tokenData.invokation
  );

  return world;
}

async function verifyAlt(world: World, alt: Alt, apiKey: string, modelName: string, contractName: string): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, modelName, contractName, alt._address);
  }

  return world;
}

async function approve(world: World, from: string, alt: Alt, address: string, amount: NumberV): Promise<World> {
  let invokation = await invoke(world, alt.methods.approve(address, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Approved Alt token for ${from} of ${amount.show()}`,
    invokation
  );

  return world;
}

async function transfer(world: World, from: string, alt: Alt, address: string, amount: NumberV): Promise<World> {
  let invokation = await invoke(world, alt.methods.transfer(address, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Transferred ${amount.show()} Alt tokens from ${from} to ${address}`,
    invokation
  );

  return world;
}

async function transferFrom(world: World, from: string, alt: Alt, owner: string, spender: string, amount: NumberV): Promise<World> {
  let invokation = await invoke(world, alt.methods.transferFrom(owner, spender, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `"Transferred from" ${amount.show()} Alt tokens from ${owner} to ${spender}`,
    invokation
  );

  return world;
}

async function transferScenario(world: World, from: string, alt: AltScenario, addresses: string[], amount: NumberV): Promise<World> {
  let invokation = await invoke(world, alt.methods.transferScenario(addresses, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Transferred ${amount.show()} Alt tokens from ${from} to ${addresses}`,
    invokation
  );

  return world;
}

async function transferFromScenario(world: World, from: string, alt: AltScenario, addresses: string[], amount: NumberV): Promise<World> {
  let invokation = await invoke(world, alt.methods.transferFromScenario(addresses, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Transferred ${amount.show()} Alt tokens from ${addresses} to ${from}`,
    invokation
  );

  return world;
}

async function delegate(world: World, from: string, alt: Alt, account: string): Promise<World> {
  let invokation = await invoke(world, alt.methods.delegate(account), from, NoErrorReporter);

  world = addAction(
    world,
    `"Delegated from" ${from} to ${account}`,
    invokation
  );

  return world;
}

async function setBlockNumber(
  world: World,
  from: string,
  alt: Alt,
  blockNumber: NumberV
): Promise<World> {
  return addAction(
    world,
    `Set Alt blockNumber to ${blockNumber.show()}`,
    await invoke(world, alt.methods.setBlockNumber(blockNumber.encode()), from)
  );
}

export function altCommands() {
  return [
    new Command<{ params: EventV }>(`
        #### Deploy

        * "Deploy ...params" - Generates a new Alt token
          * E.g. "Alt Deploy"
      `,
      "Deploy",
      [
        new Arg("params", getEventV, { variadic: true })
      ],
      (world, from, { params }) => genAlt(world, from, params.val)
    ),

    new View<{ alt: Alt, apiKey: StringV, contractName: StringV }>(`
        #### Verify

        * "<Alt> Verify apiKey:<String> contractName:<String>=Alt" - Verifies Alt token in Etherscan
          * E.g. "Alt Verify "myApiKey"
      `,
      "Verify",
      [
        new Arg("alt", getAlt, { implicit: true }),
        new Arg("apiKey", getStringV),
        new Arg("contractName", getStringV, { default: new StringV("Alt") })
      ],
      async (world, { alt, apiKey, contractName }) => {
        return await verifyAlt(world, alt, apiKey.val, alt.name, contractName.val)
      }
    ),

    new Command<{ alt: Alt, spender: AddressV, amount: NumberV }>(`
        #### Approve

        * "Alt Approve spender:<Address> <Amount>" - Adds an allowance between user and address
          * E.g. "Alt Approve Geoff 1.0e18"
      `,
      "Approve",
      [
        new Arg("alt", getAlt, { implicit: true }),
        new Arg("spender", getAddressV),
        new Arg("amount", getNumberV)
      ],
      (world, from, { alt, spender, amount }) => {
        return approve(world, from, alt, spender.val, amount)
      }
    ),

    new Command<{ alt: Alt, recipient: AddressV, amount: NumberV }>(`
        #### Transfer

        * "Alt Transfer recipient:<User> <Amount>" - Transfers a number of tokens via "transfer" as given user to recipient (this does not depend on allowance)
          * E.g. "Alt Transfer Torrey 1.0e18"
      `,
      "Transfer",
      [
        new Arg("alt", getAlt, { implicit: true }),
        new Arg("recipient", getAddressV),
        new Arg("amount", getNumberV)
      ],
      (world, from, { alt, recipient, amount }) => transfer(world, from, alt, recipient.val, amount)
    ),

    new Command<{ alt: Alt, owner: AddressV, spender: AddressV, amount: NumberV }>(`
        #### TransferFrom

        * "Alt TransferFrom owner:<User> spender:<User> <Amount>" - Transfers a number of tokens via "transfeFrom" to recipient (this depends on allowances)
          * E.g. "Alt TransferFrom Geoff Torrey 1.0e18"
      `,
      "TransferFrom",
      [
        new Arg("alt", getAlt, { implicit: true }),
        new Arg("owner", getAddressV),
        new Arg("spender", getAddressV),
        new Arg("amount", getNumberV)
      ],
      (world, from, { alt, owner, spender, amount }) => transferFrom(world, from, alt, owner.val, spender.val, amount)
    ),

    new Command<{ alt: AltScenario, recipients: AddressV[], amount: NumberV }>(`
        #### TransferScenario

        * "Alt TransferScenario recipients:<User[]> <Amount>" - Transfers a number of tokens via "transfer" to the given recipients (this does not depend on allowance)
          * E.g. "Alt TransferScenario (Jared Torrey) 10"
      `,
      "TransferScenario",
      [
        new Arg("alt", getAlt, { implicit: true }),
        new Arg("recipients", getAddressV, { mapped: true }),
        new Arg("amount", getNumberV)
      ],
      (world, from, { alt, recipients, amount }) => transferScenario(world, from, alt, recipients.map(recipient => recipient.val), amount)
    ),

    new Command<{ alt: AltScenario, froms: AddressV[], amount: NumberV }>(`
        #### TransferFromScenario

        * "Alt TransferFromScenario froms:<User[]> <Amount>" - Transfers a number of tokens via "transferFrom" from the given users to msg.sender (this depends on allowance)
          * E.g. "Alt TransferFromScenario (Jared Torrey) 10"
      `,
      "TransferFromScenario",
      [
        new Arg("alt", getAlt, { implicit: true }),
        new Arg("froms", getAddressV, { mapped: true }),
        new Arg("amount", getNumberV)
      ],
      (world, from, { alt, froms, amount }) => transferFromScenario(world, from, alt, froms.map(_from => _from.val), amount)
    ),

    new Command<{ alt: Alt, account: AddressV }>(`
        #### Delegate

        * "Alt Delegate account:<Address>" - Delegates votes to a given account
          * E.g. "Alt Delegate Torrey"
      `,
      "Delegate",
      [
        new Arg("alt", getAlt, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      (world, from, { alt, account }) => delegate(world, from, alt, account.val)
    ),
    new Command<{ alt: Alt, blockNumber: NumberV }>(`
      #### SetBlockNumber

      * "SetBlockNumber <Seconds>" - Sets the blockTimestamp of the Alt Harness
      * E.g. "Alt SetBlockNumber 500"
      `,
        'SetBlockNumber',
        [new Arg('alt', getAlt, { implicit: true }), new Arg('blockNumber', getNumberV)],
        (world, from, { alt, blockNumber }) => setBlockNumber(world, from, alt, blockNumber)
      )
  ];
}

export async function processAltEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("Alt", altCommands(), world, event, from);
}
