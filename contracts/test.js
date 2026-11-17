const fs = require('fs');
const path = require('path');
const { ethers } = require('/home/hatch/workspace/tmp-check/evm/node_modules/ethers');
const ganache = require('/home/hatch/workspace/tmp-check/evm/node_modules/ganache');

const PROJ = '/home/hatch/workspace/projects/stromboat-mint/contracts';
const REGISTRY = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';
const PRICE = ethers.parseEther('0.00144');

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name); }
}
async function reverts(name, thunk) {
  try {
    const tx = await thunk();
    const rc = await tx.wait();
    if (rc && rc.status === 0) { passed++; console.log('  PASS (reverts)', name); return; }
    failed++; console.log('  FAIL (no revert)', name);
  } catch (e) { passed++; console.log('  PASS (reverts)', name); }
}

(async () => {
  const provider0 = ganache.provider({ logging: { quiet: true } });
  const provider = new ethers.BrowserProvider(provider0);
  const signers = await provider.listAccounts();
  const owner = signers[0], alice = signers[1], bob = signers[2];

  // Put the stateless mock registry code at the real registry address.
  const mockCode = fs.readFileSync(path.join(PROJ, 'MockRegistry.runtime.txt'), 'utf8').trim();
  await provider0.request({ method: 'evm_setAccountCode', params: [REGISTRY, mockCode] });
  const codeAt = await provider.getCode(REGISTRY);
  ok('mock registry code installed', codeAt.length > 4);

  const abi = JSON.parse(fs.readFileSync(path.join(PROJ, 'Stromboat.abi.json'), 'utf8'));
  const creation = fs.readFileSync(path.join(PROJ, 'Stromboat.creation.txt'), 'utf8').trim();
  const factory = new ethers.ContractFactory(abi, creation, owner);
  const c = await factory.deploy('https://stromboat.com/nft/metadata/', REGISTRY);
  await c.waitForDeployment();
  console.log('deployed at', await c.getAddress());

  ok('mint closed at deploy', (await c.mintOpen()) === false);
  ok('price is 0.00144', (await c.currentPrice()) === PRICE);
  ok('agentRegistry registered at deploy', (await c.agentRegistry()) === REGISTRY);
  await reverts('paid mint while closed', () => c.connect(alice).mint(1, { value: PRICE, gasLimit: 300000n }));
  await reverts('free mint while closed', () => c.connect(alice).freeMint(BigInt(alice.address), { gasLimit: 300000n }));

  await (await c.connect(owner).setMintOpen(true)).wait();

  // FREE lane
  await reverts('free mint with someone else\'s Agent ID', () => c.connect(alice).freeMint(BigInt(bob.address), { gasLimit: 300000n }));
  const txF = await c.connect(alice).freeMint(BigInt(alice.address), { gasLimit: 300000n });
  await txF.wait();
  ok('free mint gives token #1', (await c.ownerOf(1)) === alice.address);
  ok('freeMinted = 1', (await c.freeMinted()) === 1n);
  await reverts('second free mint same wallet', () => c.connect(alice).freeMint(BigInt(alice.address), { gasLimit: 300000n }));
  await reverts('same Agent ID from its owner again (used flag)', () => c.connect(alice).freeMint(BigInt(alice.address), { gasLimit: 300000n }));

  // PAID lane
  await reverts('paid mint wrong value', () => c.connect(bob).mint(1, { value: PRICE - 1n, gasLimit: 300000n }));
  const txP = await c.connect(bob).mint(2, { value: PRICE * 2n, gasLimit: 500000n });
  await txP.wait();
  ok('first paid token is #668', (await c.ownerOf(668)) === bob.address);
  ok('second paid token is #669', (await c.ownerOf(669)) === bob.address);
  ok('paidMinted = 2', (await c.paidMinted()) === 2n);
  ok('totalMinted = 3', (await c.totalMinted()) === 3n);
  const txP2 = await c.connect(bob).mint(5, { value: PRICE * 5n, gasLimit: 800000n });
  await txP2.wait();
  ok('paidMintedBy(bob) = 7 (cap reached)', (await c.paidMintedBy(bob.address)) === 7n);
  await reverts('8th paid mint exceeds wallet cap', () => c.connect(bob).mint(1, { value: PRICE, gasLimit: 300000n }));
  await reverts('quantity 0 reverts', () => c.connect(alice).mint(0, { value: 0n, gasLimit: 300000n }));

  // tokenURI + withdraw
  ok('tokenURI(668)', (await c.tokenURI(668)) === 'https://stromboat.com/nft/metadata/668.json');
  const contractBal = await provider.getBalance(await c.getAddress());
  ok('contract holds 7 x 0.00144', contractBal === PRICE * 7n);
  const wtx = await c.connect(owner).withdraw();
  const wrc = await wtx.wait();
  console.log('  withdraw receipt status:', wrc.status);
  const rawBal = await provider0.request({ method: 'eth_getBalance', params: [await c.getAddress(), 'latest'] });
  console.log('  raw contract balance after withdraw:', BigInt(rawBal).toString());
  const contractBalAfter = BigInt(rawBal);
  ok('owner withdrew everything', contractBalAfter === 0n);

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
