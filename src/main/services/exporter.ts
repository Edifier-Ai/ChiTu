import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { finished } from 'stream/promises';
import { CrawledItem, EmployeeAccountResult, ExportFormat, ExportResult } from '../../shared/types';

const EXPORT_HEADERS = [
  'id',
  'platform',
  'keyword',
  'author',
  'timestamp',
  'url',
  'content',
  'comment_count',
  'comments',
] as const;

type ExportHeader = (typeof EXPORT_HEADERS)[number];

const ACCOUNT_EXPORT_HEADERS = [
  'rank',
  'platform_name',
  'account_name',
  'suspected_employee_name',
  'user_id',
  'followers_count',
  'followers_text',
  'confidence_level',
  'confidence_score',
  'profile_url',
  'evidence',
  'matched_post_count',
  'latest_active_at',
  'source_keywords',
  'collected_at',
  'raw_bio',
  'raw_verified_reason',
] as const;

type AccountExportHeader = (typeof ACCOUNT_EXPORT_HEADERS)[number];

export function sanitizeSegment(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'export';
}

function buildBaseName(items: CrawledItem[]) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
  const first = items[0];
  if (!first) {
    return `chitu_export_${timestamp}`;
  }
  return `${sanitizeSegment(first.platform)}_${sanitizeSegment(first.keyword)}_${timestamp}`;
}

function buildAccountBaseName(companyName: string, items: EmployeeAccountResult[]) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
  const normalizedCompany = sanitizeSegment(companyName || '员工账号识别');
  const topCount = items.length > 0 ? `TOP${items.length}` : 'TOP';
  return `${normalizedCompany}_员工账号识别_${topCount}_${timestamp}`;
}

function toCellValue(item: CrawledItem, key: ExportHeader) {
  if (key === 'comment_count') {
    return String(item.comments?.length || 0);
  }
  const value = item[key];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value == null ? '' : String(value);
}

function toAccountCellValue(item: EmployeeAccountResult, key: AccountExportHeader) {
  if (key === 'platform_name') return item.platformName;
  if (key === 'account_name') return item.accountName;
  if (key === 'suspected_employee_name') return item.suspectedEmployeeName;
  if (key === 'user_id') return item.userId;
  if (key === 'followers_count') return item.followersCount == null ? '' : String(item.followersCount);
  if (key === 'followers_text') return item.followersText;
  if (key === 'confidence_level') return item.confidenceLevel;
  if (key === 'confidence_score') return String(item.confidenceScore);
  if (key === 'profile_url') return item.profileUrl;
  if (key === 'evidence') return item.evidence.join('；');
  if (key === 'matched_post_count') return String(item.matchedPostCount);
  if (key === 'latest_active_at') return item.latestActiveAt;
  if (key === 'source_keywords') return item.sourceKeywords.join('、');
  if (key === 'collected_at') return item.collectedAt;
  if (key === 'raw_bio') return item.rawBio || '';
  if (key === 'raw_verified_reason') return item.rawVerifiedReason || '';
  if (key === 'rank') return String(item.rank);
  return '';
}

export function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toColumnName(index: number) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function createSheetXml(data: CrawledItem[]) {
  const rows = [EXPORT_HEADERS.map((header) => String(header)), ...data.map((item) => EXPORT_HEADERS.map((key) => toCellValue(item, key)))];

  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, cellIndex) => {
          const ref = `${toColumnName(cellIndex)}${rowIndex + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

function createAccountSheetXml(data: EmployeeAccountResult[]) {
  const rows = [
    ACCOUNT_EXPORT_HEADERS.map((header) => String(header)),
    ...data.map((item) => ACCOUNT_EXPORT_HEADERS.map((key) => toAccountCellValue(item, key))),
  ];

  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, cellIndex) => {
          const ref = `${toColumnName(cellIndex)}${rowIndex + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

async function writeXlsx(outFile: string, data: CrawledItem[]) {
  const output = fs.createWriteStream(outFile);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);

  archive.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    { name: '[Content_Types].xml' }
  );
  archive.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    { name: '_rels/.rels' }
  );
  archive.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="data" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    { name: 'xl/workbook.xml' }
  );
  archive.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    { name: 'xl/_rels/workbook.xml.rels' }
  );
  archive.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1">
    <font><sz val="11"/><name val="Arial"/></font>
  </fonts>
  <fills count="1">
    <fill><patternFill patternType="none"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`,
    { name: 'xl/styles.xml' }
  );
  archive.append(createSheetXml(data), { name: 'xl/worksheets/sheet1.xml' });
  archive.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>ChiTu</dc:creator>
  <cp:lastModifiedBy>ChiTu</cp:lastModifiedBy>
</cp:coreProperties>`,
    { name: 'docProps/core.xml' }
  );
  archive.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>ChiTu</Application>
