// Tests : résout les imports relatifs sans extension du code TypeScript ("./types" -> "./types.ts"),
// comme le fait le compilateur de l'application. Aucune dépendance.
// L'alias "@/" (tsconfig : "@/*" -> "src/*") est résolu de la même façon.
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      const base = SRC + specifier.slice(2);
      for (const s of ['.ts', '.tsx', '/index.ts', '']) {
        try { return next(base + s, context); } catch { /* essai suivant */ }
      }
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try { return next(specifier + '.ts', context); } catch { /* pas un fichier .ts : résolution normale */ }
    }
    return next(specifier, context);
  },
});
