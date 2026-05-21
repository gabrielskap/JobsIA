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

export const jobs = [
  {
    id: 1,
    name: "Execução de JOBS TIPO SWADM",
    script: "/mainframe/sys/swadm/bridge/scripts/startJobs.bridge",
    description: "Execução de jobs legados do ambiente MV2 migrado.",
    parameters: [
      { flag: "Nome do Shell", name: "Nome do Shell SWAdm", required: true, description: "Ex: <Job SWAdm>" },
      { flag: "Parâmetros", name: "Parâmetros do Shell SWAdm", required: true, description: "Ex: <Fases>|<Param1>|<ParamN>" },
      { flag: "Executor", name: "Executor", required: true, description: "Ex: <matrExecutor>" }
    ]
  },
  {
    id: 3,
    name: "Geração de LISTA TRANS_HOSTS",
    script: "/usr/local/bin/P.GEN.LST.010.SH",
    description: "Gera a lista de arquivos que serão transferidos. O próximo job DEVE ser o Tipo 10.",
    parameters: [
      { flag: "-f", name: "Arquivo de origem", required: true, description: "Nome do arquivo base para a transferência." },
      { flag: "-A", name: "Arquivo de lista a gerar", required: true, description: "Nome da lista que será consumida pelo Job 10." },
      { flag: "-t", name: "Tipo de arquivo", required: false, description: "Especifica se é 'arq' ou 'meta'." },
      { flag: "-T", name: "Tipo de Operação", required: false, description: "TL (trans_hosts local) ou TR (trans_hosts remoto)." },
      { flag: "-e", name: "Código de retorno", required: false, description: "Código para ocorrência de arquivo vazio (Default: 31)." }
    ]
  },
  {
    id: 10,
    name: "Transferência de Arqs (GET e PUT)",
    script: "/usr/local/bin/P.GEN.THS.010.SH",
    description: "Executa a transferência baseada na lista gerada pelo Job 3. Depende da tabela de especificações (Servidor, Usuário, etc).",
    parameters: [
      { flag: "-a", name: "Arquivo da lista de processamento", required: true, description: "DEVE ser exatamente o mesmo nome gerado no parâmetro -A do Job 3." },
      { flag: "-A", name: "Lista dos arquivos efetivamente transferidos", required: false, description: "Usado no caso de put para o mainframe (legado)." }
    ]
  },
  {
    id: 9,
    name: "Execução de PROGRAMAS JAVA",
    script: "/usr/local/bin/P.GEN.JVM.010.SH",
    description: "Execução de rotinas e programas empacotados em Java (.jar).",
    parameters: [
      { flag: "-d", name: "Diretório do programa JAVA", required: true, description: "Caminho de residência do arquivo .jar." },
      { flag: "-p", name: "Programa JAVA", required: true, description: "Nome do arquivo executável (.jar)." },
      { flag: "-P", name: "Parâmetros do prog. JAVA", required: false, description: "Argumentos passados para a execução do programa." },
      { flag: "-j", name: "Arquivo de parâmetros da JVM", required: false, description: "Configurações específicas da máquina virtual Java." },
      { flag: "-D", name: "Diretório do arquivo de parâmetros da JVM", required: false, description: "Caminho de residência do arquivo de parâmetros da JVM." }
    ]
  }
];
