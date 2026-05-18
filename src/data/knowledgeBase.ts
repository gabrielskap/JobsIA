export const dictionary = [
  {
    term: "Transhost",
    definition: "Processo de transferência de arquivos entre servidores (internos ou externos). É o 'calo' da operação, exigindo a execução conjunta dos Jobs Tipo 3 e Tipo 10.",
    category: "Conceito"
  },
  {
    term: "GET",
    definition: "Sentido da operação onde o servidor local captura/busca um arquivo de um servidor remoto.",
    category: "Operação"
  },
  {
    term: "PUT",
    definition: "Sentido da operação onde o servidor local envia/deposita um arquivo em um servidor remoto.",
    category: "Operação"
  },
  {
    term: "Workload",
    definition: "Ferramenta orquestradora de applications e jobs utilizada pela Dataprev para agendar e executar rotinas batch.",
    category: "Ferramenta"
  },
  {
    term: "Application",
    definition: "Conjunto de jobs organizados em fluxos lógicos (árvores de execução) que rodam em batch.",
    category: "Conceito"
  },
  {
    term: "Job Tipo 3",
    definition: "Job genérico responsável por gerar a LISTA TRANS_HOSTS. É o pré-requisito obrigatório para que o Job Tipo 10 saiba quais arquivos transferir.",
    category: "Job Genérico"
  },
  {
    term: "Job Tipo 10",
    definition: "Job genérico responsável por efetuar a TRANSFERÊNCIA DE ARQS ENTRE SERVIDORES INTERNOS (GET e PUT), consumindo a lista gerada pelo Job Tipo 3.",
    category: "Job Genérico"
  },
  {
    term: "ASCII / EBCDIC",
    definition: "Padrões de codificação de caracteres. ASCII é comum em sistemas abertos (Linux/Windows), enquanto EBCDIC era padrão em Mainframes (Grande Porte).",
    category: "Codificação"
  }
];

export const norms = {
  title: "Norma N/PD/004/02 - Nomenclatura",
  rules: [
    {
      environment: "Geral",
      rule: "O nome do ARQUIVO deve utilizar o seu PREFIXO PADRÃO de 13 caracteres (T d SIS d SUB d 999)."
    },
    {
      environment: "Geral",
      rule: "Tamanho máximo de 36 caracteres em LETRAS MAIÚSCULAS."
    },
    {
      environment: "UNIX / LINUX",
      rule: "Delimitador OBRIGATÓRIO: '.' (ponto). Exemplo: D.CNS.BOE.002.20251016"
    },
    {
      environment: "Windows",
      rule: "Delimitador OBRIGATÓRIO: '_' (underscore). Exemplo: D_SCO_ATU_005_BATIMENTO"
    }
  ]
};

export const jobs: {
  id: number;
  name: string;
  script: string;
  description: string;
  parameters: { flag: string | null; parameter_type: 'flag' | 'positional' | 'internal' | 'generated'; name: string; required: boolean; description: string }[];
}[] = [];