</Properties>`,
    { name: 'docProps/app.xml' }
  );

  await archive.finalize();
  await finished(output);
}

async function writeAccountXlsx(outFile: string, data: EmployeeAccountResult[]) {
  const output = fs.createWriteStream(outFile);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);

  archive.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    { name: '[Content_Types].xml' }
  );
  archive.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    { name: '_rels/.rels' }
  );
  archive.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="accounts" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    { name: 'xl/workbook.xml' }
  );
  archive.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    { name: 'xl/_rels/workbook.xml.rels' }
  );
  archive.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1">
    <font><sz val="11"/><name val="Arial"/></font>
  </fonts>
  <fills count="1">
    <fill><patternFill patternType="none"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`,
    { name: 'xl/styles.xml' }
  );
  archive.append(createAccountSheetXml(data), { name: 'xl/worksheets/sheet1.xml' });
  archive.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>ChiTu</dc:creator>
  <cp:lastModifiedBy>ChiTu</cp:lastModifiedBy>
</cp:coreProperties>`,
    { name: 'docProps/core.xml' }
  );
  archive.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>ChiTu</Application>
</Properties>`,
    { name: 'docProps/app.xml' }
  );

  await archive.finalize();
  await finished(output);
}

async function writeFile(outFile: string, format: ExportFormat, data: CrawledItem[]) {
  if (format === 'csv') {
    const rows = [
      EXPORT_HEADERS.join(','),
      ...data.map((item) => EXPORT_HEADERS.map((key) => escapeCsv(toCellValue(item, key))).join(',')),
    ];
    await fs.promises.writeFile(outFile, `\uFEFF${rows.join('\n')}`, 'utf-8');
    return;
  }

  if (format === 'excel') {
    await writeXlsx(outFile, data);
    return;
  }

  const content = data.map((item) => JSON.stringify(item)).join('\n');
  await fs.promises.writeFile(outFile, content, 'utf-8');
}

async function writeAccountFile(outFile: string, format: ExportFormat, data: EmployeeAccountResult[]) {
  if (format === 'csv') {
    const rows = [
      ACCOUNT_EXPORT_HEADERS.join(','),
      ...data.map((item) => ACCOUNT_EXPORT_HEADERS.map((key) => escapeCsv(toAccountCellValue(item, key))).join(',')),
    ];
    await fs.promises.writeFile(outFile, `\uFEFF${rows.join('\n')}`, 'utf-8');
    return;
  }

  if (format === 'excel') {
    await writeAccountXlsx(outFile, data);
    return;
  }

  const content = data.map((item) => JSON.stringify(item)).join('\n');
  await fs.promises.writeFile(outFile, content, 'utf-8');
}

export async function exportCrawledData(data: CrawledItem[], outputDir: string, exportFormat: ExportFormat): Promise<ExportResult> {
  if (!outputDir) {
    return { success: false, error: '请选择数据保存目录' };
  }
  if (data.length === 0) {
    return { success: false, error: '暂无可导出的数据' };
  }

  try {
    await fs.promises.mkdir(outputDir, { recursive: true });
    const extension = exportFormat === 'excel' ? 'xlsx' : exportFormat;
    const outFile = path.join(outputDir, `${buildBaseName(data)}.${extension}`);
    await writeFile(outFile, exportFormat, data);
    return { success: true, filePath: outFile, itemCount: data.length, format: exportFormat };
  } catch (error) {
    const message = error instanceof Error ? error.message : '导出失败';
    return { success: false, error: message };
  }
}

export async function exportAccountIdentificationData(
  data: EmployeeAccountResult[],
  outputDir: string,
  exportFormat: ExportFormat,
  companyName: string
): Promise<ExportResult> {
  if (!outputDir) {
    return { success: false, error: '请选择数据保存目录' };
  }
  if (data.length === 0) {
    return { success: false, error: '暂无可导出的账号数据' };
  }

  try {
    await fs.promises.mkdir(outputDir, { recursive: true });
    const extension = exportFormat === 'excel' ? 'xlsx' : exportFormat;
    const outFile = path.join(outputDir, `${buildAccountBaseName(companyName, data)}.${extension}`);
    await writeAccountFile(outFile, exportFormat, data);
    return { success: true, filePath: outFile, itemCount: data.length, format: exportFormat };
  } catch (error) {
    const message = error instanceof Error ? error.message : '导出失败';
    return { success: false, error: message };
  }
}
