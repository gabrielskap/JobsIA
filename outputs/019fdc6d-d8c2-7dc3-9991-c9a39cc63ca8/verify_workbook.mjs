import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const file = "D:/DATAPrev/JobsIA_2.0/JobsIA/outputs/019fdc6d-d8c2-7dc3-9991-c9a39cc63ca8/Cenario_de_Testes_JobsIA.xlsx";
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const sheets = await wb.inspect({ kind: "sheet", include: "id,name", maxChars: 2000 });
const key = await wb.inspect({ kind: "table", range: "Resumo!A11:D16", include: "values,formulas", tableMaxRows: 6, tableMaxCols: 4, maxChars: 2500 });
console.log(sheets.ndjson);
console.log(key.ndjson);
process.exitCode = 0;
