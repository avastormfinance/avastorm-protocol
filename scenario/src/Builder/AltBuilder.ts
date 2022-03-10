import { Event } from '../Event';
import { World, addAction } from '../World';
import { Alt, AltScenario } from '../Contract/Alt';
import { Invokation } from '../Invokation';
import { getAddressV } from '../CoreValue';
import { StringV, AddressV } from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { storeAndSaveContract } from '../Networks';
import { getContract } from '../Contract';

const AltContract = getContract('Alt');
const AltScenarioContract = getContract('AltScenario');

export interface TokenData {
  invokation: Invokation<Alt>;
  contract: string;
  address?: string;
  symbol: string;
  name: string;
  decimals?: number;
}

export async function buildAlt(
  world: World,
  from: string,
  params: Event
): Promise<{ world: World; alt: Alt; tokenData: TokenData }> {
  const fetchers = [
    new Fetcher<{ account: AddressV }, TokenData>(
      `
      #### Scenario

      * "Alt Deploy Scenario account:<Address>" - Deploys Scenario Alt Token
        * E.g. "Alt Deploy Scenario Geoff"
    `,
      'Scenario',
      [
        new Arg("account", getAddressV),
      ],
      async (world, { account }) => {
        return {
          invokation: await AltScenarioContract.deploy<AltScenario>(world, from, [account.val]),
          contract: 'AltScenario',
          symbol: 'ALT',
          name: 'Avastorm Governance Token',
          decimals: 18
        };
      }
    ),

    new Fetcher<{ account: AddressV }, TokenData>(
      `
      #### Comp

      * "Alt Deploy account:<Address>" - Deploys Alt Token
        * E.g. "Alt Deploy Geoff"
    `,
      'Alt',
      [
        new Arg("account", getAddressV),
      ],
      async (world, { account }) => {
        if (world.isLocalNetwork()) {
          return {
            invokation: await AltScenarioContract.deploy<AltScenario>(world, from, [account.val]),
            contract: 'AltScenario',
            symbol: 'ALT',
            name: 'Avastorm Governance Token',
            decimals: 18
          };
        } else {
          return {
            invokation: await AltContract.deploy<Alt>(world, from, [account.val]),
            contract: 'Alt',
            symbol: 'ALT',
            name: 'Avastorm Governance Token',
            decimals: 18
          };
        }
      },
      { catchall: true }
    )
  ];

  let tokenData = await getFetcherValue<any, TokenData>("DeployAlt", fetchers, world, params);
  let invokation = tokenData.invokation;
  delete tokenData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const alt = invokation.value!;
  tokenData.address = alt._address;

  world = await storeAndSaveContract(
    world,
    alt,
    'Alt',
    invokation,
    [
      { index: ['Alt'], data: tokenData },
      { index: ['Tokens', tokenData.symbol], data: tokenData }
    ]
  );

  tokenData.invokation = invokation;

  return { world, alt, tokenData };
}
