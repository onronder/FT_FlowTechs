const { Parser, transforms: { flatten } } = require('json2csv');
const xml2js = require('xml2js');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class FileFormatService {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
    }

    async convertToCsv(data) {
        try {
            // Handle nested data structures
            const flattenedData = this.flattenData(data);
            
            // Configure CSV Parser with proper options
            const parser = new Parser({
                transforms: [flatten()],
                includeEmptyRows: false
            });

            // Convert to CSV
            const csv = parser.parse(flattenedData);
            
            // Save to temp file
            const fileName = `${crypto.randomBytes(16).toString('hex')}.csv`;
            const filePath = path.join(this.tempDir, fileName);
            
            await fs.writeFile(filePath, csv);
            
            return {
                path: filePath,
                format: 'csv',
                size: csv.length
            };
        } catch (error) {
            throw new Error(`CSV conversion failed: ${error.message}`);
        }
    }

    async convertToJson(data) {
        try {
            const json = JSON.stringify(data, null, 2);
            
            const fileName = `${crypto.randomBytes(16).toString('hex')}.json`;
            const filePath = path.join(this.tempDir, fileName);
            
            await fs.writeFile(filePath, json);
            
            return {
                path: filePath,
                format: 'json',
                size: json.length
            };
        } catch (error) {
            throw new Error(`JSON conversion failed: ${error.message}`);
        }
    }

    async convertToXml(data) {
        try {
            const builder = new xml2js.Builder({
                rootName: 'data',
                headless: true,
                renderOpts: { pretty: true }
            });
            
            const xml = builder.buildObject(data);
            
            const fileName = `${crypto.randomBytes(16).toString('hex')}.xml`;
            const filePath = path.join(this.tempDir, fileName);
            
            await fs.writeFile(filePath, xml);
            
            return {
                path: filePath,
                format: 'xml',
                size: xml.length
            };
        } catch (error) {
            throw new Error(`XML conversion failed: ${error.message}`);
        }
    }

    flattenData(data, prefix = '') {
        const flattened = [];
        
        if (Array.isArray(data)) {
            data.forEach(item => {
                flattened.push(this.flattenObject(item));
            });
        } else {
            flattened.push(this.flattenObject(data));
        }
        
        return flattened;
    }

    flattenObject(obj, prefix = '') {
        const flattened = {};
        
        Object.keys(obj).forEach(key => {
            const value = obj[key];
            const newKey = prefix ? `${prefix}_${key}` : key;
            
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                Object.assign(flattened, this.flattenObject(value, newKey));
            } else if (Array.isArray(value)) {
                flattened[newKey] = value.join(', ');
            } else {
                flattened[newKey] = value;
            }
        });
        
        return flattened;
    }

    async cleanup(filePath) {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            console.error(`Failed to cleanup file ${filePath}:`, error);
        }
    }
}

module.exports = new FileFormatService();