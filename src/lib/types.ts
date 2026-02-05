export interface MetricSource {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  format: 'json' | 'text' | 'html' | 'xml';
  selector?: string; // jsonpath or xpath or regex
}

export interface MetricDefinition {
  id: string;
  title: string;
  description: string;
  type: 'numeric' | 'text';
  unit?: {
    source: string;
    output: string;
  };
  source: {
    primary: MetricSource;
    archived?: MetricSource;
    fallback: {
      value: string | number;
      as_of: string;
    };
  };
  normalization?: {
    language: 'javascript';
    function: string; // "return value * 2;"
  };
  display: {
    section?: string;
    order?: number;
    footnotes?: string[];
  };
}

export interface MetricResult {
  metricId: string;
  value: string | number;
  rawRequestHash: string; // for verifying nothing changed
  sourceUsed: 'primary' | 'archived' | 'fallback';
  fetchedAt: string;
  status: 'success' | 'error' | 'stale';
  error?: string;
  meta?: {
    title: string;
    description: string;
    url: string;
    methodUsed: string;
  };
}

export interface RegistryIndex {
  metrics: string[]; // list of metric IDs (filenames)
  version: string;
}
