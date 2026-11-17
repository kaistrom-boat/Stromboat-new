const fs = require('fs');
const path = require('path');
const solc = require('/home/hatch/workspace/tmp-check/acs-solc/node_modules/solc');

const PROJ = '/home/hatch/workspace/projects/stromboat-mint/contracts';
const OZ = '/home/hatch/workspace/projects/ascension-catty/build-env/node_modules';

function findImports(importPath) {
  try {
    return { contents: fs.readFileSync(path.join(OZ, importPath), 'utf8') };
  } catch (e) {
    return { error: 'not found: ' + importPath };
  }
}

const sources = {
  'Stromboat.sol': { content: fs.readFileSync(path.join(PROJ, 'Stromboat.sol'), 'utf8') },
  'MockRegistry.sol': { content: fs.readFileSync(path.join(PROJ, 'MockRegistry.sol'), 'utf8') },
};

const input = {
  language: 'Solidity',
  sources,
  settings: {
    evmVersion: 'paris',
    viaIR: true,
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
if (output.errors) {
  for (const e of output.errors) {
    console.log(e.severity.toUpperCase(), e.formattedMessage);
  }
  if (output.errors.some((e) => e.severity === 'error')) process.exit(1);
}

const c = output.contracts['Stromboat.sol']['Stromboat'];
fs.writeFileSync(path.join(PROJ, 'Stromboat.abi.json'), JSON.stringify(c.abi, null, 1));
fs.writeFileSync(path.join(PROJ, 'Stromboat.creation.txt'), '0x' + c.evm.bytecode.object);
fs.writeFileSync(path.join(PROJ, 'Stromboat.runtime.txt'), '0x' + c.evm.deployedBytecode.object);
const m = output.contracts['MockRegistry.sol']['MockRegistry'];
fs.writeFileSync(path.join(PROJ, 'MockRegistry.runtime.txt'), '0x' + m.evm.deployedBytecode.object);
fs.writeFileSync(path.join(PROJ, 'sourcify-stdjson.json'), JSON.stringify(input));
console.log('compiled OK — creation bytes:', c.evm.bytecode.object.length / 2, '| runtime bytes:', c.evm.deployedBytecode.object.length / 2);
console.log('solc:', solc.version());
