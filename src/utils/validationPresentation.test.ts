import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCatalogNotConfiguredWarning,
  warningsForUserPresentation,
} from './validationPresentation';

test('identifica avisos de catálogo ainda não configurado', () => {
  assert.equal(isCatalogNotConfiguredWarning({ ruleCode: 'CATALOG-GENERIC-NOT-CONFIGURED' }), true);
  assert.equal(isCatalogNotConfiguredWarning({ ruleCode: ' catalog-bridge-not-configured ' }), true);
  assert.equal(isCatalogNotConfiguredWarning({ ruleCode: 'CATALOG-GENERIC-UNKNOWN' }), false);
});

test('mantém outros avisos para a apresentação ao usuário', () => {
  const warnings = [
    { ruleCode: 'CATALOG-GENERIC-NOT-CONFIGURED', message: 'catálogo pendente' },
    { ruleCode: 'APPLICATION-SUGGESTION', message: 'sugestão publicada' },
  ];

  assert.deepEqual(warningsForUserPresentation(warnings), [warnings[1]]);
  assert.equal(warnings.length, 2);
});
