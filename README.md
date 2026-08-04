# JobsIA - Sistema de Geração Segura de Checklists e Validação de Normas

O **JobsIA** é uma aplicação corporativa projetada para automação, análise inteligente e validação de especificações de jobs corporativos. O sistema integra inteligência artificial para auxiliar na criação de checklists e análises técnicas detalhadas de conformidade normativa, em especial para a norma **N/PD/004/02**.

---

## 🛠️ Arquitetura do Sistema

A aplicação é construída sobre uma arquitetura moderna baseada em tecnologias consolidadas de mercado, garantindo portabilidade, facilidade de implantação local e desacoplamento de infraestruturas proprietárias:

```mermaid
graph TD
    A[Frontend: React + Vite + TypeScript] <-->|HTTPS / JSON + JWT| B[Backend: Express.js + tsx]
    B <-->|pg Pool / SQL| C[(Banco de Dados: PostgreSQL)]
    B <-->|REST API / Claude| D[LIA: OCI Dataprev AI Gateway]
```

- **Frontend**: Single Page Application (SPA) desenvolvida em **React 19**, **TypeScript** e empacotada com **Vite**, estilizada de forma nativa com **TailwindCSS**.
- **Backend**: API RESTful construída com **Node.js**, **Express.js** e **TypeScript (tsx)**.
- **Banco de Dados**: **PostgreSQL 14+** gerenciado diretamente por meio de um Pool de conexões do driver nativo `pg`, garantindo transações seguras e concorrentes sem dependência de serviços externos de autenticação gerenciada.
- **Serviço de Inteligência Artificial (LIA)**: Gateway de IA da Dataprev encapsulando modelos LLM (Claude-Sonnet) para prover chat conversacional, refino de prompts e geração assistida de checklists.

---

## 📋 Pré-requisitos de Instalação

Para executar a aplicação localmente, certifique-se de ter os seguintes componentes instalados:

1. **Node.js** (versão LTS recomendada: `v18.x` ou superior)
2. **npm** (versão `v9.x` ou superior)
3. **PostgreSQL** (versão `v14` ou superior) em execução local ou remota

---

## 🚀 Instalação e Inicialização Rápida

Siga os passos abaixo para configurar o ambiente do zero:

### 1. Clonar o repositório e instalar as dependências
```bash
# Instala as dependências compartilhadas do frontend e backend
npm install
```

### 2. Configurar as Variáveis de Ambiente
Copie o arquivo de exemplo `.env.example` para `.env` na raiz do projeto e ajuste os valores de acordo com a sua infraestrutura:
```bash
cp .env.example .env
```

Certifique-se de configurar as seguintes variáveis obrigatórias:
* `DATABASE_URL`: URL de conexão válida com o PostgreSQL.
* `JWT_SECRET`: Uma string complexa e segura de criptografia para os tokens.
* `VITE_API_URL`: Aponta para o endereço do servidor backend (`http://localhost:3001`).

### 3. Inicializar o Banco de Dados (Esquema e Migrações)
A inicialização e validação das tabelas do banco de dados é feita de maneira robusta. Você pode preparar o banco aplicando o script de testes que limpa, executa migrações sequenciais e valida toda a integridade do esquema:
```bash
# This command is destructive. It requires an explicit confirmation, a
# dedicated database whose name contains a test marker, and never falls back
# to the application database.
JOBSIA_ALLOW_DESTRUCTIVE_SCHEMA_TEST=1 DATABASE_URL_TEST=postgresql://test_user:test_password@localhost:5432/jobsia_test npm run test:schema
```

### 4. Executar a Aplicação
Abra dois terminais na raiz do projeto para rodar o backend e o frontend em paralelo:

**Terminal 1 (Backend - Express):**
```bash
npm run server
```
*O servidor de API será iniciado em `http://localhost:3001`.*

**Terminal 2 (Frontend - React/Vite):**
```bash
npm run dev
```
*O frontend estará disponível em `http://localhost:3000`.*

---

## 🗃️ Estrutura e Ordem das Migrations

O banco de dados do JobsIA é estruturado de forma incremental e idempotente. Os arquivos de migração residem no diretório `/migrations`.

### Opções de Inicialização:
1. **Incremental (Histórico de Deltas)**: Execução em ordem numérica dos arquivos `0001_...` até `0022_...` com `npm run build:server` seguido de `npm run migrate`. Cada arquivo adiciona as colunas, tabelas ou constraints de forma sequencial.
2. **Baseline (Setup Direto)**: Aplicação do arquivo `migrations/baseline_schema.sql`, que consolida o esquema final mais recente em uma única execução para acelerar o provisionamento de novos ambientes de teste ou produção do zero.

### Deploy seguro em producao

