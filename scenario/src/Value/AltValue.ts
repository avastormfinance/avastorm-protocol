import { Event } from '../Event';
import { World } from '../World';
import { Alt } from '../Contract/Alt';
import {
  getAddressV,
  getNumberV
} from '../CoreValue';
import {
  AddressV,
  ListV,
  NumberV,
  StringV,
  Value
} from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { getAlt } from '../ContractLookup';

export function altFetchers() {
  return [
    new Fetcher<{ alt: Alt }, AddressV>(`
        #### Address

        * "<Alt> Address" - Returns the address of Alt token
          * E.g. "Alt Address"
      `,
      "Address",
      [
        new Arg("alt", getAlt, { implicit: true })
      ],
      async (world, { alt }) => new AddressV(alt._address)
    ),

    new Fetcher<{ alt: Alt }, StringV>(`
        #### Name

        * "<Alt> Name" - Returns the name of the Alt token
          * E.g. "Alt Name"
      `,
      "Name",
      [
        new Arg("alt", getAlt, { implicit: true })
      ],
      async (world, { alt }) => new StringV(await alt.methods.name().call())
    ),

    new Fetcher<{ alt: Alt }, StringV>(`
        #### Symbol

        * "<Alt> Symbol" - Returns the symbol of the Alt token
          * E.g. "Alt Symbol"
      `,
      "Symbol",
      [
        new Arg("alt", getAlt, { implicit: true })
      ],
      async (world, { alt }) => new StringV(await alt.methods.symbol().call())
    ),

    new Fetcher<{ alt: Alt }, NumberV>(`
        #### Decimals

        * "<Alt> Decimals" - Returns the number of decimals of the Alt token
          * E.g. "Alt Decimals"
      `,
      "Decimals",
      [
        new Arg("alt", getAlt, { implicit: true })
      ],
      async (world, { alt }) => new NumberV(await alt.methods.decimals().call())
    ),

    new Fetcher<{ alt: Alt }, NumberV>(`
        #### TotalSupply

        * "Alt TotalSupply" - Returns Alt token's total supply
      `,
      "TotalSupply",
      [
        new Arg("alt", getAlt, { implicit: true })
      ],
      async (world, { alt }) => new NumberV(await alt.methods.totalSupply().call())
    ),

    new Fetcher<{ alt: Alt, address: AddressV }, NumberV>(`
        #### TokenBalance

        * "Alt TokenBalance <Address>" - Returns the Alt token balance of a given address
          * E.g. "Alt TokenBalance Geoff" - Returns Geoff's Alt balance
      `,
      "TokenBalance",
      [
        new Arg("alt", getAlt, { implicit: true }),
        new Arg("address", getAddressV)
      ],
      async (world, { alt, address }) => new NumberV(await alt.methods.balanceOf(address.val).call())
    ),

    new Fetcher<{ alt: Alt, owner: AddressV, spender: AddressV }, NumberV>(`
        #### Allowance

        * "Alt Allowance owner:<Address> spender:<Address>" - Returns the Alt allowance from owner to spender
          * E.g. "Alt Allowance Geoff Torrey" - Returns the Alt allowance of Geoff to Torrey
      `,
      "Allowance",
      [
        new Arg("alt", getAlt, { implicit: true }),
        new Arg("owner", getAddressV),
        new Arg("spender", getAddressV)
      ],
      async (world, { alt, owner, spender }) => new NumberV(await alt.methods.allowance(owner.val, spender.val).call())
    ),

    new Fetcher<{ alt: Alt, account: AddressV }, NumberV>(`
        #### GetCurrentVotes

        * "Alt GetCurrentVotes account:<Address>" - Returns the current Alt votes balance for an account
          * E.g. "Alt GetCurrentVotes Geoff" - Returns the current Alt vote balance of Geoff
      `,
      "GetCurrentVotes",
      [
        new Arg("alt", getAlt, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { alt, account }) => new NumberV(await alt.methods.getCurrentVotes(account.val).call())
    ),

    new Fetcher<{ alt: Alt, account: AddressV, blockNumber: NumberV }, NumberV>(`
        #### GetPriorVotes

        * "Alt GetPriorVotes account:<Address> blockBumber:<Number>" - Returns the current Alt votes balance at given block
          * E.g. "Alt GetPriorVotes Geoff 5" - Returns the Alt vote balance for Geoff at block 5
      `,
      "GetPriorVotes",
      [
        new Arg("alt", getAlt, { implicit: true }),
        new Arg("account", getAddressV),
        new Arg("blockNumber", getNumberV),
      ],
      async (world, { alt, account, blockNumber }) => new NumberV(await alt.methods.getPriorVotes(account.val, blockNumber.encode()).call())
    ),

    new Fetcher<{ alt: Alt, account: AddressV }, NumberV>(`
        #### GetCurrentVotesBlock

        * "Alt GetCurrentVotesBlock account:<Address>" - Returns the current Alt votes checkpoint block for an account
          * E.g. "Alt GetCurrentVotesBlock Geoff" - Returns the current Alt votes checkpoint block for Geoff
      `,
      "GetCurrentVotesBlock",
      [
        new Arg("alt", getAlt, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { alt, account }) => {
        const numCheckpoints = Number(await alt.methods.numCheckpoints(account.val).call());
        const checkpoint = await alt.methods.checkpoints(account.val, numCheckpoints - 1).call();

        return new NumberV(checkpoint.fromBlock);
      }
    ),

    new Fetcher<{ alt: Alt, account: AddressV }, NumberV>(`
        #### VotesLength

        * "Alt VotesLength account:<Address>" - Returns the Alt vote checkpoint array length
          * E.g. "Alt VotesLength Geoff" - Returns the Alt vote checkpoint array length of Geoff
      `,
      "VotesLength",
      [
        new Arg("alt", getAlt, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { alt, account }) => new NumberV(await alt.methods.numCheckpoints(account.val).call())
    ),

    new Fetcher<{ alt: Alt, account: AddressV }, ListV>(`
        #### AllVotes

        * "Alt AllVotes account:<Address>" - Returns information about all votes an account has had
          * E.g. "Alt AllVotes Geoff" - Returns the Alt vote checkpoint array
      `,
      "AllVotes",
      [
        new Arg("alt", getAlt, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { alt, account }) => {
        const numCheckpoints = Number(await alt.methods.numCheckpoints(account.val).call());
        const checkpoints = await Promise.all(new Array(numCheckpoints).fill(undefined).map(async (_, i) => {
          const {fromBlock, votes} = await alt.methods.checkpoints(account.val, i).call();

          return new StringV(`Block ${fromBlock}: ${votes} vote${votes !== 1 ? "s" : ""}`);
        }));

        return new ListV(checkpoints);
      }
    )
  ];
}

export async function getAltValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("Alt", altFetchers(), world, event);
}
