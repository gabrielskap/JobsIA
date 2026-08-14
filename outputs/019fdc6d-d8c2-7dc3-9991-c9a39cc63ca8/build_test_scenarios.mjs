import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const repo = "D:/DATAPrev/JobsIA_2.0/JobsIA";
const outDir = `${repo}/outputs/019fdc6d-d8c2-7dc3-9991-c9a39cc63ca8`;
const outFile = `${outDir}/Cenario_de_Testes_JobsIA.xlsx`;
const coverage = JSON.parse(await fs.readFile(`${repo}/coverage/coverage-summary.json`, "utf8"));
const pkg = JSON.parse(await fs.readFile(`${repo}/package.json`, "utf8"));

const colors = {
  navy: "#17365D", blue: "#2F75B5", lightBlue: "#D9EAF7", teal: "#0F6B78",
  green: "#70AD47", lightGreen: "#E2F0D9", amber: "#FFC000", lightAmber: "#FFF2CC",
  red: "#C00000", lightRed: "#FCE4D6", gray: "#E7E6E6", darkGray: "#595959", white: "#FFFFFF",
};

const unitFiles = [...pkg.scripts["test:unit"].matchAll(/(?:server|src)\/[\w./-]+\.test\.ts/g)].map(m => m[0].replaceAll("/", path.sep));
const unitSet = new Set(unitFiles.map(f => f.replaceAll("\\", "/")));
const testFiles = [];
async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (/\.test\.tsx?$/.test(entry.name)) testFiles.push(full);
  }
}
await walk(`${repo}/server/tests`);
await walk(`${repo}/src`);

