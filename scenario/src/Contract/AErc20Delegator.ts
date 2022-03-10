import { Contract } from '../Contract';
import { Callable, Sendable } from '../Invokation';
import { ATokenMethods } from './AToken';
import { encodedNumber } from '../Encoding';

interface AErc20DelegatorMethods extends ATokenMethods {
  implementation(): Callable<string>;
  _setImplementation(
    implementation_: string,
    allowResign: boolean,
    becomImplementationData: string
  ): Sendable<void>;
}

interface AErc20DelegatorScenarioMethods extends AErc20DelegatorMethods {
  setTotalBorrows(amount: encodedNumber): Sendable<void>;
  setTotalReserves(amount: encodedNumber): Sendable<void>;
}

export interface AErc20Delegator extends Contract {
  methods: AErc20DelegatorMethods;
  name: string;
}

export interface AErc20DelegatorScenario extends Contract {
  methods: AErc20DelegatorMethods;
  name: string;
}
