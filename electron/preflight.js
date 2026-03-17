const fs = require('fs');
const path = require('path');

function resolveProjectPath(...parts) {
  return path.join(__dirname, '..', ...parts);
}

function getMissingPaths() {
  const requiredPaths = [
    'apps/safeview',
    'apps/dashboard',
    'apps/safeview/dist/index.html',
    'apps/dashboard/dist/index.html',
  ];

  return requiredPaths.filter((relativePath) => {
    const fullPath = resolveProjectPath(...relativePath.split('/'));
    return !fs.existsSync(fullPath);
  });
}

function getPreflightMessage(missingPaths) {
  const formattedMissing = missingPaths.map((p) => ` - ${p}`).join('\n');
  return [
    'Estrutura do app incompleta para iniciar o SafeView EPI.',
    '',
    'Itens ausentes:',
    formattedMissing,
    '',
    'Como corrigir:',
    ' 1) Execute setup.bat para clonar os apps.',
    ' 2) Execute npm run build para gerar os dist/.',
  ].join('\n');
}

function assertProjectReady() {
  const missingPaths = getMissingPaths();
  if (missingPaths.length) {
    const message = getPreflightMessage(missingPaths);
    throw new Error(message);
  }
}

module.exports = { assertProjectReady, getMissingPaths, getPreflightMessage };
