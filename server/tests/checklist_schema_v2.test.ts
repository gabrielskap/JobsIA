import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChecklistSchedule,
  validateChecklistApplicationProposal,
  validateChecklistProposal,
} from '../schemas/checklistSchema';
import { validateApplicationName } from '../services/validationEngine';

test('schema v1 continua compatível para proposta de um job', () => {
  const result = validateChecklistProposal({
    request_id: 'legacy-schema-v1',
    job_type_id: 3,
    collected_data: { Application: 'DIT.TRH.DIARIO' },
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.schema_version, 1);
  assert.equal(result.data?.job_type_id, 3);
});

test('schema v2 normaliza servidor compartilhado e agenda recorrente', () => {
  const result = validateChecklistApplicationProposal({
    request_id: 'application-shared-server',
    schema_version: 2,
    application: {
      name: 'DIT.TRH.DIARIO',
      responsible_name: 'Responsável Operacional',
      server_mode: 'shared',
      shared_server: 'UXRJO001',
      schedule: {
        kind: 'recurrence',
        recurrence: 'Todo dia 11 de cada mês',
        time: '2200',
      },
    },
    jobs: [
      {
        sequence: 1,
        job_type_id: 3,
        generic: 'Gera Lista Trans_Hosts',
        bridge: { code: 'PONTE-OPERACIONAL' },
        parameters: {},
        capador: { applicable: false },
      },
      {
        sequence: 2,
        job_type_id: 10,
        generic: { code: 'TRANSHOST', name: 'Transferência interna' },
        bridge: 'Ponte de produção',
        parameters: {},
        capador: { applicable: true, parameters: { diretorio_origem: '/u/dados' } },
      },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.application.schedule?.time, '22:00:00');
  assert.equal(result.data?.jobs[0].server, 'UXRJO001');
  assert.equal(result.data?.jobs[1].server, 'UXRJO001');
  assert.deepEqual(result.data?.jobs.map(job => job.sequence), [1, 2]);
});

test('schema v2 exige responsável, servidor compartilhado e ordem contínua', () => {
  const result = validateChecklistApplicationProposal({
    request_id: 'application-invalid',
    schema_version: 2,
    application: {
      name: 'DIT.TRH.DIARIO',
      responsible_name: '',
      server_mode: 'shared',
    },
    jobs: [
      {
        sequence: 2,
        job_type_id: 3,
        generic: 'Gera Lista Trans_Hosts',
        bridge: 'Ponte',
        parameters: {},
      },
    ],
  });

  assert.equal(result.success, false);
  assert.ok(result.errors?.some(error => error.includes('responsible_name')));
  assert.ok(result.errors?.some(error => error.includes('shared_server')));
  assert.ok(result.errors?.some(error => error.includes('sequência contínua')));
});

test('normalizador aceita data/hora e recorrência sem inventar gramática corporativa', () => {
  const datetime = normalizeChecklistSchedule({
    kind: 'datetime',
    datetime: '20260723T2200',
  });
  assert.equal(datetime.success, true);
  assert.equal(datetime.data?.datetime, '2026-07-23T22:00:00');
  assert.equal(datetime.data?.timezone, 'America/Sao_Paulo');

  const recurrence = normalizeChecklistSchedule({
    kind: 'recurrence',
    recurrence: 'Todo dia 11 de cada mês',
  });
  assert.equal(recurrence.success, true);
  assert.equal(recurrence.data?.recurrence, 'Todo dia 11 de cada mês');
});

test('validador de Application usa sugestão somente da regra publicada', () => {
  const result = validateApplicationName('dit.trh.diario', [{
    code: 'APPLICATION-UPPERCASE',
    validation_regex: '^[A-Z.]+$',
    severity: 'BLOQUEANTE',
    message: 'Use letras maiúsculas.',
    suggestion_template: 'SUGESTAO:{value}',
  }]);

  assert.equal(result.errors.length, 1);
  assert.equal(result.suggestedValue, 'SUGESTAO:dit.trh.diario');
});
