const ExcelJS = require('exceljs');

/**
 * Utility helper to generate styled Excel (.xlsx) files as Buffer
 */
async function generateExcelWorkbook({ sheetName = 'Report', columns, data }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Restaurant POS System';
  workbook.lastModifiedBy = 'Restaurant POS System';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName);

  // Set columns header
  worksheet.columns = columns.map(col => ({
    header: col.header,
    key: col.key,
    width: col.width || 18
  }));

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1E293B' } // Dark slate header
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  // Add data rows
  data.forEach((item, index) => {
    const row = worksheet.addRow(item);
    row.height = 20;
    row.alignment = { vertical: 'middle' };
    
    // Zebra striping
    if (index % 2 === 1) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'F8FAFC' }
      };
    }
  });

  // Auto-fit column widths based on content
  worksheet.columns.forEach(column => {
    let maxLen = column.header ? column.header.toString().length : 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const valStr = cell.value !== undefined && cell.value !== null ? cell.value.toString() : '';
      if (valStr.length > maxLen) {
        maxLen = valStr.length;
      }
    });
    column.width = Math.min(Math.max(maxLen + 4, 12), 45);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

module.exports = {
  generateExcelWorkbook
};
