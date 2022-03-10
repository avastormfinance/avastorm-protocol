import { Event } from '../Event';
import { World } from '../World';
import { AErc20Delegate } from '../Contract/AErc20Delegate';
import {
  getCoreValue,
  mapValue
} from '../CoreValue';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import {
  AddressV,
  Value,
} from '../Value';
import { getWorldContractByAddress, getATokenDelegateAddress } from '../ContractLookup';

export async function getATokenDelegateV(world: World, event: Event): Promise<AErc20Delegate> {
  const address = await mapValue<AddressV>(
    world,
    event,
    (str) => new AddressV(getATokenDelegateAddress(world, str)),
    getCoreValue,
    AddressV
  );

  return getWorldContractByAddress<AErc20Delegate>(world, address.val);
}

async function aTokenDelegateAddress(world: World, aTokenDelegate: AErc20Delegate): Promise<AddressV> {
  return new AddressV(aTokenDelegate._address);
}

export function aTokenDelegateFetchers() {
  return [
    new Fetcher<{ aTokenDelegate: AErc20Delegate }, AddressV>(`
        #### Address

        * "ATokenDelegate <ATokenDelegate> Address" - Returns address of ATokenDelegate contract
          * E.g. "ATokenDelegate cDaiDelegate Address" - Returns cDaiDelegate's address
      `,
      "Address",
      [
        new Arg("aTokenDelegate", getATokenDelegateV)
      ],
      (world, { aTokenDelegate }) => aTokenDelegateAddress(world, aTokenDelegate),
      { namePos: 1 }
    ),
  ];
}

export async function getATokenDelegateValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("ATokenDelegate", aTokenDelegateFetchers(), world, event);
}
