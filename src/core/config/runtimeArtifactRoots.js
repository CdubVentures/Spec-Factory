import path from 'node:path';

// WHY: Runtime artifacts live under .workspace/ in the project root.
// This is project-relative, visible, and git-ignored.
export function defaultLocalOutputRoot() {
  return path.resolve('.workspace', 'output');
}

export function defaultIndexLabRoot() {
  return path.resolve('.workspace', 'runs');
}
