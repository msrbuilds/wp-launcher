/**
 * Maps file extensions to language identifiers.
 * Used by editors that don't provide built-in language detection (Sublime Text, etc.).
 * VS Code and JetBrains provide their own language IDs natively.
 */
const EXTENSION_MAP: Record<string, string> = {
  // JavaScript / TypeScript
  '.js': 'javascript', '.jsx': 'javascriptreact', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescriptreact', '.mts': 'typescript', '.cts': 'typescript',

  // Web
  '.html': 'html', '.htm': 'html', '.css': 'css', '.scss': 'scss', '.sass': 'sass',
  '.less': 'less', '.svg': 'svg', '.vue': 'vue', '.svelte': 'svelte',

  // PHP
  '.php': 'php', '.phtml': 'php', '.inc': 'php',

  // Python
  '.py': 'python', '.pyw': 'python', '.pyi': 'python',

  // Java / Kotlin / JVM
  '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin', '.groovy': 'groovy',
  '.scala': 'scala', '.clj': 'clojure',

  // C / C++ / C#
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp',
  '.hpp': 'cpp', '.hh': 'cpp', '.cs': 'csharp',

  // Go / Rust / Swift
  '.go': 'go', '.rs': 'rust', '.swift': 'swift',

  // Ruby / Perl
  '.rb': 'ruby', '.erb': 'ruby', '.pl': 'perl', '.pm': 'perl',

  // Shell
  '.sh': 'shellscript', '.bash': 'shellscript', '.zsh': 'shellscript',
  '.fish': 'shellscript', '.bat': 'bat', '.cmd': 'bat', '.ps1': 'powershell',

  // Data / Config
  '.json': 'json', '.jsonc': 'jsonc', '.json5': 'json5',
  '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.ini': 'ini',
  '.xml': 'xml', '.xsl': 'xml', '.csv': 'csv',

  // Markup / Docs
  '.md': 'markdown', '.mdx': 'mdx', '.rst': 'restructuredtext',
  '.tex': 'latex', '.txt': 'plaintext',

  // Database
  '.sql': 'sql', '.prisma': 'prisma', '.graphql': 'graphql', '.gql': 'graphql',

  // Docker / DevOps
  '.dockerfile': 'dockerfile', '.tf': 'terraform', '.hcl': 'hcl',
  '.nginx': 'nginx', '.conf': 'conf',

  // Other
  '.r': 'r', '.R': 'r', '.lua': 'lua', '.dart': 'dart', '.ex': 'elixir',
  '.exs': 'elixir', '.erl': 'erlang', '.hs': 'haskell', '.vim': 'viml',
  '.wasm': 'wasm', '.zig': 'zig',
};

/** Special filenames that map to a language */
const FILENAME_MAP: Record<string, string> = {
  'Dockerfile': 'dockerfile',
  'Makefile': 'makefile',
  'Jenkinsfile': 'groovy',
  'Vagrantfile': 'ruby',
  'Gemfile': 'ruby',
  'Rakefile': 'ruby',
  '.gitignore': 'ignore',
  '.dockerignore': 'ignore',
  '.env': 'dotenv',
  '.editorconfig': 'editorconfig',
};

import * as path from 'path';

export function getLanguageFromFilePath(filePath: string): string {
  const basename = path.basename(filePath);

  // Check exact filename match first
  if (FILENAME_MAP[basename]) {
    return FILENAME_MAP[basename];
  }

  // Check file extension
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] || 'plaintext';
}
