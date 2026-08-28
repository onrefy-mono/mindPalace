export interface DocTable {
  headers: string[];
  rows: string[][];
}

export interface DocFaq {
  q: string;
  a: string;
}

export interface DocSection {
  title?: string;
  paragraphs?: string[];
  list?: string[];
  table?: DocTable;
  faq?: DocFaq[];
}

export interface DocArticle {
  id: string;
  title: string;
  description: string;
  sections: DocSection[];
}
