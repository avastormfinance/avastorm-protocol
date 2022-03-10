import { Contract } from '../Contract';
import { Sendable } from '../Invokation';
import { ATokenMethods, ATokenScenarioMethods } from './AToken';

interface AErc20DelegateMethods extends ATokenMethods {
  _becomeImplementation(data: string): Sendable<void>;
  _resignImplementation(): Sendable<void>;
}

interface AErc20DelegateScenarioMethods extends ATokenScenarioMethods {
  _becomeImplementation(data: string): Sendable<void>;
  _resignImplementation(): Sendable<void>;
}

export interface AErc20Delegate extends Contract {
  methods: AErc20DelegateMethods;
  name: string;
}

export interface AErc20DelegateScenario extends Contract {
  methods: AErc20DelegateScenarioMethods;
  name: string;
}
