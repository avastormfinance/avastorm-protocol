const {
  makeAToken,
} = require('../Utils/Avastorm');


describe('CAltLikeDelegate', function () {
  describe("_delegateAltLikeTo", () => {
    it("does not delegate if not the admin", async () => {
      const [root, a1] = saddle.accounts;
      const aToken = await makeAToken({kind: 'calt'});
      await expect(send(aToken, '_delegateAltLikeTo', [a1], {from: a1})).rejects.toRevert('revert only the admin may set the alt-like delegate');
    });

    it("delegates successfully if the admin", async () => {
      const [root, a1] = saddle.accounts, amount = 1;
      const cALT = await makeAToken({kind: 'calt'}), ALT = cALT.underlying;
      const tx1 = await send(cALT, '_delegateAltLikeTo', [a1]);
      const tx2 = await send(ALT, 'transfer', [cALT._address, amount]);
      await expect(await call(ALT, 'getCurrentVotes', [a1])).toEqualNumber(amount);
    });
  });
});