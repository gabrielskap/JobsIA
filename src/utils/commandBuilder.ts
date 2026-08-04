import type { ParameterType } from '../types/database';

interface CommandParameter {
  parameter_type: ParameterType;
  flag: string | null;
  name: string;
  required: boolean;
  document_only?: boolean;
}

/**
 * Monta o comando final de um job a partir dos metadados dos parâmetros e dos
 * valores coletados. Totalmente orientado a metadata — sem regras por tipo de job.
 *
 * Regras por parameter_type:
 *   flag      → <flag><valor>        ex: -fARQUIVO  (concatenado, convenção destes scripts)
 *   positional → "<valor>"           ex: "shellName" (posicional com aspas)
 *   internal  → ignorado no comando
 *   generated → ignorado no comando (valor preenchido pelo backend/IA antes de chamar)
 *
 * @param script   Caminho do script principal do job
 * @param params   Parâmetros do job na ordem de inserção
 * @param values   Mapa { param.name → valor coletado } — valores undefined/'' são ignorados
 */
export function buildCommand(
  script: string,
  params: CommandParameter[],
  values: Record<string, string | undefined>
): string {
  const parts: string[] = [script];

  for (const param of params) {
    if (param.document_only || param.parameter_type === 'internal' || param.parameter_type === 'generated') continue;

    const value = values[param.name];
    if (!value) continue;

    if (param.parameter_type === 'flag' && param.flag) {
      parts.push(`${param.flag}${value}`);
    } else if (param.parameter_type === 'positional') {
      parts.push(`"${value}"`);
    }
  }

  return parts.join(' ');
}
