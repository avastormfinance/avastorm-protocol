const {
  makeComptroller,
  makeAToken,
  balanceOf,
  fastForward,
  pretendBorrow,
  quickMint,
  quickBorrow,
  enterMarkets
} = require('../Utils/Avastorm');
const {
  etherExp,
  etherDouble,
  etherUnsigned,
  etherMantissa
} = require('../Utils/Ethereum');

const altRate = etherUnsigned(1e18);

const altInitialIndex = 1e36;

async function altAccrued(comptroller, user) {
  return etherUnsigned(await call(comptroller, 'altAccrued', [user]));
}

async function altBalance(comptroller, user) {
  return etherUnsigned(await call(comptroller.alt, 'balanceOf', [user]))
}

async function totalAltAccrued(comptroller, user) {
  return (await altAccrued(comptroller, user)).plus(await altBalance(comptroller, user));
}

describe('Flywheel upgrade', () => {
  describe('becomes the comptroller', () => {
    it('adds the alt markets', async () => {
      let root = saddle.accounts[0];
      let unitroller = await makeComptroller({kind: 'unitroller-g2'});
      let altMarkets = await Promise.all([1, 2, 3].map(async _ => {
        return makeAToken({comptroller: unitroller, supportMarket: true});
      }));
      altMarkets = altMarkets.map(c => c._address);
      unitroller = await makeComptroller({kind: 'unitroller-g3', unitroller, altMarkets});
      expect(await call(unitroller, 'getAltMarkets')).toEqual(altMarkets);
    });

    it('adds the other markets', async () => {
      let root = saddle.accounts[0];
      let unitroller = await makeComptroller({kind: 'unitroller-g2'});
      let allMarkets = await Promise.all([1, 2, 3].map(async _ => {
        return makeAToken({comptroller: unitroller, supportMarket: true});
      }));
      allMarkets = allMarkets.map(c => c._address);
      unitroller = await makeComptroller({
        kind: 'unitroller-g3',
        unitroller,
        altMarkets: allMarkets.slice(0, 1),
        otherMarkets: allMarkets.slice(1)
      });
      expect(await call(unitroller, 'getAllMarkets')).toEqual(allMarkets);
      expect(await call(unitroller, 'getAltMarkets')).toEqual(allMarkets.slice(0, 1));
    });

    it('_supportMarket() adds to all markets, and only once', async () => {
      let root = saddle.accounts[0];
      let unitroller = await makeComptroller({kind: 'unitroller-g3'});
      let allMarkets = [];
      for (let _ of Array(10)) {
        allMarkets.push(await makeAToken({comptroller: unitroller, supportMarket: true}));
      }
      expect(await call(unitroller, 'getAllMarkets')).toEqual(allMarkets.map(c => c._address));
      expect(
        makeComptroller({
          kind: 'unitroller-g3',
          unitroller,
          otherMarkets: [allMarkets[0]._address]
        })
      ).rejects.toRevert('revert market already added');
    });
  });
});

