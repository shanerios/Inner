module.exports = function removeConsoleInProduction({ types: t }) {
  return {
    name: 'remove-console-in-production',
    visitor: {
      Program(path, state) {
        const filename = state.filename || state.file?.opts?.filename || '';
        state.skipConsoleRemoval = filename.split(/[\\/]/).includes('node_modules');
      },
      CallExpression(path, state) {
        if (state.skipConsoleRemoval) {
          return;
        }

        const callee = path.node.callee;
        if (
          t.isMemberExpression(callee) &&
          t.isIdentifier(callee.object, { name: 'console' }) &&
          !path.scope.hasBinding('console')
        ) {
          if (path.parentPath.isExpressionStatement()) {
            path.parentPath.remove();
            return;
          }

          // An expression cannot be removed from a ternary, logical expression,
          // argument list, etc. Replace it with the console method's return value.
          path.replaceWith(t.unaryExpression('void', t.numericLiteral(0)));
        }
      },
    },
  };
};
