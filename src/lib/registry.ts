import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { MetricDefinition, RegistryIndex } from './types';

const REGISTRY_PATH = path.join(process.cwd(), 'src/registry');

export async function getRegistryIndex(): Promise<RegistryIndex> {
    const fileContents = fs.readFileSync(path.join(REGISTRY_PATH, 'index.yaml'), 'utf8');
    return yaml.load(fileContents) as RegistryIndex;
}

export async function getMetricDefinition(id: string): Promise<MetricDefinition | null> {
    try {
        const filePath = path.join(REGISTRY_PATH, 'metrics', `${id}.yaml`);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const fileContents = fs.readFileSync(filePath, 'utf8');
        const metric = yaml.load(fileContents) as MetricDefinition;
        // Ensure ID matches filename
        if (metric.id !== id) {
            console.warn(`Metric ID mismatch: file ${id}.yaml contains id ${metric.id}`);
        }
        return metric;
    } catch (error) {
        console.error(`Error loading metric ${id}:`, error);
        return null;
    }
}

export async function getAllMetrics(): Promise<MetricDefinition[]> {
    const index = await getRegistryIndex();
    const metrics = await Promise.all(index.metrics.map(id => getMetricDefinition(id)));
    return metrics.filter((m): m is MetricDefinition => m !== null);
}