O deploy normal executa somente migrations numeradas e interrompe a migration
caso ela tente remover, recriar ou alterar a quantidade de registros de
`public.users`. O volume PostgreSQL tambem deve continuar sendo o mesmo.
Nao use `docker compose down -v`, `--volumes`, `docker volume prune`, nem
`npm run test:schema` em producao.

Com o banco ja em execucao, atualize apenas a API e o frontend; nao e preciso
executar `docker compose down`:

```bash
# Registre a quantidade atual e gere um dump antes de qualquer alteracao.
sudo docker compose exec -T db psql -U jobsia_user -d jobsia_prod -c 'SELECT COUNT(*) AS users_before FROM public.users;'
sudo docker compose exec -T db pg_dump -U jobsia_user -d jobsia_prod -Fc > "jobsia-$(date +%Y%m%d-%H%M%S).dump"

git pull --ff-only
sudo docker compose build --no-cache api web
sudo docker compose up -d --no-deps --force-recreate api
sudo docker compose logs --tail=100 api

# Execute somente depois de confirmar que as migrations terminaram com sucesso.
sudo docker compose up -d --no-deps --force-recreate web
sudo docker compose exec -T db psql -U jobsia_user -d jobsia_prod -c 'SELECT COUNT(*) AS users_after FROM public.users;'
```

Execute os comandos sempre no mesmo diretorio/projeto Compose que criou o
volume atual. Mudar `COMPOSE_PROJECT_NAME`, usar `-p` diferente ou trocar o
nome do volume pode fazer a aplicacao apontar para um banco novo e vazio.

### Ordem Crítica de Tabelas e Constraints:
1. `users` (Tabela base de credenciais)
2. `JobsIA_profiles` (Armazena perfis dos usuários conectados com FK `user_id` em cascata)
3. `JobsIA_types` & `JobsIA_parameters` (Configurações e parâmetros estruturais)
4. `JobsIA_conversations` & `JobsIA_messages` (Históricos de chats e interações)
5. `JobsIA_checklists` (Registros de checklists gerados com FK `user_id` e controle de integridade)
6. `JobsIA_norm_rules` & `JobsIA_dictionary_terms` (Base de normas e dicionários integrados para composição dinâmica de prompts)
7. `JobsIA_audit_logs` & `JobsIA_refresh_tokens` (Segurança, sessões ativas e trilha de auditoria para ações ADMIN)
8. `JobsIA_checklist_catalog_items`, `JobsIA_job_checklist_requirements` e `JobsIA_application_validation_rules` (catálogo e regras versionadas do checklist por Application)

### Checklist por Application (v2)

O schema v2 registra uma Application com um ou mais jobs ordenados, ponte, genérico, estratégia de servidores, agendamento único/data-hora/recorrência e dados CAPADOR documentais. O endpoint de finalização é `POST /api/checklists/application`.

Os genéricos, pontes e a regra corporativa de nomenclatura da Application não são presumidos pelo código. Após receber a fonte oficial DIOT, um ADMIN deve publicá-los por:

- `POST /api/checklist-catalog/import` para itens `GENERIC` e `BRIDGE`;
- `POST /api/checklist-catalog/application-rules/import` para regras de Application.

Enquanto o catálogo oficial estiver vazio, a seleção é registrada com aviso para conferência; após a publicação, opções fora do catálogo são bloqueadas.

---

## 🔐 Criação do Primeiro Usuário ADMIN

Para manter o fluxo de segurança robusto, a criação de contas pela rota `/signup` atribui por padrão o papel de `SOLICITANTE` a qualquer novo usuário. Para registrar o primeiro administrador da plataforma:

1. Acesse a tela de cadastro do sistema (`http://localhost:3000/signup` ou `/login` e clique em criar conta).
2. Cadastre uma nova conta utilizando seu e-mail e nome.
3. Conecte-se à sua instância de PostgreSQL via CLI ou gerenciador visual (como pgAdmin ou DBeaver) e execute a instrução SQL a seguir para promovê-lo a **ADMIN**:
   ```sql
   UPDATE users 
   SET role = 'ADMIN' 
   WHERE email = 'seu-email-cadastrado@dominio.com';
   ```
4. Faça logout e login novamente na aplicação. O seu perfil agora possuirá acesso irrestrito ao painel administrativo (como controle de parâmetros, dicionários e auditoria).

---

## 🔍 Troubleshooting e Healthchecks

### Healthcheck do Servidor
O backend fornece um endpoint simples de monitoramento para validar se o serviço está ativo e respondendo adequadamente:
- **URL**: `GET http://localhost:3001/api/health`
- **Retorno Esperado**: `{ "status": "ok" }`

### Problemas Comuns e Soluções:

- **Erro de CORS (Cross-Origin Resource Sharing)**:
  * *Sintoma*: O console do navegador indica que requisições ao backend foram bloqueadas.
  * *Solução*: Certifique-se de que a variável `CORS_ORIGIN` no seu arquivo `.env` do backend aponta exatamente para a URL de execução do frontend (ex.: `http://localhost:3000`).

