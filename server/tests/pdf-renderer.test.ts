import test from 'node:test';
import assert from 'node:assert/strict';
import { pdfService } from '../services/pdfService';

test('PDF renderer supports a structured Application checklist with multiple jobs', () => {
  const buffer = pdfService.generateChecklistPDF({
    status: 'Concluído',
    user_name: 'Responsável pelo Checklist',
    application: 'DIT.TRH.DIARIO',
    responsibilities: {
      responsavel_operacional: 'Maria Silva',
      gestor: 'João Souza',
    },
    scheduling: {
      recorrencia: 'Todo dia 11 de cada mês',
      horario_processamento: '22:00',
      fuso_horario: 'America/Sao_Paulo',
    },
    jobs: [
      {
        sequence: 1,
        job_type_name: 'Gera Lista Trans_Hosts',
        generic: 'Hadoop',
        bridge: 'PONTE-DIOT-01',
        servers: ['UXRJO001', 'UXRSP002'],
        parameters: { ambiente: 'PRD', arquivo: '/u/data/entrada.csv' },
        capador: { diretorio_origem: '/u/data', capacidade_armazenamento: '500 MB' },
        metadata: { dependencia: 'Application anterior' },
        campo_especifico: 'Informação adicional do job',
        command: 'sh /u/bin/J.DIT.OPR.003.SH -a DIT.TRH.DIARIO',
      },
      {
        sequence: 2,
        job_name: 'Transferência de arquivos',
        generico: 'DataFlux',
        ponte: 'PONTE-DIOT-02',
        servidor: 'UXRSP002',
        capador: { diretorio_destino: '/u/data/destino' },
        command: 'sh /u/bin/J.DIT.OPR.010.SH -a DIT.TRH.DIARIO',
      },
    ],
  });

  assert.ok(buffer instanceof Buffer);
  assert.ok(buffer.length > 2_000);
  assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-');
});

test('PDF renderer retains legacy single-job payload support', () => {
  const buffer = pdfService.generateChecklistPDF({
    status: 'Concluído',
    user_name: 'Responsável pelo Checklist',
    application: 'DIT.TRH.DIARIO',
    command: 'sh /u/bin/J.DIT.OPR.003.SH -a DIT.TRH.DIARIO',
    servidor_origem: 'UXRJO001',
    diretorio_origem: '/u/data/origem',
    capacidade_armazenamento: '500 MB',
  });

  assert.ok(buffer instanceof Buffer);
  assert.ok(buffer.length > 1_000);
  assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-');
});