const scenarios = [];
for (const file of testFiles.sort()) {
  const rel = path.relative(repo, file).replaceAll("\\", "/");
  const content = await fs.readFile(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/(?:\btest|\bit|\.test)\(\s*['\"]([^'\"]+)['\"]/);
    if (!match) continue;
    const inUnit = unitSet.has(rel);
    const skipped = inUnit && /Endpoint PDF -/.test(match[1]);
    scenarios.push({
      type: inUnit ? "Unitário" : "Integração",
      suite: rel,
      title: match[1],
      unitRun: inUnit ? "Sim" : "Não",
      result: inUnit ? (skipped ? "Ignorado (sem BD)" : "Aprovado") : "Não executado nesta auditoria",
    });
  }
}

const directMap = {
  "server/migrationSafety.ts": "server/tests/migrationSafety.test.ts",
  "server/routes/applicationChecklists.ts": "server/tests/critical_routes.unit.test.ts",
  "server/routes/checklistCatalog.ts": "server/tests/critical_routes.unit.test.ts",
  "server/routes/dictionary.ts": "server/tests/critical_routes.unit.test.ts",
  "server/routes/norms.ts": "server/tests/norms_applicability.unit.test.ts",
  "server/schemas/checklistSchema.ts": "server/tests/checklist_schema_v2.test.ts",
  "server/services/pdfService.ts": "server/tests/pdf-renderer.test.ts; server/tests/pdf.test.ts",
  "src/utils/commandBuilder.ts": "src/utils/commandBuilder.test.ts",
  "src/utils/validationPresentation.ts": "src/utils/validationPresentation.test.ts",
};
const indirectMap = {
  "server/app.ts": "server/tests/critical_routes.unit.test.ts",
  "server/db.ts": "carregado indiretamente pela aplicação",
  "server/middleware/auth.ts": "server/tests/critical_routes.unit.test.ts",
  "server/routes/ai.ts": "carregado ao importar server/app.ts",
  "server/routes/auth.ts": "carregado ao importar server/app.ts",
  "server/routes/checklists.ts": "server/tests/pdf.test.ts (2 casos ignorados sem BD)",
  "server/routes/interactions.ts": "carregado ao importar server/app.ts",
  "server/routes/jobs.ts": "carregado ao importar server/app.ts",
  "server/routes/systemPrompts.ts": "carregado ao importar server/app.ts",
  "server/routes/users.ts": "carregado ao importar server/app.ts",
  "server/routes/validation.ts": "carregado ao importar server/app.ts",
  "server/services/validationEngine.ts": "importado por rotas; lógica principal pouco exercitada",
};
const notApplicable = new Set(["src/vite-env.d.ts", "src/types/database.ts"]);
const criticalP0 = new Set([
  "server/routes/checklists.ts", "server/services/validationEngine.ts", "server/middleware/auth.ts",
  "server/routes/auth.ts", "server/routes/ai.ts", "src/lib/api.ts", "src/contexts/AuthContext.tsx",
  "src/components/ProtectedRoute.tsx", "src/utils/pdfGenerator.ts",
]);
const criticalP1 = new Set([
  "server/migrate.ts", "server/routes/users.ts", "server/routes/interactions.ts", "server/routes/jobs.ts",
  "server/routes/norms.ts", "server/routes/dictionary.ts", "server/routes/applicationChecklists.ts",
  "server/routes/checklistCatalog.ts", "src/components/AgentView.tsx", "src/pages/UsersPage.tsx",
]);
function layer(rel) {
  if (rel.startsWith("server/routes/")) return "Backend / Rotas";
  if (rel.startsWith("server/services/")) return "Backend / Serviços";
  if (rel.startsWith("server/middleware/")) return "Backend / Middleware";
  if (rel.startsWith("server/schemas/")) return "Backend / Schema";
  if (rel.startsWith("server/")) return "Backend / Infraestrutura";
  if (rel.startsWith("src/components/")) return "Frontend / Componentes";
  if (rel.startsWith("src/pages/")) return "Frontend / Páginas";
  if (rel.startsWith("src/services/")) return "Frontend / Serviços";
  if (rel.startsWith("src/utils/")) return "Frontend / Utilitários";
  if (rel.startsWith("src/contexts/")) return "Frontend / Contexto";
  if (rel.startsWith("src/lib/")) return "Frontend / Infraestrutura";
  return "Frontend / Base";
}
function priority(rel) {
  if (notApplicable.has(rel)) return "N/A";
  if (criticalP0.has(rel)) return "P0";
  if (criticalP1.has(rel)) return "P1";
  return rel.includes("components") || rel.includes("pages") ? "P2" : "P1";
}
const matrix = Object.entries(coverage)
  .filter(([key]) => key !== "total")
  .map(([full, m]) => {
    const rel = path.relative(repo, full).replaceAll("\\", "/");
    const status = notApplicable.has(rel) ? "Não aplicável" : m.lines.pct >= 80 ? "Coberto" : m.lines.pct > 0 ? "Parcial" : "Sem cobertura";
    const evidence = directMap[rel] || indirectMap[rel] || "Nenhum teste localizado";
    const direct = directMap[rel] ? "Sim" : indirectMap[rel] ? "Indireto" : notApplicable.has(rel) ? "N/A" : "Não";
    let note = "";
    if (notApplicable.has(rel)) note = "Arquivo declarativo; validar por compilação/type-check.";
    else if (status === "Sem cobertura") note = "Criar testes unitários ou de componente dedicados.";
    else if (status === "Parcial") note = "Cobertura insuficiente; ampliar caminhos felizes, erros e autorização.";
    else note = "Manter suíte e cobrir branches remanescentes.";
    return { rel, layer: layer(rel), priority: priority(rel), direct, evidence, ...m, status, note };
  });

const gaps = [
  ["P0","Backend / Rotas","server/routes/checklists.ts","GET /api/checklists","isolar dados por papel e impedir filtro de terceiro","JWTs de SOLICITANTE e OPERADOR; pool mockado","consultar com cada papel e filtro user_id","SOLICITANTE vê somente próprios registros; OPERADOR segue política","Unitário com supertest","server/tests/checklists.unit.test.ts"],
  ["P0","Backend / Rotas","server/routes/checklists.ts","POST /api/checklists","derivar user_id do JWT e ignorar valor do payload","usuário autenticado; validação mockada","enviar user_id de terceiro no corpo","persistência usa somente o usuário autenticado","Unitário com supertest","server/tests/checklists.unit.test.ts"],
  ["P0","Backend / Rotas","server/routes/checklists.ts","POST /api/checklists","tratar validação bloqueante e status final","motor mockado com erros bloqueantes","criar checklist inválido","retorna erro controlado e não confirma transação indevida","Unitário com supertest","server/tests/checklists.unit.test.ts"],
  ["P0","Backend / Rotas","server/routes/checklists.ts","GET /:id/pdf","autorizar proprietário e bloquear terceiro","BD/pool e pdfService mockados","baixar PDF próprio e de terceiro","200 para proprietário; 403/404 para terceiro","Unitário com mocks","server/tests/checklists.unit.test.ts"],
  ["P0","Backend / Serviços","server/services/validationEngine.ts","validateChecklist","sem regras publicadas","pool retorna catálogo vazio","validar payload mínimo","resultado previsível sem falso bloqueio; aviso explícito quando aplicável","Unitário","server/tests/validationEngine.unit.test.ts"],
  ["P0","Backend / Serviços","server/services/validationEngine.ts","validateChecklist","regras required, regex e dependência","regras mockadas por tipo","testar valor válido, ausente e incompatível","erros têm código, campo, severidade e mensagem corretos","Unitário parametrizado","server/tests/validationEngine.unit.test.ts"],
  ["P0","Backend / Serviços","server/services/validationEngine.ts","validateApplicationChecklist","múltiplos jobs e nomes duplicados","catálogo e regras mockados","validar aplicação com 2+ jobs","agrega erros com prefixo por job e preserva ordem","Unitário","server/tests/validationEngine.unit.test.ts"],
  ["P0","Backend / Middleware","server/middleware/auth.ts","requireAuth","token ausente, malformado, expirado e usuário inativo","JWT/pool mockados","executar middleware em cada condição","401 consistente; next somente para token e usuário válidos","Unitário","server/tests/authMiddleware.unit.test.ts"],
  ["P0","Backend / Middleware","server/middleware/auth.ts","requireRole / requireOwnership","matriz ADMIN, OPERADOR, SOLICITANTE e recurso alheio","requisições mockadas","variar papel e proprietário","403 para combinações proibidas; next para permitidas","Unitário parametrizado","server/tests/authMiddleware.unit.test.ts"],
  ["P0","Backend / Rotas","server/routes/auth.ts","POST /login","credenciais ausentes, senha inválida e usuário inativo","bcrypt/JWT/pool mockados","executar três falhas e um sucesso","401/400 sem revelar qual credencial falhou; tokens no sucesso","Unitário com supertest","server/tests/auth.unit.test.ts"],
  ["P0","Backend / Rotas","server/routes/auth.ts","POST /refresh e /logout","refresh expirado, revogado, reutilizado e logout","tokens/pool mockados","executar ciclo e tentativas de reuso","rotação/revogação consistente e transação encerrada","Unitário com supertest","server/tests/auth.unit.test.ts"],
  ["P0","Backend / Rotas","server/routes/ai.ts","POST /chat","sanitizar mensagens e tratar falha/timeout do provedor","cliente GenAI e pool mockados","enviar payload válido, inválido e falha externa","sem prompt injection estrutural; erro controlado; sem persistência parcial","Unitário","server/tests/ai.unit.test.ts"],
  ["P0","Backend / Rotas","server/routes/ai.ts","conversations/messages","garantir propriedade da conversa","dois usuários e pool mockado","listar/ler conversa própria e alheia","não vaza conteúdo entre usuários","Unitário com supertest","server/tests/ai.unit.test.ts"],
  ["P0","Frontend / Infraestrutura","src/lib/api.ts","request/refresh","401 dispara refresh uma vez e repete requisição","fetch e localStorage mockados","simular sucesso, refresh inválido e requisições concorrentes","token atualizado; logout em falha; sem loop de refresh","Unitário DOM","src/lib/api.test.ts"],
  ["P0","Frontend / Contexto","src/contexts/AuthContext.tsx","AuthProvider","hidratar sessão, login, logout e token inválido","api e storage mockados","renderizar provider e acionar operações","estado loading/user e navegação coerentes","Teste de componente","src/contexts/AuthContext.test.tsx"],
  ["P0","Frontend / Componentes","src/components/ProtectedRoute.tsx","ProtectedRoute","loading, autenticado e anônimo","AuthContext mockado","renderizar nos três estados","spinner/children/redirecionamento corretos","Teste de componente","src/components/ProtectedRoute.test.tsx"],
  ["P0","Frontend / Utilitários","src/utils/pdfGenerator.ts","downloadChecklistPDF","nome seguro, erro HTTP e fallback","fetch/URL/DOM mockados","baixar com nomes especiais e respostas 4xx/5xx","arquivo sanitizado; URL revogada; mensagem útil","Unitário DOM","src/utils/pdfGenerator.test.ts"],
  ["P1","Backend / Infraestrutura","server/migrate.ts","runner de migrations","ordenação, rollback e lock","cliente PG e arquivos mockados","simular sucesso e falha no meio","ordem numérica; rollback; não ameaça users","Unitário","server/tests/migrate.unit.test.ts"],
  ["P1","Backend / Rotas","server/routes/users.ts","GET/PUT users","RBAC, atualização parcial, conflito e rollback","ADMIN e pool mockado","listar e alterar usuário válido/inválido","validação, auditoria e transação corretas","Unitário com supertest","server/tests/users.unit.test.ts"],
  ["P1","Backend / Rotas","server/routes/interactions.ts","aggregations/feedback","papel, propriedade e payload inválido","JWT/pool mockados","variar papel, owner e nota","403/422 corretos; agregações não vazam dados","Unitário com supertest","server/tests/interactions.unit.test.ts"],
  ["P1","Backend / Rotas","server/routes/jobs.ts","CRUD e seed","validação de parâmetros, 404, conflito e rollback","ADMIN/pool mockado","criar/editar/excluir/seedar em sucesso e falha","transações atômicas e respostas consistentes","Unitário com supertest","server/tests/jobs.unit.test.ts"],
  ["P1","Backend / Rotas","server/routes/norms.ts","ciclo publicar/rollback","estado inválido, UUID inválido e ausência de versão","ADMIN/pool mockado","aprovar, publicar e reverter","transação e auditoria corretas; erros controlados","Unitário com supertest","server/tests/norms.unit.test.ts"],
  ["P1","Backend / Rotas","server/routes/dictionary.ts","CRUD/publicação","duplicidade, 404, publish/rollback e seed","ADMIN/pool mockado","executar caminhos positivos e negativos","sem estados parciais; validação consistente","Unitário com supertest","server/tests/dictionary.unit.test.ts"],
  ["P1","Backend / Rotas","server/routes/checklistCatalog.ts","importações","itens inválidos, duplicados e falha transacional","ADMIN/pool mockado","importar lote misto e lote válido","422 sem persistência parcial; sucesso auditado","Unitário com supertest","server/tests/checklistCatalog.unit.test.ts"],
  ["P1","Backend / Rotas","server/routes/applicationChecklists.ts","POST /","hidratação, comando e idempotência concorrente","pool/validationEngine mockados","criar payload multi-job e repetir chave","comandos ordenados; uma criação por chave; rollback em falha","Unitário com supertest","server/tests/applicationChecklists.unit.test.ts"],
  ["P1","Frontend / Serviços","src/services/checklistService.ts","métodos API","paths, verbos, corpo e propagação de erro","api mockada","chamar cada método com dados limite","contrato HTTP exato e erros preservados","Unitário","src/services/checklistService.test.ts"],
  ["P1","Frontend / Serviços","src/services/jobService.ts","CRUD jobs","serialização de parâmetros e erros","api mockada","listar/criar/alterar/excluir","payload e endpoints corretos","Unitário","src/services/jobService.test.ts"],
  ["P1","Frontend / Serviços","src/services/normService.ts","CRUD/publish/rollback","escopo de aplicabilidade e erros","api mockada","executar operações e payloads inválidos","contrato correto; erro não ocultado","Unitário","src/services/normService.test.ts"],
  ["P1","Frontend / Serviços","src/services/dictionaryService.ts","CRUD/publish/rollback","campos obrigatórios e erros","api mockada","executar métodos","paths e payloads corretos","Unitário","src/services/dictionaryService.test.ts"],
  ["P1","Frontend / Serviços","src/services/checklistCatalogService.ts","list/import","filtros e importação vazia","api mockada","listar por kind e importar","query/payload corretos","Unitário","src/services/checklistCatalogService.test.ts"],
  ["P1","Frontend / Páginas","src/pages/UsersPage.tsx","gestão de usuários","carregamento, edição, erro e permissão","serviço/Auth mockados","renderizar e editar","feedback visual; formulário validado; sem ação proibida","Teste de componente","src/pages/UsersPage.test.tsx"],
  ["P1","Frontend / Componentes","src/components/AgentView.tsx","chat e checklist","envio, erro, seleção de modelo e persistência","serviços mockados","executar jornadas críticas","estado e mensagens coerentes; sem duplicação","Teste de componente","src/components/AgentView.test.tsx"],
  ["P2","Frontend / Páginas","src/pages/LoginPage.tsx","login","sucesso, credencial inválida e loading","Auth mockado","preencher e submeter","navegação/erro e bloqueio de duplo envio","Teste de componente","src/pages/LoginPage.test.tsx"],
  ["P2","Frontend / Páginas","src/pages/SignupPage.tsx","cadastro","senhas divergentes, API falha e sucesso","Auth/api mockados","submeter variações","validação local e feedback corretos","Teste de componente","src/pages/SignupPage.test.tsx"],
  ["P2","Frontend / Componentes","src/components/HistoryView.tsx","histórico","vazio, carregamento, erro e seleção","serviço mockado","renderizar estados","mensagens e seleção corretas","Teste de componente","src/components/HistoryView.test.tsx"],
  ["P2","Frontend / Componentes","src/components/KnowledgeViews.tsx","dicionário/normas/jobs","permissões, filtros e erros CRUD","serviços/Auth mockados","variar papel e operações","ações disponíveis somente ao papel correto","Teste de componente","src/components/KnowledgeViews.test.tsx"],
];

const wb = Workbook.create();
wb.comments.setSelf({ displayName: "Diego Armond" });
const summary = wb.worksheets.add("Resumo");
const matrixSheet = wb.worksheets.add("Matriz Cobertura");
const existing = wb.worksheets.add("Cenarios Existentes");
const gapSheet = wb.worksheets.add("Lacunas Priorizadas");
const criteria = wb.worksheets.add("Criterios e Metodo");

function title(sheet, range, textValue, subtitleRange, subtitle) {
  sheet.getRange(range).merge();
  sheet.getRange(range).values = [[textValue]];
  sheet.getRange(range).format = { fill: colors.navy, font: { color: colors.white, bold: true, size: 18 }, verticalAlignment: "center" };
  sheet.getRange(range).format.rowHeight = 30;
  if (subtitleRange) {
    sheet.getRange(subtitleRange).merge();
    sheet.getRange(subtitleRange).values = [[subtitle]];
    sheet.getRange(subtitleRange).format = { fill: colors.lightBlue, font: { color: colors.darkGray, italic: true, size: 10 }, wrapText: true };
  }
  sheet.showGridLines = false;
}
function header(range) {
  range.format = { fill: colors.blue, font: { color: colors.white, bold: true }, wrapText: true, verticalAlignment: "center", borders: { preset: "outside", style: "thin", color: colors.navy } };
  range.format.rowHeight = 30;
}
function applyStatusCF(range) {
  range.conditionalFormats.add("containsText", { text: "Coberto", format: { fill: colors.lightGreen, font: { color: "#385723", bold: true } } });
  range.conditionalFormats.add("containsText", { text: "Parcial", format: { fill: colors.lightAmber, font: { color: "#7F6000", bold: true } } });
  range.conditionalFormats.add("containsText", { text: "Sem cobertura", format: { fill: colors.lightRed, font: { color: colors.red, bold: true } } });
  range.conditionalFormats.add("containsText", { text: "Não aplicável", format: { fill: colors.gray, font: { color: colors.darkGray } } });
}

// Resumo
title(summary, "A1:H2", "Cenário de Testes Unitários — JobsIA", "A3:H3", "Auditoria baseada na suíte npm run test:coverage executada em 07/08/2026 e no inventário de código/testes do repositório.");
summary.getRange("A5:H5").merge();
summary.getRange("A5:H5").values = [["CONCLUSÃO: NÃO EXISTEM TESTES UNITÁRIOS PARA TODOS OS MÓDULOS RELEVANTES. A suíte atual passou, porém a cobertura de linhas é 20,14% e 25 de 46 arquivos têm 0%."]];
summary.getRange("A5:H5").format = { fill: colors.lightRed, font: { color: colors.red, bold: true }, wrapText: true, verticalAlignment: "center", borders: { preset: "outside", style: "medium", color: colors.red } };
summary.getRange("A5:H5").format.rowHeight = 42;
const cards = [
  ["A7:B7","A8:B9","Cobertura de linhas",coverage.total.lines.pct / 100,"0.00%",colors.lightAmber],
  ["C7:D7","C8:D9","Testes da suíte",47,"0",colors.lightGreen],
  ["E7:F7","E8:F9","Aprovados",45,"0",colors.lightGreen],
  ["G7:H7","G8:H9","Ignorados",2,"0",colors.lightAmber],
];
for (const [lr, vr, label, value, fmt, fill] of cards) {
  summary.getRange(lr).merge(); summary.getRange(lr).values = [[label]];
  summary.getRange(lr).format = { fill: colors.navy, font: { color: colors.white, bold: true }, horizontalAlignment: "center" };
  summary.getRange(vr).merge(); summary.getRange(vr).values = [[value]];
  summary.getRange(vr).format = { fill, font: { color: colors.navy, bold: true, size: 20 }, horizontalAlignment: "center", verticalAlignment: "center", numberFormat: fmt, borders: { preset: "outside", style: "thin", color: colors.navy } };
}
summary.getRange("A11:H11").merge(); summary.getRange("A11:H11").values = [["Indicadores de completude por arquivo"]]; header(summary.getRange("A11:H11"));
summary.getRange("A12:D16").values = [
  ["Indicador","Valor","Interpretação","Critério"],
  ["Arquivos inventariados",null,"Todo arquivo incluído por c8 --all","coverage-summary.json"],
  ["Cobertos (>=80% linhas)",null,"Boa cobertura de linhas; branches ainda exigem revisão",">=80%"],
  ["Parciais (>0% e <80%)",null,"Há execução, mas faltam caminhos relevantes","0% < cobertura < 80%"],
  ["Sem cobertura",null,"Nenhuma linha executada pela suíte unitária","0%"],
];
summary.getRange("B13").formulas = [["=COUNTA('Matriz Cobertura'!$B$7:$B$52)"]];
summary.getRange("B14").formulas = [["=COUNTIF('Matriz Cobertura'!$L$7:$L$52,\"Coberto\")"]];
summary.getRange("B15").formulas = [["=COUNTIF('Matriz Cobertura'!$L$7:$L$52,\"Parcial\")"]];
summary.getRange("B16").formulas = [["=COUNTIF('Matriz Cobertura'!$L$7:$L$52,\"Sem cobertura\")"]];
header(summary.getRange("A12:D12"));
summary.getRange("A13:D16").format = { borders: { preset: "inside", style: "thin", color: "#D9E2F3" }, wrapText: true };
summary.getRange("B13:B16").format.numberFormat = "0";
summary.getRange("A18:H18").merge(); summary.getRange("A18:H18").values = [["Principais riscos identificados"]]; header(summary.getRange("A18:H18"));
summary.getRange("A19:H23").values = [
  ["1","Backend crítico","checklists.ts tem 3,88% de linhas; fluxos de propriedade, persistência e PDF carecem de testes unitários efetivos.",null,null,null,null,null],
  ["2","Motor de validação","validationEngine.ts tem 16,73% de linhas e somente 30% de branches.",null,null,null,null,null],
  ["3","Autenticação/IA","auth.ts (rotas) tem 12,07% e ai.ts 21,71%; grande parte é apenas carregada indiretamente.",null,null,null,null,null],
  ["4","Frontend","A maioria de páginas, componentes, contexto e serviços está em 0%; não há infraestrutura declarada para testes React.",null,null,null,null,null],
  ["5","Falso conforto","O gate atual aceita 19% de linhas e não mede cobertura completa de integrações; aprovação da suíte não significa completude.",null,null,null,null,null],
];
for (let r = 19; r <= 23; r++) { summary.getRange(`C${r}:H${r}`).merge(); }
summary.getRange("A19:H23").format = { wrapText: true, verticalAlignment: "center", borders: { preset: "inside", style: "thin", color: "#D9E2F3" } };
summary.getRange("A19:A23").format = { fill: colors.lightRed, font: { color: colors.red, bold: true }, horizontalAlignment: "center" };
summary.getRange("A25:H25").merge(); summary.getRange("A25:H25").values = [["Recomendação: implementar primeiro as lacunas P0, elevar o gate gradualmente e separar cobertura unitária de integração. Os cenários propostos estão na aba “Lacunas Priorizadas”."]];
summary.getRange("A25:H25").format = { fill: colors.lightBlue, font: { color: colors.navy, bold: true }, wrapText: true, borders: { preset: "outside", style: "thin", color: colors.blue } };
summary.getRange("A25:H25").format.rowHeight = 34;
summary.getRange("J2:K5").values = [["Situação","Arquivos"],["Coberto",null],["Parcial",null],["Sem cobertura",null]];
summary.getRange("K3").formulas = [["=COUNTIF('Matriz Cobertura'!$L$7:$L$52,J3)"]]; summary.getRange("K3:K5").fillDown();
const chart = summary.charts.add("bar", summary.getRange("J2:K5")); chart.title = "Distribuição da cobertura por arquivo"; chart.hasLegend = false; chart.setPosition("J7", "P20");
summary.getRange("J2:K5").format = { font: { size: 9 }, numberFormat: "0" };
summary.freezePanes.freezeRows(3);
summary.getRange("A:H").format.columnWidth = 16;
summary.getRange("A:A").format.columnWidth = 25;
summary.getRange("B:B").format.columnWidth = 13;
summary.getRange("C:C").format.columnWidth = 38;
summary.getRange("D:D").format.columnWidth = 25;
summary.getRange("E:H").format.columnWidth = 15;

// Matriz
title(matrixSheet, "A1:M2", "Matriz de Cobertura por Arquivo", "A3:M3", "Cobertura de linha não prova qualidade isoladamente; a coluna de evidência distingue teste direto de mero carregamento indireto.");
const mHeaders = ["ID","Arquivo","Camada","Criticidade","Teste direto?","Evidência localizada","Linhas","Cobertas","Cob. linhas","Cob. branches","Cob. funções","Situação","Observação / ação"];
matrixSheet.getRange("A6:M6").values = [mHeaders]; header(matrixSheet.getRange("A6:M6"));
const mRows = matrix.map((m, i) => [i+1,m.rel,m.layer,m.priority,m.direct,m.evidence,m.lines.total,m.lines.covered,m.lines.pct/100,m.branches.pct/100,m.functions.pct/100,m.status,m.note]);
matrixSheet.getRange(`A7:M${6+mRows.length}`).values = mRows;
matrixSheet.tables.add(`A6:M${6+mRows.length}`, true, "MatrizCoberturaTable").style = "TableStyleMedium2";
matrixSheet.getRange(`G7:H${6+mRows.length}`).format.numberFormat = "0";
matrixSheet.getRange(`I7:K${6+mRows.length}`).format.numberFormat = "0.00%";
matrixSheet.getRange(`B7:F${6+mRows.length}`).format.wrapText = true; matrixSheet.getRange(`M7:M${6+mRows.length}`).format.wrapText = true;
applyStatusCF(matrixSheet.getRange(`L7:L${6+mRows.length}`));
matrixSheet.getRange(`D7:D${6+mRows.length}`).conditionalFormats.add("containsText", { text: "P0", format: { fill: colors.lightRed, font: { color: colors.red, bold: true } } });
matrixSheet.getRange(`D7:D${6+mRows.length}`).conditionalFormats.add("containsText", { text: "P1", format: { fill: colors.lightAmber, font: { color: "#7F6000", bold: true } } });
matrixSheet.freezePanes.freezeRows(6); matrixSheet.freezePanes.freezeColumns(2);
const mw = [6,38,23,11,12,42,9,9,12,13,12,16,43]; mw.forEach((w,i)=>matrixSheet.getRangeByIndexes(0,i,1,1).format.columnWidth=w);

// Cenários existentes
title(existing, "A1:F2", "Cenários de Teste Localizados", "A3:F3", "A aba inclui testes unitários e de integração presentes no repositório. Apenas os arquivos listados em test:unit foram executados nesta auditoria.");
const eHeaders = ["ID","Tipo","Arquivo de teste","Cenário","Na suíte unitária?","Resultado nesta auditoria"];
existing.getRange("A6:F6").values=[eHeaders]; header(existing.getRange("A6:F6"));
const eRows = scenarios.map((s,i)=>[i+1,s.type,s.suite,s.title,s.unitRun,s.result]);
existing.getRange(`A7:F${6+eRows.length}`).values=eRows;
existing.tables.add(`A6:F${6+eRows.length}`,true,"CenariosExistentesTable").style="TableStyleMedium2";
existing.getRange(`B7:F${6+eRows.length}`).format.wrapText=true;
existing.getRange(`F7:F${6+eRows.length}`).conditionalFormats.add("containsText", {text:"Aprovado",format:{fill:colors.lightGreen,font:{color:"#385723",bold:true}}});
existing.getRange(`F7:F${6+eRows.length}`).conditionalFormats.add("containsText", {text:"Ignorado",format:{fill:colors.lightAmber,font:{color:"#7F6000",bold:true}}});
existing.getRange(`F7:F${6+eRows.length}`).conditionalFormats.add("containsText", {text:"Não executado",format:{fill:colors.gray,font:{color:colors.darkGray}}});
existing.freezePanes.freezeRows(6); existing.freezePanes.freezeColumns(3);
[6,13,42,64,16,27].forEach((w,i)=>existing.getRangeByIndexes(0,i,1,1).format.columnWidth=w);

// Lacunas
title(gapSheet,"A1:L2","Lacunas e Cenários Priorizados","A3:L3","Backlog proposto para completar a cobertura de risco. Status e responsável são editáveis; use filtros para planejar sprints.");
const gHeaders=["ID","Prioridade","Camada","Módulo","Função / rota","Cenário","Pré-condições / mocks","Passos / entrada","Resultado esperado","Tipo sugerido","Arquivo sugerido","Status"];
gapSheet.getRange("A6:L6").values=[gHeaders]; header(gapSheet.getRange("A6:L6"));
const gRows=gaps.map((g,i)=>[`CT-${String(i+1).padStart(3,"0")}`,...g,"Pendente"]);
gapSheet.getRange(`A7:L${6+gRows.length}`).values=gRows;
gapSheet.tables.add(`A6:L${6+gRows.length}`,true,"LacunasTestesTable").style="TableStyleMedium2";
gapSheet.getRange(`B7:L${6+gRows.length}`).format.wrapText=true;
gapSheet.getRange(`B7:B${6+gRows.length}`).conditionalFormats.add("containsText",{text:"P0",format:{fill:colors.lightRed,font:{color:colors.red,bold:true}}});
gapSheet.getRange(`B7:B${6+gRows.length}`).conditionalFormats.add("containsText",{text:"P1",format:{fill:colors.lightAmber,font:{color:"#7F6000",bold:true}}});
gapSheet.getRange(`B7:B${6+gRows.length}`).conditionalFormats.add("containsText",{text:"P2",format:{fill:colors.lightBlue,font:{color:colors.navy}}});
gapSheet.getRange(`L7:L${6+gRows.length}`).dataValidation={rule:{type:"list",values:["Pendente","Em andamento","Implementado","Bloqueado","Descartado"]}};
gapSheet.getRange(`L7:L${6+gRows.length}`).conditionalFormats.add("containsText",{text:"Implementado",format:{fill:colors.lightGreen,font:{color:"#385723",bold:true}}});
gapSheet.getRange(`L7:L${6+gRows.length}`).conditionalFormats.add("containsText",{text:"Bloqueado",format:{fill:colors.lightRed,font:{color:colors.red,bold:true}}});
gapSheet.freezePanes.freezeRows(6); gapSheet.freezePanes.freezeColumns(4);
[11,11,22,35,24,42,35,40,44,20,40,16].forEach((w,i)=>gapSheet.getRangeByIndexes(0,i,1,1).format.columnWidth=w);

// Critérios
title(criteria,"A1:F2","Critérios, Escopo e Método","A3:F3","Registro auditável das regras usadas para interpretar cobertura e completude.");
criteria.getRange("A6:F6").values=[["Tema","Definição / evidência","Valor observado","Decisão","Fonte local","Observação"]]; header(criteria.getRange("A6:F6"));
const critRows=[
  ["Data da auditoria","Execução local no workspace","07/08/2026","Fotografia do estado atual","ambiente da tarefa","Pode mudar após novos commits"],
  ["Comando executado","Suíte com c8 e --all","npm run test:coverage","Fonte primária para métricas","package.json","45 aprovados, 2 ignorados, 0 falhas"],
  ["Cobertura total","Linhas executadas / linhas instrumentadas",coverage.total.lines.pct/100,"Insuficiente para declarar completude","coverage/coverage-summary.json","Gate configurado em apenas 19% de linhas"],
  ["Coberto","Arquivo com >=80% das linhas","6 arquivos","Ainda revisar branches e qualidade dos asserts","regra desta auditoria","Não equivale a 100% de requisitos"],
  ["Parcial","Arquivo entre >0% e <80%","15 arquivos","Requer ampliação","regra desta auditoria","Pode incluir mero carregamento indireto"],
  ["Sem cobertura","Arquivo com 0% de linhas","25 arquivos","Existe lacuna de teste","coverage/coverage-summary.json","Inclui 2 arquivos declarativos N/A"],
  ["Teste direto","Teste aponta ao comportamento do módulo","9 arquivos mapeados","Evidência mais forte","arquivos *.test.ts","Mapeamento conservador"],
  ["Teste indireto","Arquivo executado ao importar app/rota","vários módulos backend","Não prova comportamento funcional","c8 + inspeção de testes","Separado na Matriz"],
  ["Integração","Testes que dependem do runner/banco","presentes, não executados","Não contam como execução unitária desta auditoria","server/tests/*.test.ts","Executar em ambiente PostgreSQL isolado"],
  ["Completude","Todos os riscos/comportamentos relevantes têm teste automatizado","Não atendida","Conclusão: faltam testes unitários","Matriz + Lacunas","Cobertura é proxy, não prova total"],
  ["Escopo excluído","UI visual/E2E, segurança dinâmica e performance","não avaliados","Planejar trilhas separadas","metodologia","O Excel foca cenários unitários"],
];
criteria.getRange(`A7:F${6+critRows.length}`).values=critRows;
criteria.tables.add(`A6:F${6+critRows.length}`,true,"CriteriosTable").style="TableStyleMedium2";
criteria.getRange(`A7:F${6+critRows.length}`).format.wrapText=true;
criteria.getRange("C9").format.numberFormat="0.00%";
criteria.getRange("A20:F20").merge(); criteria.getRange("A20:F20").values=[["Próximo passo recomendado: implementar CT-001 a CT-017 (P0), adicionar ambiente de testes React, tornar os 2 testes de PDF não ignorados no CI e elevar o gate de cobertura por etapas."]];
criteria.getRange("A20:F20").format={fill:colors.lightBlue,font:{color:colors.navy,bold:true},wrapText:true,borders:{preset:"outside",style:"thin",color:colors.blue}};
criteria.getRange("A20:F20").format.rowHeight=42;
criteria.freezePanes.freezeRows(6);
[22,50,24,34,38,42].forEach((w,i)=>criteria.getRangeByIndexes(0,i,1,1).format.columnWidth=w);

// Global typography/alignment and row sizing
for (const sheet of [summary,matrixSheet,existing,gapSheet,criteria]) {
  const used=sheet.getUsedRange();
  used.format.font={name:"Aptos",size:10};
  used.format.verticalAlignment="top";
  used.format.autofitRows();
}
// Restore display font sizes after the global pass.
for (const sheet of [summary,matrixSheet,existing,gapSheet,criteria]) sheet.getRange("A1:Z2").format.font={name:"Aptos Display",size:18,bold:true,color:colors.white};

// Compact verification output before export.
const keyCheck = await wb.inspect({kind:"table",range:"Resumo!A11:D16",include:"values,formulas",tableMaxRows:6,tableMaxCols:4,maxChars:2500});
const errorCheck = await wb.inspect({kind:"match",searchTerm:"#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",options:{useRegex:true,maxResults:100},summary:"final formula error scan",maxChars:2500});
console.log(keyCheck.ndjson.slice(0,2500));
console.log(errorCheck.ndjson.slice(0,2500));

await fs.mkdir(outDir,{recursive:true});
for (const [sheetName,fileName] of [["Resumo","preview_resumo.png"],["Matriz Cobertura","preview_matriz.png"],["Cenarios Existentes","preview_existentes.png"],["Lacunas Priorizadas","preview_lacunas.png"],["Criterios e Metodo","preview_criterios.png"]]) {
  const blob=await wb.render({sheetName,autoCrop:"all",scale:0.8,format:"png"});
  await fs.writeFile(`${outDir}/${fileName}`,new Uint8Array(await blob.arrayBuffer()));
}
const xlsx=await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(outFile);
console.log(JSON.stringify({outFile,files:matrix.length,scenarios:scenarios.length,gaps:gaps.length}));