- **Erro Crítico de Inicialização (Backend Encerrado)**:
  * *Sintoma*: O backend exibe `ERRO CRÍTICO DE INICIALIZAÇÃO: A variável de ambiente JWT_SECRET não está definida` e morre.
  * *Solução*: Adicione a variável `JWT_SECRET` com qualquer string longa no seu arquivo `.env` e reinicie o servidor.

- **Falha de Conexão com o Banco de Dados (`pg` connection error)**:
  * *Sintoma*: O backend não inicia ou gera timeouts nas chamadas da API.
  * *Solução*: Valide se a string de conexão em `DATABASE_URL` no `.env` está formatada corretamente com o usuário, senha e porta do PostgreSQL e se a porta externa está acessível.

---

## 📊 Matriz de Escopo e Não-Escopo

| Escopo (O que o JobsIA atende) | Não-Escopo (O que não é atendido) |
| :--- | :--- |
| **RBAC Nativo**: Papéis `ADMIN`, `OPERADOR` e `SOLICITANTE` com controle de permissão e middlewares de segurança no backend. | **SSO / Provedores Externos**: Integração nativa com Auth0, Google, Okta ou provedores externos de identidade corporativa. |
| **Geração de Checklists e PDF**: Criação dinâmica de relatórios estruturados e geração de PDF fiel aos padrões definidos. | **Persistência de PDFs no Servidor**: Os relatórios e PDFs gerados são consumidos e baixados em tempo de execução no cliente, sem armazenamento físico em disco no backend. |
| **Motor de Validação N/PD/004/02**: Validador determinístico direto no backend testando regras estruturais de nomenclaturas e consistência de parâmetros. | **Processamento Assíncrono / Filas**: Execuções paralelas ou processamentos em lote fora do ciclo HTTP tradicional do Express (sem Redis/RabbitMQ). |
| **Auditoria e Logs**: Registro detalhado e imutável de ações sensíveis (`JobsIA_audit_logs`) com IP, usuário e payload. | **Automação de Infraestrutura (DevOps)**: Provisionamento automatizado de servidores, pipelines avançados de CI/CD ou orquestração complexa de Kubernetes. |

---

## 📝 ADRs (Architecture Decision Records)

### ADR 001 - Migração para Autenticação Própria (Custom Auth)
- **Status**: Aprovado
- **Contexto**: A aplicação anteriormente utilizava uma infraestrutura externa e acoplada em nuvem para controle de usuários e JWTs. Isso gerava um forte acoplamento com plataformas de terceiros, dificultando deploys corporativos internos na Dataprev e isolamentos de rede de infraestrutura própria.
- **Decisão**: Removeu-se completamente a dependência de serviços de autenticação externos. A autenticação foi reimplementada no Express usando JWTs assinados localmente, expiração robusta, armazenamento seguro de hashes de senha com `bcryptjs`, e controle de sessões persistentes com `refresh_tokens` gravados diretamente em tabela local do PostgreSQL.
- **Consequências**: Independência total de fornecedores de nuvem pública, facilidade em executar o projeto do zero localmente em qualquer ambiente Docker/PostgreSQL padrão, controle total sobre o ciclo de expiração dos tokens e garantia de isolamento.

### ADR 002 - Motor de Validação Determinístico para a Norma N/PD/004/02
- **Status**: Aprovado
- **Contexto**: Validar as regras de nomenclatura de jobs e parâmetros é crítico e não deve depender apenas da interpretação subjetiva de uma LLM, que pode sofrer alucinações.
- **Decisão**: Implementação de um motor híbrido. O backend realiza a validação determinística rígida baseada em regras via código TypeScript estruturado, enquanto a IA atua de forma consultiva no chat. A verificação do padrão `N/PD/004/02` é acionada de forma síncrona antes que qualquer checklist seja salvo ou PDF gerado.
- **Consequências**: Consistência absoluta dos dados gerados, redução a zero das falhas de nomenclatura não identificadas e rastreabilidade total de conformidade.

### ADR 003 - Gerenciamento Dinâmico de Dicionários e Normas
- **Status**: Aprovado
- **Contexto**: As regras normativas e termos aceitos mudam periodicamente, exigindo flexibilidade sem a necessidade de reescrever código ou redeployar o backend.
- **Decisão**: Integração de normas e dicionários em tabelas dedicadas (`JobsIA_norm_rules` e `JobsIA_dictionary_terms`). Apenas normas publicadas e revisadas por um perfil `ADMIN` são injetadas ativamente no prompt de contexto enviado à API da LIA. O backend implementa invalidação de cache local e controle de versão das regras normativas.
- **Consequências**: Flexibilidade operacional, auditoria de quem modificou/publicou regras e mitigação de overhead de rede devido ao cache inteligente.