describe('Flywheel', () => {
  let root, a1, a2, a3, accounts;
  let comptroller, cLOW, cREP, cZRX, cEVIL;
  beforeEach(async () => {
    let interestRateModelOpts = {borrowRate: 0.000001};
    [root, a1, a2, a3, ...accounts] = saddle.accounts;
    comptroller = await makeComptroller();
    cLOW = await makeAToken({comptroller, supportMarket: true, underlyingPrice: 1, interestRateModelOpts});
    cREP = await makeAToken({comptroller, supportMarket: true, underlyingPrice: 2, interestRateModelOpts});
    cZRX = await makeAToken({comptroller, supportMarket: true, underlyingPrice: 3, interestRateModelOpts});
    cEVIL = await makeAToken({comptroller, supportMarket: false, underlyingPrice: 3, interestRateModelOpts});
    cUSD = await makeAToken({comptroller, supportMarket: true, underlyingPrice: 1, collateralFactor: 0.5, interestRateModelOpts});
  });

  describe('_grantAlt()', () => {
    beforeEach(async () => {
      await send(comptroller.alt, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});
    });

    it('should award alt if called by admin', async () => {
      const tx = await send(comptroller, '_grantAlt', [a1, 100]);
      expect(tx).toHaveLog('AltGranted', {
        recipient: a1,
        amount: 100
      });
    });

    it('should revert if not called by admin', async () => {
      await expect(
        send(comptroller, '_grantAlt', [a1, 100], {from: a1})
      ).rejects.toRevert('revert only admin can grant alt');
    });

    it('should revert if insufficient alt', async () => {
      await expect(
        send(comptroller, '_grantAlt', [a1, etherUnsigned(1e20)])
      ).rejects.toRevert('revert insufficient alt for grant');
    });
  });

  describe('getAltMarkets()', () => {
    it('should return the alt markets', async () => {
      for (let mkt of [cLOW, cREP, cZRX]) {
        await send(comptroller, '_setAltSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      }
      expect(await call(comptroller, 'getAltMarkets')).toEqual(
        [cLOW, cREP, cZRX].map((c) => c._address)
      );
    });
  });

  describe('_setAltSpeeds()', () => {
    it('should update market index when calling setAltSpeed', async () => {
      const mkt = cREP;
      await send(comptroller, 'setBlockNumber', [0]);
      await send(mkt, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);

      await send(comptroller, '_setAltSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      await fastForward(comptroller, 20);
      await send(comptroller, '_setAltSpeeds', [[mkt._address], [etherExp(1)], [etherExp(0.5)]]);

      const {index, block} = await call(comptroller, 'altSupplyState', [mkt._address]);
      expect(index).toEqualNumber(2e36);
      expect(block).toEqualNumber(20);
    });

    it('should correctly drop a alt market if called by admin', async () => {
      for (let mkt of [cLOW, cREP, cZRX]) {
        await send(comptroller, '_setAltSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      }
      const tx = await send(comptroller, '_setAltSpeeds', [[cLOW._address], [0], [0]]);
      expect(await call(comptroller, 'getAltMarkets')).toEqual(
        [cREP, cZRX].map((c) => c._address)
      );
      expect(tx).toHaveLog('AltBorrowSpeedUpdated', {
        aToken: cLOW._address,
        newSpeed: 0
      });
      expect(tx).toHaveLog('AltSupplySpeedUpdated', {
        aToken: cLOW._address,
        newSpeed: 0
      });
    });

    it('should correctly drop a alt market from middle of array', async () => {
      for (let mkt of [cLOW, cREP, cZRX]) {
        await send(comptroller, '_setAltSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      }
      await send(comptroller, '_setAltSpeeds', [[cREP._address], [0], [0]]);
      expect(await call(comptroller, 'getAltMarkets')).toEqual(
        [cLOW, cZRX].map((c) => c._address)
      );
    });

    it('should not drop a alt market unless called by admin', async () => {
      for (let mkt of [cLOW, cREP, cZRX]) {
        await send(comptroller, '_setAltSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      }
      await expect(
        send(comptroller, '_setAltSpeeds', [[cLOW._address], [0], [etherExp(0.5)]], {from: a1})
      ).rejects.toRevert('revert only admin can set alt speed');
    });

    it('should not add non-listed markets', async () => {
      const cBAT = await makeAToken({ comptroller, supportMarket: false });
      await expect(
        send(comptroller, 'harnessAddAltMarkets', [[cBAT._address]])
      ).rejects.toRevert('revert alt market is not listed');

      const markets = await call(comptroller, 'getAltMarkets');
      expect(markets).toEqual([]);
    });
  });

  describe('updateAltBorrowIndex()', () => {
    it('should calculate alt borrower index correctly', async () => {
      const mkt = cREP;
      await send(comptroller, '_setAltSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      await send(comptroller, 'setBlockNumber', [100]);
      await send(mkt, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
      await send(comptroller, 'harnessUpdateAltBorrowIndex', [
        mkt._address,
        etherExp(1.1),
      ]);
      /*
        100 blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed

        borrowAmt   = totalBorrows * 1e18 / borrowIdx
                    = 11e18 * 1e18 / 1.1e18 = 10e18
        altAccrued = deltaBlocks * borrowSpeed
                    = 100 * 0.5e18 = 50e18
        newIndex   += 1e36 + altAccrued * 1e36 / borrowAmt
                    = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
      */

      const {index, block} = await call(comptroller, 'altBorrowState', [mkt._address]);
      expect(index).toEqualNumber(6e36);
      expect(block).toEqualNumber(100);
    });

    it('should not revert or update altBorrowState index if aToken not in ALT markets', async () => {
      const mkt = await makeAToken({
        comptroller: comptroller,
        supportMarket: true,
        addAltMarket: false,
      });
      await send(comptroller, 'setBlockNumber', [100]);
      await send(comptroller, 'harnessUpdateAltBorrowIndex', [
        mkt._address,
        etherExp(1.1),
      ]);

      const {index, block} = await call(comptroller, 'altBorrowState', [mkt._address]);
      expect(index).toEqualNumber(altInitialIndex);
      expect(block).toEqualNumber(100);
      const supplySpeed = await call(comptroller, 'altSupplySpeeds', [mkt._address]);
      expect(supplySpeed).toEqualNumber(0);
      const borrowSpeed = await call(comptroller, 'altBorrowSpeeds', [mkt._address]);
      expect(borrowSpeed).toEqualNumber(0);
    });

    it('should not update index if no blocks passed since last accrual', async () => {
      const mkt = cREP;
      await send(comptroller, '_setAltSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      await send(comptroller, 'harnessUpdateAltBorrowIndex', [
        mkt._address,
        etherExp(1.1),
      ]);

      const {index, block} = await call(comptroller, 'altBorrowState', [mkt._address]);
      expect(index).toEqualNumber(altInitialIndex);
      expect(block).toEqualNumber(0);
    });

    it('should not update index if alt speed is 0', async () => {
      const mkt = cREP;
      await send(comptroller, '_setAltSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      await send(comptroller, 'setBlockNumber', [100]);
      await send(comptroller, '_setAltSpeeds', [[mkt._address], [etherExp(0)], [etherExp(0)]]);
      await send(comptroller, 'harnessUpdateAltBorrowIndex', [
        mkt._address,
        etherExp(1.1),
      ]);

      const {index, block} = await call(comptroller, 'altBorrowState', [mkt._address]);
      expect(index).toEqualNumber(altInitialIndex);
      expect(block).toEqualNumber(100);
    });
  });

  describe('updateAltSupplyIndex()', () => {
    it('should calculate alt supplier index correctly', async () => {
      const mkt = cREP;
      await send(comptroller, '_setAltSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      await send(comptroller, 'setBlockNumber', [100]);
      await send(mkt, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
      await send(comptroller, 'harnessUpdateAltSupplyIndex', [mkt._address]);
      /*
        suppyTokens = 10e18
        altAccrued = deltaBlocks * supplySpeed
                    = 100 * 0.5e18 = 50e18
        newIndex   += altAccrued * 1e36 / supplyTokens
                    = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
      */
      const {index, block} = await call(comptroller, 'altSupplyState', [mkt._address]);
      expect(index).toEqualNumber(6e36);
      expect(block).toEqualNumber(100);
    });

    it('should not update index on non-ALT markets', async () => {
      const mkt = await makeAToken({
        comptroller: comptroller,
        supportMarket: true,
        addAltMarket: false
      });
      await send(comptroller, 'setBlockNumber', [100]);
      await send(comptroller, 'harnessUpdateAltSupplyIndex', [
        mkt._address
      ]);

      const {index, block} = await call(comptroller, 'altSupplyState', [mkt._address]);
      expect(index).toEqualNumber(altInitialIndex);
      expect(block).toEqualNumber(100);
      const supplySpeed = await call(comptroller, 'altSupplySpeeds', [mkt._address]);
      expect(supplySpeed).toEqualNumber(0);
      const borrowSpeed = await call(comptroller, 'altBorrowSpeeds', [mkt._address]);
      expect(borrowSpeed).toEqualNumber(0);
      // ctoken could have no alt speed or alt supplier state if not in alt markets
      // this logic could also possibly be implemented in the allowed hook
    });

    it('should not update index if no blocks passed since last accrual', async () => {
      const mkt = cREP;
      await send(comptroller, 'setBlockNumber', [0]);
      await send(mkt, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
      await send(comptroller, '_setAltSpeeds', [[mkt._address], [etherExp(0.5)], [etherExp(0.5)]]);
      await send(comptroller, 'harnessUpdateAltSupplyIndex', [mkt._address]);

      const {index, block} = await call(comptroller, 'altSupplyState', [mkt._address]);
      expect(index).toEqualNumber(altInitialIndex);
      expect(block).toEqualNumber(0);
    });

    it('should not matter if the index is updated multiple times', async () => {
      const altRemaining = altRate.multipliedBy(100)
      await send(comptroller, 'harnessAddAltMarkets', [[cLOW._address]]);
      await send(comptroller.alt, 'transfer', [comptroller._address, altRemaining], {from: root});
      await pretendBorrow(cLOW, a1, 1, 1, 100);
      await send(comptroller, 'harnessRefreshAltSpeeds');

      await quickMint(cLOW, a2, etherUnsigned(10e18));
      await quickMint(cLOW, a3, etherUnsigned(15e18));

      const a2Accrued0 = await totalAltAccrued(comptroller, a2);
      const a3Accrued0 = await totalAltAccrued(comptroller, a3);
      const a2Balance0 = await balanceOf(cLOW, a2);
      const a3Balance0 = await balanceOf(cLOW, a3);

      await fastForward(comptroller, 20);

      const txT1 = await send(cLOW, 'transfer', [a2, a3Balance0.minus(a2Balance0)], {from: a3});

      const a2Accrued1 = await totalAltAccrued(comptroller, a2);
      const a3Accrued1 = await totalAltAccrued(comptroller, a3);
      const a2Balance1 = await balanceOf(cLOW, a2);
      const a3Balance1 = await balanceOf(cLOW, a3);

      await fastForward(comptroller, 10);
      await send(comptroller, 'harnessUpdateAltSupplyIndex', [cLOW._address]);
      await fastForward(comptroller, 10);

      const txT2 = await send(cLOW, 'transfer', [a3, a2Balance1.minus(a3Balance1)], {from: a2});

      const a2Accrued2 = await totalAltAccrued(comptroller, a2);
      const a3Accrued2 = await totalAltAccrued(comptroller, a3);

      expect(a2Accrued0).toEqualNumber(0);
      expect(a3Accrued0).toEqualNumber(0);
      expect(a2Accrued1).not.toEqualNumber(0);
      expect(a3Accrued1).not.toEqualNumber(0);
      expect(a2Accrued1).toEqualNumber(a3Accrued2.minus(a3Accrued1));
      expect(a3Accrued1).toEqualNumber(a2Accrued2.minus(a2Accrued1));

      expect(txT1.gasUsed).toBeLessThan(200000);
      expect(txT1.gasUsed).toBeGreaterThan(140000);
      expect(txT2.gasUsed).toBeLessThan(150000);
      expect(txT2.gasUsed).toBeGreaterThan(100000);
    });
  });

  describe('distributeBorrowerAlt()', () => {

    it('should update borrow index checkpoint but not altAccrued for first time user', async () => {
      const mkt = cREP;
      await send(comptroller, "setAltBorrowState", [mkt._address, etherDouble(6), 10]);
      await send(comptroller, "setAltBorrowerIndex", [mkt._address, root, etherUnsigned(0)]);

      await send(comptroller, "harnessDistributeBorrowerAlt", [mkt._address, root, etherExp(1.1)]);
      expect(await call(comptroller, "altAccrued", [root])).toEqualNumber(0);
      expect(await call(comptroller, "altBorrowerIndex", [ mkt._address, root])).toEqualNumber(6e36);
    });

    it('should transfer alt and update borrow index checkpoint correctly for repeat time user', async () => {
      const mkt = cREP;
      await send(comptroller.alt, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});
      await send(mkt, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
      await send(comptroller, "setAltBorrowState", [mkt._address, etherDouble(6), 10]);
      await send(comptroller, "setAltBorrowerIndex", [mkt._address, a1, etherDouble(1)]);

      /*
      * 100 delta blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed => 6e18 altBorrowIndex
      * this tests that an acct with half the total borrows over that time gets 25e18 ALT
        borrowerAmount = borrowBalance * 1e18 / borrow idx
                       = 5.5e18 * 1e18 / 1.1e18 = 5e18
        deltaIndex     = marketStoredIndex - userStoredIndex
                       = 6e36 - 1e36 = 5e36
        borrowerAccrued= borrowerAmount * deltaIndex / 1e36
                       = 5e18 * 5e36 / 1e36 = 25e18
      */
      const tx = await send(comptroller, "harnessDistributeBorrowerAlt", [mkt._address, a1, etherUnsigned(1.1e18)]);
      expect(await altAccrued(comptroller, a1)).toEqualNumber(25e18);
      expect(await altBalance(comptroller, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedBorrowerAlt', {
        aToken: mkt._address,
        borrower: a1,
        altDelta: etherUnsigned(25e18).toFixed(),
        altBorrowIndex: etherDouble(6).toFixed()
      });
    });

    it('should not transfer alt automatically', async () => {
      const mkt = cREP;
      await send(comptroller.alt, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});
      await send(mkt, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e17), etherExp(1)]);
      await send(comptroller, "setAltBorrowState", [mkt._address, etherDouble(1.0019), 10]);
      await send(comptroller, "setAltBorrowerIndex", [mkt._address, a1, etherDouble(1)]);
      /*
        borrowerAmount = borrowBalance * 1e18 / borrow idx
                       = 5.5e17 * 1e18 / 1.1e18 = 5e17
        deltaIndex     = marketStoredIndex - userStoredIndex
                       = 1.0019e36 - 1e36 = 0.0019e36
        borrowerAccrued= borrowerAmount * deltaIndex / 1e36
                       = 5e17 * 0.0019e36 / 1e36 = 0.00095e18
        0.00095e18 < altClaimThreshold of 0.001e18
      */
      await send(comptroller, "harnessDistributeBorrowerAlt", [mkt._address, a1, etherExp(1.1)]);
      expect(await altAccrued(comptroller, a1)).toEqualNumber(0.00095e18);
      expect(await altBalance(comptroller, a1)).toEqualNumber(0);
    });

    it('should not revert or distribute when called with non-ALT market', async () => {
      const mkt = await makeAToken({
        comptroller: comptroller,
        supportMarket: true,
        addAltMarket: false,
      });

      await send(comptroller, "harnessDistributeBorrowerAlt", [mkt._address, a1, etherExp(1.1)]);
      expect(await altAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await altBalance(comptroller, a1)).toEqualNumber(0);
      expect(await call(comptroller, 'altBorrowerIndex', [mkt._address, a1])).toEqualNumber(altInitialIndex);
    });
  });

  describe('distributeSupplierAlt()', () => {
    it('should transfer alt and update supply index correctly for first time user', async () => {
      const mkt = cREP;
      await send(comptroller.alt, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});

      await send(mkt, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
      await send(comptroller, "setAltSupplyState", [mkt._address, etherDouble(6), 10]);
      /*
      * 100 delta blocks, 10e18 total supply, 0.5e18 supplySpeed => 6e18 altSupplyIndex
      * confirming an acct with half the total supply over that time gets 25e18 ALT:
        supplierAmount  = 5e18
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 6e36 - 1e36 = 5e36
        suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                        = 5e18 * 5e36 / 1e36 = 25e18
      */

      const tx = await send(comptroller, "harnessDistributeAllSupplierAlt", [mkt._address, a1]);
      expect(await altAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await altBalance(comptroller, a1)).toEqualNumber(25e18);
      expect(tx).toHaveLog('DistributedSupplierAlt', {
        aToken: mkt._address,
        supplier: a1,
        altDelta: etherUnsigned(25e18).toFixed(),
        altSupplyIndex: etherDouble(6).toFixed()
      });
    });

    it('should update alt accrued and supply index for repeat user', async () => {
      const mkt = cREP;
      await send(comptroller.alt, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});

      await send(mkt, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
      await send(comptroller, "setAltSupplyState", [mkt._address, etherDouble(6), 10]);
      await send(comptroller, "setAltSupplierIndex", [mkt._address, a1, etherDouble(2)])
      /*
        supplierAmount  = 5e18
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 6e36 - 2e36 = 4e36
        suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                        = 5e18 * 4e36 / 1e36 = 20e18
      */

      await send(comptroller, "harnessDistributeAllSupplierAlt", [mkt._address, a1]);
      expect(await altAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await altBalance(comptroller, a1)).toEqualNumber(20e18);
    });

    it('should not transfer when altAccrued below threshold', async () => {
      const mkt = cREP;
      await send(comptroller.alt, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});

      await send(mkt, "harnessSetBalance", [a1, etherUnsigned(5e17)]);
      await send(comptroller, "setAltSupplyState", [mkt._address, etherDouble(1.0019), 10]);
      /*
        supplierAmount  = 5e17
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 1.0019e36 - 1e36 = 0.0019e36
        suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                        = 5e17 * 0.0019e36 / 1e36 = 0.00095e18
      */

      await send(comptroller, "harnessDistributeSupplierAlt", [mkt._address, a1]);
      expect(await altAccrued(comptroller, a1)).toEqualNumber(0.00095e18);
      expect(await altBalance(comptroller, a1)).toEqualNumber(0);
    });

    it('should not revert or distribute when called with non-ALT market', async () => {
      const mkt = await makeAToken({
        comptroller: comptroller,
        supportMarket: true,
        addAltMarket: false,
      });

      await send(comptroller, "harnessDistributeSupplierAlt", [mkt._address, a1]);
      expect(await altAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await altBalance(comptroller, a1)).toEqualNumber(0);
      expect(await call(comptroller, 'altBorrowerIndex', [mkt._address, a1])).toEqualNumber(0);
    });

  });

  describe('transferAlt', () => {
    it('should transfer alt accrued when amount is above threshold', async () => {
      const altRemaining = 1000, a1AccruedPre = 100, threshold = 1;
      const altBalancePre = await altBalance(comptroller, a1);
      const tx0 = await send(comptroller.alt, 'transfer', [comptroller._address, altRemaining], {from: root});
      const tx1 = await send(comptroller, 'setAltAccrued', [a1, a1AccruedPre]);
      const tx2 = await send(comptroller, 'harnessTransferAlt', [a1, a1AccruedPre, threshold]);
      const a1AccruedPost = await altAccrued(comptroller, a1);
      const altBalancePost = await altBalance(comptroller, a1);
      expect(altBalancePre).toEqualNumber(0);
      expect(altBalancePost).toEqualNumber(a1AccruedPre);
    });

    it('should not transfer when alt accrued is below threshold', async () => {
      const altRemaining = 1000, a1AccruedPre = 100, threshold = 101;
      const altBalancePre = await call(comptroller.alt, 'balanceOf', [a1]);
      const tx0 = await send(comptroller.alt, 'transfer', [comptroller._address, altRemaining], {from: root});
      const tx1 = await send(comptroller, 'setAltAccrued', [a1, a1AccruedPre]);
      const tx2 = await send(comptroller, 'harnessTransferAlt', [a1, a1AccruedPre, threshold]);
      const a1AccruedPost = await altAccrued(comptroller, a1);
      const altBalancePost = await altBalance(comptroller, a1);
      expect(altBalancePre).toEqualNumber(0);
      expect(altBalancePost).toEqualNumber(0);
    });

    it('should not transfer alt if alt accrued is greater than alt remaining', async () => {
      const altRemaining = 99, a1AccruedPre = 100, threshold = 1;
      const altBalancePre = await altBalance(comptroller, a1);
      const tx0 = await send(comptroller.alt, 'transfer', [comptroller._address, altRemaining], {from: root});
      const tx1 = await send(comptroller, 'setAltAccrued', [a1, a1AccruedPre]);
      const tx2 = await send(comptroller, 'harnessTransferAlt', [a1, a1AccruedPre, threshold]);
      const a1AccruedPost = await altAccrued(comptroller, a1);
      const altBalancePost = await altBalance(comptroller, a1);
      expect(altBalancePre).toEqualNumber(0);
      expect(altBalancePost).toEqualNumber(0);
    });
  });

  describe('claimAlt', () => {
    it('should accrue alt and then transfer alt accrued', async () => {
      const altRemaining = altRate.multipliedBy(100), mintAmount = etherUnsigned(12e18), deltaBlocks = 10;
      await send(comptroller.alt, 'transfer', [comptroller._address, altRemaining], {from: root});
      await pretendBorrow(cLOW, a1, 1, 1, 100);
      await send(comptroller, '_setAltSpeeds', [[cLOW._address], [etherExp(0.5)], [etherExp(0.5)]]);
      await send(comptroller, 'harnessRefreshAltSpeeds');
      const supplySpeed = await call(comptroller, 'altSupplySpeeds', [cLOW._address]);
      const borrowSpeed = await call(comptroller, 'altBorrowSpeeds', [cLOW._address]);
      const a2AccruedPre = await altAccrued(comptroller, a2);
      const altBalancePre = await altBalance(comptroller, a2);
      await quickMint(cLOW, a2, mintAmount);
      await fastForward(comptroller, deltaBlocks);
      const tx = await send(comptroller, 'claimAlt', [a2]);
      const a2AccruedPost = await altAccrued(comptroller, a2);
      const altBalancePost = await altBalance(comptroller, a2);
      expect(tx.gasUsed).toBeLessThan(500000);
      expect(supplySpeed).toEqualNumber(altRate);
      expect(borrowSpeed).toEqualNumber(altRate);
      expect(a2AccruedPre).toEqualNumber(0);
      expect(a2AccruedPost).toEqualNumber(0);
      expect(altBalancePre).toEqualNumber(0);
      expect(altBalancePost).toEqualNumber(altRate.multipliedBy(deltaBlocks).minus(1)); // index is 8333...
    });

    it('should accrue alt and then transfer alt accrued in a single market', async () => {
      const altRemaining = altRate.multipliedBy(100), mintAmount = etherUnsigned(12e18), deltaBlocks = 10;
      await send(comptroller.alt, 'transfer', [comptroller._address, altRemaining], {from: root});
      await pretendBorrow(cLOW, a1, 1, 1, 100);
      await send(comptroller, 'harnessAddAltMarkets', [[cLOW._address]]);
      await send(comptroller, 'harnessRefreshAltSpeeds');
      const supplySpeed = await call(comptroller, 'altSupplySpeeds', [cLOW._address]);
      const borrowSpeed = await call(comptroller, 'altBorrowSpeeds', [cLOW._address]);
      const a2AccruedPre = await altAccrued(comptroller, a2);
      const altBalancePre = await altBalance(comptroller, a2);
      await quickMint(cLOW, a2, mintAmount);
      await fastForward(comptroller, deltaBlocks);
      const tx = await send(comptroller, 'claimAlt', [a2, [cLOW._address]]);
      const a2AccruedPost = await altAccrued(comptroller, a2);
      const altBalancePost = await altBalance(comptroller, a2);
      expect(tx.gasUsed).toBeLessThan(170000);
      expect(supplySpeed).toEqualNumber(altRate);
      expect(borrowSpeed).toEqualNumber(altRate);
      expect(a2AccruedPre).toEqualNumber(0);
      expect(a2AccruedPost).toEqualNumber(0);
      expect(altBalancePre).toEqualNumber(0);
      expect(altBalancePost).toEqualNumber(altRate.multipliedBy(deltaBlocks).minus(1)); // index is 8333...
    });

    it('should claim when alt accrued is below threshold', async () => {
      const altRemaining = etherExp(1), accruedAmt = etherUnsigned(0.0009e18)
      await send(comptroller.alt, 'transfer', [comptroller._address, altRemaining], {from: root});
      await send(comptroller, 'setAltAccrued', [a1, accruedAmt]);
      await send(comptroller, 'claimAlt', [a1, [cLOW._address]]);
      expect(await altAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await altBalance(comptroller, a1)).toEqualNumber(accruedAmt);
    });

    it('should revert when a market is not listed', async () => {
      const cNOT = await makeAToken({comptroller});
      await expect(
        send(comptroller, 'claimAlt', [a1, [cNOT._address]])
      ).rejects.toRevert('revert market must be listed');
    });
  });

  describe('claimAlt batch', () => {
    it('should revert when claiming alt from non-listed market', async () => {
      const altRemaining = altRate.multipliedBy(100), deltaBlocks = 10, mintAmount = etherExp(10);
      await send(comptroller.alt, 'transfer', [comptroller._address, altRemaining], {from: root});
      let [_, __, ...claimAccts] = saddle.accounts;

      for(let from of claimAccts) {
        expect(await send(cLOW.underlying, 'harnessSetBalance', [from, mintAmount], { from })).toSucceed();
        send(cLOW.underlying, 'approve', [cLOW._address, mintAmount], { from });
        send(cLOW, 'mint', [mintAmount], { from });
      }

      await pretendBorrow(cLOW, root, 1, 1, etherExp(10));
      await send(comptroller, 'harnessRefreshAltSpeeds');

      await fastForward(comptroller, deltaBlocks);

      await expect(send(comptroller, 'claimAlt', [claimAccts, [cLOW._address, cEVIL._address], true, true])).rejects.toRevert('revert market must be listed');
    });

    it('should claim the expected amount when holders and ctokens arg is duplicated', async () => {
      const altRemaining = altRate.multipliedBy(100), deltaBlocks = 10, mintAmount = etherExp(10);
      await send(comptroller.alt, 'transfer', [comptroller._address, altRemaining], {from: root});
      let [_, __, ...claimAccts] = saddle.accounts;
      for(let from of claimAccts) {
        expect(await send(cLOW.underlying, 'harnessSetBalance', [from, mintAmount], { from })).toSucceed();
        send(cLOW.underlying, 'approve', [cLOW._address, mintAmount], { from });
        send(cLOW, 'mint', [mintAmount], { from });
      }
      await pretendBorrow(cLOW, root, 1, 1, etherExp(10));
      await send(comptroller, 'harnessAddAltMarkets', [[cLOW._address]]);
      await send(comptroller, 'harnessRefreshAltSpeeds');

      await fastForward(comptroller, deltaBlocks);

      const tx = await send(comptroller, 'claimAlt', [[...claimAccts, ...claimAccts], [cLOW._address, cLOW._address], false, true]);
      // alt distributed => 10e18
      for(let acct of claimAccts) {
        expect(await call(comptroller, 'altSupplierIndex', [cLOW._address, acct])).toEqualNumber(etherDouble(1.125));
        expect(await altBalance(comptroller, acct)).toEqualNumber(etherExp(1.25));
      }
    });

    it('claims alt for multiple suppliers only', async () => {
      const altRemaining = altRate.multipliedBy(100), deltaBlocks = 10, mintAmount = etherExp(10);
      await send(comptroller.alt, 'transfer', [comptroller._address, altRemaining], {from: root});
      let [_, __, ...claimAccts] = saddle.accounts;
      for(let from of claimAccts) {
        expect(await send(cLOW.underlying, 'harnessSetBalance', [from, mintAmount], { from })).toSucceed();
        send(cLOW.underlying, 'approve', [cLOW._address, mintAmount], { from });
        send(cLOW, 'mint', [mintAmount], { from });
      }
      await pretendBorrow(cLOW, root, 1, 1, etherExp(10));
      await send(comptroller, 'harnessAddAltMarkets', [[cLOW._address]]);
      await send(comptroller, 'harnessRefreshAltSpeeds');

      await fastForward(comptroller, deltaBlocks);

      const tx = await send(comptroller, 'claimAlt', [claimAccts, [cLOW._address], false, true]);
      // alt distributed => 10e18
      for(let acct of claimAccts) {
        expect(await call(comptroller, 'altSupplierIndex', [cLOW._address, acct])).toEqualNumber(etherDouble(1.125));
        expect(await altBalance(comptroller, acct)).toEqualNumber(etherExp(1.25));
      }
    });

    it('claims alt for multiple borrowers only, primes uninitiated', async () => {
      const altRemaining = altRate.multipliedBy(100), deltaBlocks = 10, mintAmount = etherExp(10), borrowAmt = etherExp(1), borrowIdx = etherExp(1)
      await send(comptroller.alt, 'transfer', [comptroller._address, altRemaining], {from: root});
      let [_,__, ...claimAccts] = saddle.accounts;

      for(let acct of claimAccts) {
        await send(cLOW, 'harnessIncrementTotalBorrows', [borrowAmt]);
        await send(cLOW, 'harnessSetAccountBorrows', [acct, borrowAmt, borrowIdx]);
      }
      await send(comptroller, 'harnessAddAltMarkets', [[cLOW._address]]);
      await send(comptroller, 'harnessRefreshAltSpeeds');

      await send(comptroller, 'harnessFastForward', [10]);

      const tx = await send(comptroller, 'claimAlt', [claimAccts, [cLOW._address], true, false]);
      for(let acct of claimAccts) {
        expect(await call(comptroller, 'altBorrowerIndex', [cLOW._address, acct])).toEqualNumber(etherDouble(2.25));
        expect(await call(comptroller, 'altSupplierIndex', [cLOW._address, acct])).toEqualNumber(0);
      }
    });

    it('should revert when a market is not listed', async () => {
      const cNOT = await makeAToken({comptroller});
      await expect(
        send(comptroller, 'claimAlt', [[a1, a2], [cNOT._address], true, true])
      ).rejects.toRevert('revert market must be listed');
    });
  });

  describe('harnessRefreshAltSpeeds', () => {
    it('should start out 0', async () => {
      await send(comptroller, 'harnessRefreshAltSpeeds');
      const supplySpeed = await call(comptroller, 'altSupplySpeeds', [cLOW._address]);
      const borrowSpeed = await call(comptroller, 'altBorrowSpeeds', [cLOW._address]);
      expect(supplySpeed).toEqualNumber(0);
      expect(borrowSpeed).toEqualNumber(0);
    });

    it('should get correct speeds with borrows', async () => {
      await pretendBorrow(cLOW, a1, 1, 1, 100);
      await send(comptroller, 'harnessAddAltMarkets', [[cLOW._address]]);
      const tx = await send(comptroller, 'harnessRefreshAltSpeeds');
      const supplySpeed = await call(comptroller, 'altSupplySpeeds', [cLOW._address]);
      const borrowSpeed = await call(comptroller, 'altBorrowSpeeds', [cLOW._address]);
      expect(supplySpeed).toEqualNumber(altRate);
      expect(borrowSpeed).toEqualNumber(altRate);
      expect(tx).toHaveLog(['AltBorrowSpeedUpdated', 0], {
        aToken: cLOW._address,
        newSpeed: borrowSpeed
      });
      expect(tx).toHaveLog(['AltSupplySpeedUpdated', 0], {
        aToken: cLOW._address,
        newSpeed: supplySpeed
      });
    });

    it('should get correct speeds for 2 assets', async () => {
      await pretendBorrow(cLOW, a1, 1, 1, 100);
      await pretendBorrow(cZRX, a1, 1, 1, 100);
      await send(comptroller, 'harnessAddAltMarkets', [[cLOW._address, cZRX._address]]);
      await send(comptroller, 'harnessRefreshAltSpeeds');
      const supplySpeed1 = await call(comptroller, 'altSupplySpeeds', [cLOW._address]);
      const borrowSpeed1 = await call(comptroller, 'altBorrowSpeeds', [cLOW._address]);
      const supplySpeed2 = await call(comptroller, 'altSupplySpeeds', [cREP._address]);
      const borrowSpeed2 = await call(comptroller, 'altBorrowSpeeds', [cREP._address]);
      const supplySpeed3 = await call(comptroller, 'altSupplySpeeds', [cZRX._address]);
      const borrowSpeed3 = await call(comptroller, 'altBorrowSpeeds', [cZRX._address]);
      expect(supplySpeed1).toEqualNumber(altRate.dividedBy(4));
      expect(borrowSpeed1).toEqualNumber(altRate.dividedBy(4));
      expect(supplySpeed2).toEqualNumber(0);
      expect(borrowSpeed2).toEqualNumber(0);
      expect(supplySpeed3).toEqualNumber(altRate.dividedBy(4).multipliedBy(3));
      expect(borrowSpeed3).toEqualNumber(altRate.dividedBy(4).multipliedBy(3));
    });
  });

  describe('harnessSetAltSpeeds', () => {
    it('should correctly set differing ALT supply and borrow speeds', async () => {
      const desiredAltSupplySpeed = 3;
      const desiredAltBorrowSpeed = 20;
      await send(comptroller, 'harnessAddAltMarkets', [[cLOW._address]]);
      const tx = await send(comptroller, '_setAltSpeeds', [[cLOW._address], [desiredAltSupplySpeed], [desiredAltBorrowSpeed]]);
      expect(tx).toHaveLog(['AltBorrowSpeedUpdated', 0], {
        aToken: cLOW._address,
        newSpeed: desiredAltBorrowSpeed
      });
      expect(tx).toHaveLog(['AltSupplySpeedUpdated', 0], {
        aToken: cLOW._address,
        newSpeed: desiredAltSupplySpeed
      });
      const currentAltSupplySpeed = await call(comptroller, 'altSupplySpeeds', [cLOW._address]);
      const currentAltBorrowSpeed = await call(comptroller, 'altBorrowSpeeds', [cLOW._address]);
      expect(currentAltSupplySpeed).toEqualNumber(desiredAltSupplySpeed);
      expect(currentAltBorrowSpeed).toEqualNumber(desiredAltBorrowSpeed);
    });

    it('should correctly get differing ALT supply and borrow speeds for 4 assets', async () => {
      const cBAT = await makeAToken({ comptroller, supportMarket: true });
      const cDAI = await makeAToken({ comptroller, supportMarket: true });

      const borrowSpeed1 = 5;
      const supplySpeed1 = 10;

      const borrowSpeed2 = 0;
      const supplySpeed2 = 100;

      const borrowSpeed3 = 0;
      const supplySpeed3 = 0;

      const borrowSpeed4 = 13;
      const supplySpeed4 = 0;

      await send(comptroller, 'harnessAddAltMarkets', [[cREP._address, cZRX._address, cBAT._address, cDAI._address]]);
      await send(comptroller, '_setAltSpeeds', [[cREP._address, cZRX._address, cBAT._address, cDAI._address], [supplySpeed1, supplySpeed2, supplySpeed3, supplySpeed4], [borrowSpeed1, borrowSpeed2, borrowSpeed3, borrowSpeed4]]);

      const currentSupplySpeed1 = await call(comptroller, 'altSupplySpeeds', [cREP._address]);
      const currentBorrowSpeed1 = await call(comptroller, 'altBorrowSpeeds', [cREP._address]);
      const currentSupplySpeed2 = await call(comptroller, 'altSupplySpeeds', [cZRX._address]);
      const currentBorrowSpeed2 = await call(comptroller, 'altBorrowSpeeds', [cZRX._address]);
      const currentSupplySpeed3 = await call(comptroller, 'altSupplySpeeds', [cBAT._address]);
      const currentBorrowSpeed3 = await call(comptroller, 'altBorrowSpeeds', [cBAT._address]);
      const currentSupplySpeed4 = await call(comptroller, 'altSupplySpeeds', [cDAI._address]);
      const currentBorrowSpeed4 = await call(comptroller, 'altBorrowSpeeds', [cDAI._address]);

      expect(currentSupplySpeed1).toEqualNumber(supplySpeed1);
      expect(currentBorrowSpeed1).toEqualNumber(borrowSpeed1);
      expect(currentSupplySpeed2).toEqualNumber(supplySpeed2);
      expect(currentBorrowSpeed2).toEqualNumber(borrowSpeed2);
      expect(currentSupplySpeed3).toEqualNumber(supplySpeed3);
      expect(currentBorrowSpeed3).toEqualNumber(borrowSpeed3);
      expect(currentSupplySpeed4).toEqualNumber(supplySpeed4);
      expect(currentBorrowSpeed4).toEqualNumber(borrowSpeed4);
    });

    const checkAccrualsBorrowAndSupply = async (altSupplySpeed, altBorrowSpeed) => {
      const mintAmount = etherUnsigned(1000e18), borrowAmount = etherUnsigned(1e18), borrowCollateralAmount = etherUnsigned(1000e18), altRemaining = altRate.multipliedBy(100), deltaBlocks = 10;

      // Transfer ALT to the comptroller
      await send(comptroller.alt, 'transfer', [comptroller._address, altRemaining], {from: root});

      // Setup comptroller
      await send(comptroller, 'harnessAddAltMarkets', [[cLOW._address, cUSD._address]]);

      // Set alt speeds to 0 while we setup
      await send(comptroller, '_setAltSpeeds', [[cLOW._address, cUSD._address], [0, 0], [0, 0]]);

      // a2 - supply
      await quickMint(cLOW, a2, mintAmount); // a2 is the supplier

      // a1 - borrow (with supplied collateral)
      await quickMint(cUSD, a1, borrowCollateralAmount);
      await enterMarkets([cUSD], a1);
      await quickBorrow(cLOW, a1, borrowAmount); // a1 is the borrower

      // Initialize alt speeds
      await send(comptroller, '_setAltSpeeds', [[cLOW._address], [altSupplySpeed], [altBorrowSpeed]]);

      // Get initial ALT balances
      const a1TotalAltPre = await totalAltAccrued(comptroller, a1);
      const a2TotalAltPre = await totalAltAccrued(comptroller, a2);

      // Start off with no ALT accrued and no ALT balance
      expect(a1TotalAltPre).toEqualNumber(0);
      expect(a2TotalAltPre).toEqualNumber(0);

      // Fast forward blocks
      await fastForward(comptroller, deltaBlocks);

      // Accrue ALT
      await send(comptroller, 'claimAlt', [[a1, a2], [cLOW._address], true, true]);

      // Get accrued ALT balances
      const a1TotalAltPost = await totalAltAccrued(comptroller, a1);
      const a2TotalAltPost = await totalAltAccrued(comptroller, a2);

      // check accrual for borrow
      expect(a1TotalAltPost).toEqualNumber(Number(altBorrowSpeed) > 0 ? altBorrowSpeed.multipliedBy(deltaBlocks).minus(1) : 0);

      // check accrual for supply
      expect(a2TotalAltPost).toEqualNumber(Number(altSupplySpeed) > 0 ? altSupplySpeed.multipliedBy(deltaBlocks) : 0);
    };

    it('should accrue alt correctly with only supply-side rewards', async () => {
      await checkAccrualsBorrowAndSupply(/* supply speed */ etherExp(0.5), /* borrow speed */ 0);
    });

    it('should accrue alt correctly with only borrow-side rewards', async () => {
      await checkAccrualsBorrowAndSupply(/* supply speed */ 0, /* borrow speed */ etherExp(0.5));
    });
  });

  describe('harnessAddAltMarkets', () => {
    it('should correctly add a alt market if called by admin', async () => {
      const cBAT = await makeAToken({comptroller, supportMarket: true});
      const tx1 = await send(comptroller, 'harnessAddAltMarkets', [[cLOW._address, cREP._address, cZRX._address]]);
      const tx2 = await send(comptroller, 'harnessAddAltMarkets', [[cBAT._address]]);
      const markets = await call(comptroller, 'getAltMarkets');
      expect(markets).toEqual([cLOW, cREP, cZRX, cBAT].map((c) => c._address));
      expect(tx2).toHaveLog('AltBorrowSpeedUpdated', {
        aToken: cBAT._address,
        newSpeed: 1
      });
      expect(tx2).toHaveLog('AltSupplySpeedUpdated', {
        aToken: cBAT._address,
        newSpeed: 1
      });
    });

    it('should not write over a markets existing state', async () => {
      const mkt = cLOW._address;
      const bn0 = 10, bn1 = 20;
      const idx = etherUnsigned(1.5e36);

      await send(comptroller, "harnessAddAltMarkets", [[mkt]]);
      await send(comptroller, "setAltSupplyState", [mkt, idx, bn0]);
      await send(comptroller, "setAltBorrowState", [mkt, idx, bn0]);
      await send(comptroller, "setBlockNumber", [bn1]);
      await send(comptroller, "_setAltSpeeds", [[mkt], [0], [0]]);
      await send(comptroller, "harnessAddAltMarkets", [[mkt]]);

      const supplyState = await call(comptroller, 'altSupplyState', [mkt]);
      expect(supplyState.block).toEqual(bn1.toString());
      expect(supplyState.index).toEqual(idx.toFixed());

      const borrowState = await call(comptroller, 'altBorrowState', [mkt]);
      expect(borrowState.block).toEqual(bn1.toString());
      expect(borrowState.index).toEqual(idx.toFixed());
    });
  });


  describe('updateContributorRewards', () => {
    it('should not fail when contributor rewards called on non-contributor', async () => {
      const tx1 = await send(comptroller, 'updateContributorRewards', [a1]);
    });

    it('should accrue alt to contributors', async () => {
      const tx1 = await send(comptroller, '_setContributorAltSpeed', [a1, 2000]);
      await fastForward(comptroller, 50);

      const a1Accrued = await altAccrued(comptroller, a1);
      expect(a1Accrued).toEqualNumber(0);

      const tx2 = await send(comptroller, 'updateContributorRewards', [a1], {from: a1});
      const a1Accrued2 = await altAccrued(comptroller, a1);
      expect(a1Accrued2).toEqualNumber(50 * 2000);
    });

    it('should accrue alt with late set', async () => {
      await fastForward(comptroller, 1000);
      const tx1 = await send(comptroller, '_setContributorAltSpeed', [a1, 2000]);
      await fastForward(comptroller, 50);

      const tx2 = await send(comptroller, 'updateContributorRewards', [a1], {from: a1});
      const a1Accrued2 = await altAccrued(comptroller, a1);
      expect(a1Accrued2).toEqualNumber(50 * 2000);
    });
  });

  describe('_setContributorAltSpeed', () => {
    it('should revert if not called by admin', async () => {
      await expect(
        send(comptroller, '_setContributorAltSpeed', [a1, 1000], {from: a1})
      ).rejects.toRevert('revert only admin can set alt speed');
    });

    it('should start alt stream if called by admin', async () => {
      const tx = await send(comptroller, '_setContributorAltSpeed', [a1, 1000]);
      expect(tx).toHaveLog('ContributorAltSpeedUpdated', {
        contributor: a1,
        newSpeed: 1000
      });
    });

    it('should reset alt stream if set to 0', async () => {
      const tx1 = await send(comptroller, '_setContributorAltSpeed', [a1, 2000]);
      await fastForward(comptroller, 50);

      const tx2 = await send(comptroller, '_setContributorAltSpeed', [a1, 0]);
      await fastForward(comptroller, 50);

      const tx3 = await send(comptroller, 'updateContributorRewards', [a1], {from: a1});
      const a1Accrued = await altAccrued(comptroller, a1);
      expect(a1Accrued).toEqualNumber(50 * 2000);
    });
  });
});
