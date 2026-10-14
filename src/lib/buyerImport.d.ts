export function normalizeEmail(value: unknown): string;
export function parseBuyerText(text: string): Record<string, string>[];
export function describeColumns(columns: string[]): {source: string; destination: string | null}[];
export function parseGeography(text: string): any;
export function parsePurchaseCriteria(text: string): any;
export function parseBuyerRecord(raw: Record<string, unknown>, id?: string): any;
export function consolidateImportRows(rows: any[], existing?: any[]): any[];
