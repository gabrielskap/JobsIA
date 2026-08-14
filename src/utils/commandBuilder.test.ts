import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommand } from './commandBuilder';

test('monta flags concatenadas e parâmetros posicionais entre aspas', () => {
  const command = buildCommand('/u/bin/job.sh', [
    { name: 'arquivo', parameter_type: 'flag', flag: '-f', required: true },
    { name: 'application', parameter_type: 'positional', flag: null, required: true },
  ], {
    arquivo: 'entrada.dat',
    application: 'DIT.TRH.DIARIO',
  });

  assert.equal(command, '/u/bin/job.sh -fentrada.dat "DIT.TRH.DIARIO"');
});

test('ignora parâmetros internos, gerados e exclusivamente documentais', () => {
  const command = buildCommand('/u/bin/job.sh', [
    { name: 'interno', parameter_type: 'internal', flag: null, required: false },
    { name: 'gerado', parameter_type: 'generated', flag: null, required: false },
    { name: 'capador', parameter_type: 'flag', flag: '-c', required: false, document_only: true },
  ], {
    interno: 'x',
    gerado: 'y',
    capador: 'z',
  });

  assert.equal(command, '/u/bin/job.sh');
});

test('ignora valores ausentes ou vazios sem produzir espaços extras', () => {
  const command = buildCommand('/u/bin/job.sh', [
    { name: 'arquivo', parameter_type: 'flag', flag: '-f', required: false },
    { name: 'destino', parameter_type: 'positional', flag: null, required: false },
  ], { arquivo: '', destino: undefined });

  assert.equal(command, '/u/bin/job.sh');
});

test('preserva a ordem declarada dos parâmetros', () => {
  const command = buildCommand('/u/bin/job.sh', [
    { name: 'primeiro', parameter_type: 'positional', flag: null, required: true },
    { name: 'segundo', parameter_type: 'flag', flag: '--next=', required: true },
  ], { primeiro: 'A', segundo: 'B' });

  assert.equal(command, '/u/bin/job.sh "A" --next=B');
});
