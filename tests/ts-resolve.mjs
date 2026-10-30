// Tests : résout les imports relatifs sans extension du code TypeScript ("./types" -> "./types.ts"),
// comme le fait le compilateur de l'application. Aucune dépendance.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try { return next(specifier + '.ts', context); } catch { /* pas un fichier .ts : résolution normale */ }
    }
    return next(specifier, context);
  },
});
