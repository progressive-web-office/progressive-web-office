/** Starter diagrams offered by the diagram dialog (DIAG-001). */
import type { MessageKey } from '../i18n';

export interface DiagramTemplate {
  id: string;
  label: MessageKey;
  source: string;
}

export const DIAGRAM_TEMPLATES: readonly DiagramTemplate[] = [
  {
    id: 'flowchart',
    label: 'diagram.template.flowchart',
    source: 'flowchart TD\n  A[Start] --> B{Decision?}\n  B -- Yes --> C[Do it]\n  B -- No --> D[Skip]\n  C --> E[End]\n  D --> E',
  },
  {
    id: 'sequence',
    label: 'diagram.template.sequence',
    source: 'sequenceDiagram\n  participant A as Alice\n  participant B as Bob\n  A->>B: Hello Bob\n  B-->>A: Hi Alice',
  },
  {
    id: 'class',
    label: 'diagram.template.class',
    source: 'classDiagram\n  class Document {\n    +String title\n    +save()\n  }\n  class Spreadsheet\n  Document <|-- Spreadsheet',
  },
  {
    id: 'state',
    label: 'diagram.template.state',
    source: 'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review\n  Review --> Published\n  Review --> Draft\n  Published --> [*]',
  },
  {
    id: 'er',
    label: 'diagram.template.er',
    source: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains',
  },
  {
    id: 'gantt',
    label: 'diagram.template.gantt',
    source: 'gantt\n  title Project\n  dateFormat YYYY-MM-DD\n  section Design\n    Specification :a1, 2026-01-05, 10d\n  section Build\n    Implementation :after a1, 20d',
  },
  {
    id: 'pie',
    label: 'diagram.template.pie',
    source: 'pie title Time spent\n  "Writing" : 45\n  "Review" : 30\n  "Meetings" : 25',
  },
  {
    id: 'mindmap',
    label: 'diagram.template.mindmap',
    source: 'mindmap\n  root((Office))\n    Documents\n    Spreadsheets\n    Presentations',
  },
];
