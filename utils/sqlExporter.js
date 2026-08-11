const mysql = require('mysql2/promise');

/**
 * Converts a database export object into a series of SQL INSERT statements.
 * @param {Object} data - The exported database object.
 * @returns {string} - A string containing SQL INSERT statements.
 */
function generateSqlDump(data) {
    let sql = '-- AssetFlow Database Dump\n\n';

    for (const [tableName, rows] of Object.entries(data)) {
        if (!Array.isArray(rows) || rows.length === 0) continue;

        sql += `-- Dumping data for table ${tableName}\n`;
        sql += `INSERT INTO ${tableName} (${Object.keys(rows[0]).join(', ')}) VALUES\n`;
        
        const values = rows.map(row => {
            const rowValues = Object.values(row).map(value => {
                if (value === null) return 'NULL';
                if (typeof value === 'boolean') return value ? 1 : 0;
                if (typeof value === 'object') return mysql.escape(JSON.stringify(value));
                return mysql.escape(value);
            });
            return `  (${rowValues.join(', ')})`;
        });

        sql += values.join(',\n') + ';\n\n';
    }

    return sql;
}

module.exports = generateSqlDump;
