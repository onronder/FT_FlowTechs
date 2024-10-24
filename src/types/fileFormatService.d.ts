declare module '../services/fileFormatService' {
    interface ConversionResult {
        path: string;
        format: 'csv' | 'json' | 'xml';
        size: number;
    }

    class FileFormatService {
        private tempDir: string;
        
        convertToCsv(data: any): Promise<ConversionResult>;
        convertToJson(data: any): Promise<ConversionResult>;
        convertToXml(data: any): Promise<ConversionResult>;
        cleanup(filePath: string): Promise<void>;
        private flattenData(data: any, prefix?: string): any[];
        private flattenObject(obj: any, prefix?: string): Record<string, any>;
    }

    const fileFormatService: FileFormatService;
    export = fileFormatService;
}