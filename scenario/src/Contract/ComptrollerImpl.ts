import { Contract } from '../Contract';
import { Callable, Sendable } from '../Invokation';
import { encodedNumber } from '../Encoding';

interface ComptrollerImplMethods {
  _become(
    comptroller: string,
    priceOracle?: string,
    maxAssets?: encodedNumber,
    closeFactor?: encodedNumber,
    reinitializing?: boolean
  ): Sendable<string>;

  _become(
    comptroller: string,
    altRate: encodedNumber,
    altMarkets: string[],
    otherMarkets: string[]
  ): Sendable<string>;
}

export interface ComptrollerImpl extends Contract {
  methods: ComptrollerImplMethods;
}
